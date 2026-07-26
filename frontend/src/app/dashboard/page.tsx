"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import AppShell from "@/components/AppShell";
import SmartDashboardCenter from "@/components/dashboard/SmartDashboardCenter";

import {
  apiFetch,
  getCurrentUser,
  getFlashcards,
  getLearningInsights,
  getNotes,
  getPDFs,
  getQuizzes,
  getSmartDashboard,
  getStudyRooms,
  type SmartDashboardResponse,
} from "@/lib/api";
import {
  getSavedProjectRoomId,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";

import { resolveStudyCommand } from "@/lib/studyCommandRouter";

type TokenPayload = {
  sub?: string;
  user_id?: number;
  full_name?: string;
  exp?: number;
};

type StudyRoom = {
  id: number;
  name: string;
  subject: string;
  description?: string | null;
};

type PDFDocument = {
  id: number;
  original_filename: string;
  file_size?: number;
  created_at?: string;
};

type NoteItem = {
  id: number;
  title: string;
  content: string;
  study_room_id: number;
  owner_id?: number;
  created_at?: string;
};

type FlashcardItem = {
  id: number;
  question: string;
  answer: string;
  study_room_id: number;
};

type QuizQuestion = {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
};

type LearningTopic = {
  subject: string;
  reviewed: number;
  correct: number;
  wrong: number;
  accuracy: number;
};

type LearningTrend = {
  date: string;
  reviews: number;
  average_confidence: number;
  correct: number;
  wrong: number;
};

type LearningInsights = {
  learning_score: number;
  learning_index: number;
  learning_index_today_change: number;
  learning_index_message: string;
  average_confidence: number;
  cards_reviewed_today: number;
  correct_today: number;
  wrong_today: number;
  study_streak: number;
  weak_topics: LearningTopic[];
  strong_topics: LearningTopic[];
  ai_recommendation: string;
  trend: LearningTrend[];
  has_learning_data?: boolean;
  all_time_reviews?: number;
  reviews_last_7_days?: number;
  total_learning_events?: number;
  last_activity_at?: string | null;
  score_basis?: string;
};

type SystemStats = {
  pdfs: number;
  notes: number;
  flashcards: number;
  quizzes: number;
  rooms: number;
};

type ContinueItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  href: string;
  percent: number;
};

function shouldResolveAsStudyCommand(
  value: string,
) {
  const text = value.trim();

  if (!text) {
    return false;
  }

  if (
    text.length > 180 ||
    text.includes("\n")
  ) {
    return false;
  }

  const codePattern =
    /```|^#!|bash\s+<<|\b(set|cd|git|npm|npx|python|python3|curl|grep|sed|cat|echo|sudo|systemctl)\b|[{};$]|=>|\\$/im;

  return !codePattern.test(text);
}

function parseJwt(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");

    if (parts.length !== 3 || !parts[1]) {
      return null;
    }

    const base64Url = parts[1];
    const base64 = base64Url
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), "=");

    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

    const jsonPayload = new TextDecoder().decode(bytes);

    return JSON.parse(jsonPayload) as TokenPayload;
  } catch (error) {
    console.error("Could not decode login token.", error);
    return null;
  }
}

function getTimeGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getRoomAwareHref(path: string, roomId: number | null) {
  if (!roomId) return path;
  return `${path}?roomId=${roomId}`;
}

function getProjectQuizCount(roomId: number | null) {
  if (!roomId || typeof window === "undefined") return 0;

  try {
    const raw = window.localStorage.getItem(
      `studysnap_quiz_questions_room_${roomId}`,
    );

    if (!raw) return 0;

    const parsed = JSON.parse(raw) as QuizQuestion[];
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function formatTimeAgo(value?: string) {
  if (!value) return "Recently added";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently added";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function getPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

type ActivityItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  href: string;
  label: string;
};


type ApiPlannerItem = {
  id: number;
  user_id: number;
  study_room_id: number | null;
  title: string;
  subject: string;
  description: string | null;
  scheduled_for: string;
  duration_minutes: number;
  priority: "Low" | "Medium" | "High";
  status: "Planned" | "Done";
  created_at: string;
  updated_at: string;
};

type DashboardSettings = {
  daily_goal?: string;
};

type DailyGoalInsights = {
  cards_reviewed_today?: number;
  has_learning_data?: boolean;
  learning_score?: number;
};

type DailyGoalProgress = {
  percent: number;
  label: string;
  caption: string;
};

function clampPercent(value: number) {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(value)
    )
  );
}

function getDailyGoalProgress(
  dailyGoal: string,
  insights:
    DailyGoalInsights |
    null |
    undefined
): DailyGoalProgress {
  const goal = dailyGoal.trim();

  const cardTarget =
    goal.match(
      /(\d+)\s*(?:flashcards?|concept\s*cards?|cards?|questions?|quiz\s*questions?)/i
    );

  if (cardTarget) {
    const target = Math.max(
      1,
      Number(cardTarget[1])
    );

    const completed =
      insights
        ?.cards_reviewed_today ||
      0;

    return {
      percent: clampPercent(
        (completed / target) * 100
      ),
      label: "Daily Goal",
      caption:
        `${completed} of ${target} reviews today`,
    };
  }

  if (
    insights?.has_learning_data
  ) {
    return {
      percent: clampPercent(
        insights.learning_score ||
        0
      ),
      label: "Learning Score",
      caption:
        goal ||
        "Based on your real review activity",
    };
  }

  return {
    percent: 0,
    label: "Daily Goal",
    caption:
      goal ||
      "Set your daily goal in Settings",
  };
}

function selectNextPlannerItem(
  items: ApiPlannerItem[]
) {
  const planned = items.filter(
    (item) =>
      item.status === "Planned"
  );

  if (!planned.length) {
    return null;
  }

  const now = Date.now();

  const future = planned
    .filter((item) => {
      const timestamp =
        new Date(
          item.scheduled_for
        ).getTime();

      return (
        !Number.isNaN(
          timestamp
        ) &&
        timestamp >= now - 60_000
      );
    })
    .sort(
      (first, second) =>
        new Date(
          first.scheduled_for
        ).getTime() -
        new Date(
          second.scheduled_for
        ).getTime()
    );

  if (future.length) {
    return future[0];
  }

  return [...planned].sort(
    (first, second) =>
      new Date(
        second.scheduled_for
      ).getTime() -
      new Date(
        first.scheduled_for
      ).getTime()
  )[0];
}

function formatPlannerDateTime(
  value: string
) {
  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Scheduled session";
  }

  const difference =
    date.getTime() -
    Date.now();

  const absoluteMinutes =
    Math.max(
      1,
      Math.round(
        Math.abs(
          difference
        ) / 60_000
      )
    );

  if (difference >= 0) {
    if (
      absoluteMinutes < 60
    ) {
      return (
        `Starts in ` +
        `${absoluteMinutes} min`
      );
    }

    if (
      absoluteMinutes < 1_440
    ) {
      const hours =
        Math.round(
          absoluteMinutes /
          60
        );

      return (
        `Starts in ` +
        `${hours} hr`
      );
    }
  } else if (
    absoluteMinutes < 1_440
  ) {
    return "Ready to continue";
  }

  return date.toLocaleString(
    undefined,
    {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  );
}

function getPlannerActionHref(
  item: ApiPlannerItem,
  action: "start" | "edit"
) {
  const params =
    new URLSearchParams();

  params.set(
    action === "start"
      ? "startPlanId"
      : "editPlanId",
    String(item.id)
  );

  if (
    typeof item.study_room_id ===
    "number"
  ) {
    params.set(
      "roomId",
      String(
        item.study_room_id
      )
    );
  }

  return (
    `/planner?` +
    params.toString()
  );
}

function GeneralAIStartCard({
  prompt,
  onPromptChange,
  onSubmit,
  activeRoomId,
  displayName,
  greetingEmoji,
  dailyGoal,
  nextSessionSummary,
}: {
  prompt: string;
  onPromptChange: (
    value: string
  ) => void;
  onSubmit: (
    event:
      FormEvent<HTMLFormElement>
  ) => void;
  activeRoomId:
    number |
    null;
  displayName: string;
  greetingEmoji: string;
  dailyGoal:
    DailyGoalProgress;
  nextSessionSummary:
    string |
    null;
}) {
  const learnerName =
    displayName.trim() ||
    "Learner";

  const goalDegrees =
    clampPercent(
      dailyGoal.percent
    ) * 3.6;

  const addMaterialHref =
    activeRoomId
      ? (
          "/general-ai?" +
          "new=1&roomId=" +
          activeRoomId
        )
      : "/general-ai?new=1";

  return (
    <section className="relative overflow-hidden rounded-[1.85rem] border border-white/[0.085] bg-[radial-gradient(circle_at_top_right,rgba(214,184,74,0.10),transparent_31%),linear-gradient(145deg,rgba(17,21,25,0.985),rgba(3,5,7,0.998))] p-4 shadow-[0_26px_80px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.055)] sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full border border-[#d6b84a]/10 bg-[#d6b84a]/[0.025] blur-3xl"
      />

      <div className="relative flex items-start gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[1.15rem] border border-white/[0.11] bg-[linear-gradient(145deg,rgba(30,33,35,0.98),rgba(8,10,12,0.99))] text-2xl font-black text-[#d8ca91] shadow-[0_14px_40px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.07)]">
          S
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a99b68]">
            Your study command center
          </p>

          <h1 className="mt-2 text-[1.45rem] font-black leading-tight tracking-[-0.03em] text-white sm:text-[1.8rem]">
            Welcome back,{" "}
            {learnerName}{" "}
            {greetingEmoji}
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            {nextSessionSummary ||
              "Your connected study workspace is ready."}
          </p>

          {activeRoomId ? (
            <span className="mt-3 inline-flex rounded-full border border-[#d6b84a]/15 bg-[#d6b84a]/[0.055] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.13em] text-[#d8ca91]">
              Current room connected
            </span>
          ) : null}
        </div>

        <div className="hidden shrink-0 sm:block">
          <div
            className="grid h-28 w-28 place-items-center rounded-full p-[6px] shadow-[0_0_32px_rgba(214,184,74,0.12)]"
            style={{
              background:
                `conic-gradient(#d6b84a ${goalDegrees}deg, rgba(255,255,255,0.075) 0deg)`,
            }}
          >
            <div className="grid h-full w-full place-items-center rounded-full border border-white/[0.07] bg-[#080b0e] text-center">
              <div>
                <p className="text-2xl font-black text-white">
                  {dailyGoal.percent}%
                </p>

                <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#b9aa70]">
                  {dailyGoal.label}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-5 grid gap-3 rounded-[1.35rem] border border-white/[0.075] bg-black/20 p-3 sm:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#b9aa70]">
              {dailyGoal.label}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              {dailyGoal.caption}
            </p>
          </div>

          <p className="text-2xl font-black text-white">
            {dailyGoal.percent}%
          </p>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full bg-[#d6b84a] transition-[width]"
            style={{
              width:
                `${dailyGoal.percent}%`,
            }}
          />
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="relative mt-5 rounded-[1.35rem] border border-white/[0.09] bg-[#050708]/95 p-2 shadow-[0_18px_45px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.035)] transition focus-within:border-[#d6b84a]/35 focus-within:bg-[#07090b]"
      >
        <div className="flex items-center gap-2">
          <Link
            href={addMaterialHref}
            aria-label="Open StudySnap AI with materials"
            title="Add study material"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[0.95rem] border border-white/[0.09] bg-white/[0.04] text-xl font-light text-slate-300 transition hover:border-white/[0.15] hover:bg-white/[0.075] hover:text-white"
          >
            +
          </Link>

          <input
            value={prompt}
            onChange={(event) =>
              onPromptChange(
                event.target.value
              )
            }
            placeholder="Ask StudySnap anything..."
            aria-label="Ask StudySnap"
            className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm font-medium text-white outline-none placeholder:text-slate-600 sm:text-[15px]"
          />

          <button
            type="submit"
            aria-label="Send to StudySnap"
            title="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[0.95rem] border border-[#d6b84a]/30 bg-[#b49b4d] text-lg font-black text-[#090a08] shadow-[0_10px_25px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.22)] transition hover:bg-[#c2aa59] active:scale-95"
          >
            →
          </button>
        </div>
      </form>

      <div className="relative mt-3 grid grid-cols-3 gap-2">
        <Link
          href={getRoomAwareHref(
            "/notes",
            activeRoomId,
          )}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.075] bg-white/[0.028] px-2 py-2.5 text-center text-[11px] font-black text-slate-300 transition hover:border-[#d6b84a]/20 hover:bg-white/[0.06] hover:text-white sm:px-3 sm:text-xs"
        >
          <span className="text-[#d8ca91]">
            ▣
          </span>

          Create Note
        </Link>

        <Link
          href={getRoomAwareHref(
            "/quizzes",
            activeRoomId,
          )}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.075] bg-white/[0.028] px-2 py-2.5 text-center text-[11px] font-black text-slate-300 transition hover:border-[#d6b84a]/20 hover:bg-white/[0.06] hover:text-white sm:px-3 sm:text-xs"
        >
          <span className="text-[#d6b84a]">
            ▤
          </span>

          Start Quiz
        </Link>

        <Link
          href={getRoomAwareHref(
            "/planner",
            activeRoomId,
          )}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.075] bg-white/[0.028] px-2 py-2.5 text-center text-[11px] font-black text-slate-300 transition hover:border-[#d6b84a]/20 hover:bg-white/[0.06] hover:text-white sm:px-3 sm:text-xs"
        >
          <span className="text-[#d8ca91]">
            ◫
          </span>

          Add to Planner
        </Link>
      </div>

      <p className="relative mt-3 hidden text-right text-[10px] font-bold text-slate-600 sm:block">
        {dailyGoal.caption}
      </p>
    </section>
  );
}

function NextSessionCard({
  item,
  busy,
  onSnooze,
}: {
  item: ApiPlannerItem;
  busy: boolean;
  onSnooze: (
    item: ApiPlannerItem
  ) => void;
}) {
  return (
    <section className="studysnap-glass-panel overflow-hidden rounded-[1.55rem] border border-[#d6b84a]/20 bg-[linear-gradient(145deg,rgba(18,22,25,0.94),rgba(4,7,9,0.96))] shadow-[0_20px_58px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.045)]">
      <div className="h-px bg-gradient-to-r from-transparent via-[#d6b84a]/70 to-transparent" />

      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full bg-[#d6b84a] shadow-[0_0_18px_rgba(214,184,74,0.55)]"
              />

              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#b9aa70]">
                Next Session
              </p>
            </div>

            <h2 className="mt-3 truncate text-lg font-black text-white sm:text-xl">
              {item.title}
            </h2>

            <p className="mt-1.5 text-sm text-slate-400">
              {item.subject}
              {" · "}
              {item.duration_minutes}
              {" min · "}
              {formatPlannerDateTime(
                item.scheduled_for
              )}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0">
            <Link
              href={getPlannerActionHref(
                item,
                "start"
              )}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#d6b84a]/30 bg-[#b49b4d] px-4 text-xs font-black text-[#090a08] transition hover:bg-[#c2aa59]"
            >
              Start
            </Link>

            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onSnooze(item)
              }
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-xs font-black text-slate-200 transition hover:border-white/[0.15] hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? "Saving"
                : "Snooze"}
            </button>

            <Link
              href={getPlannerActionHref(
                item,
                "edit"
              )}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-xs font-black text-slate-200 transition hover:border-white/[0.15] hover:bg-white/[0.07]"
            >
              Edit
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retained for the upcoming expanded dashboard view.
function ContinueLearningCard({ items }: { items: ContinueItem[] }) {
  return (
    <section className="studysnap-glass-panel rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] shadow-[0_20px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-white">
            <span className="text-[#79aeb5]">📖</span>
            Continue Learning
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Pick up where you stopped.
          </p>
        </div>

        <Link
          href="/progress"
          className="text-xs font-black text-slate-300 hover:text-white"
        >
          View all
        </Link>
      </div>

      <div className="mt-4 space-y-2">
        {items.length ? (
          items.map((item, index) => (
            <Link
              key={item.id}
              href={item.href}
              className={`group gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 transition hover:border-white/[0.13] hover:bg-white/[0.045] sm:grid-cols-[minmax(0,1fr)_190px] sm:items-center ${
                index >= 2 ? "hidden sm:grid" : "grid"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-lg">
                  {item.icon}
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">
                    {item.title}
                  </p>

                  <p className="mt-1 truncate text-xs text-slate-500">
                    {item.subtitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#756b4d]"
                    style={{
                      width: `${item.percent}%`,
                    }}
                  />
                </div>

                <span className="w-10 text-right text-xs font-black text-slate-300">
                  {item.percent}%
                </span>

                <span className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-black text-slate-200 group-hover:border-white/[0.14] group-hover:text-white">
                  Continue
                </span>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center">
            <p className="text-sm font-bold text-white">
              Nothing to continue yet
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              Upload study material, create a note, or start a quiz.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retained for the upcoming expanded dashboard view.
function RecentActivityCard({ items }: { items: ActivityItem[] }) {
  return (
    <section className="studysnap-glass-panel rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] shadow-[0_20px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white">Recent Activity</h2>

          <p className="mt-1 text-xs text-slate-500">
            Your latest learning work.
          </p>
        </div>

        <Link
          href="/study-rooms"
          className="text-xs font-black text-slate-300 hover:text-white"
        >
          View rooms
        </Link>
      </div>

      <div className="mt-4 divide-y divide-white/[0.07] overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
        {items.length ? (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center gap-3 px-3 py-3 transition hover:bg-white/[0.028]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-base">
                {item.icon}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">
                  {item.title}
                </p>

                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {item.subtitle}
                </p>
              </div>

              <span className="shrink-0 rounded-lg border border-white/[0.07] px-2 py-1 text-[10px] font-black text-slate-400">
                {item.label}
              </span>
            </Link>
          ))
        ) : (
          <p className="p-5 text-center text-sm text-slate-500">
            Your recent work will appear here.
          </p>
        )}
      </div>
    </section>
  );
}

function DashboardRightPanel({
  activeRoomId,
  pdfs,
  notesCount,
  flashcardsCount,
  quizCount,
  streak,
  learningScore,
  overallProgress,
  aiRecommendation,
}: {
  activeRoomId: number | null;
  pdfs: PDFDocument[];
  notesCount: number;
  flashcardsCount: number;
  quizCount: number;
  streak: number;
  learningScore: number;
  overallProgress: number;
  aiRecommendation: string;
}) {
  const roomHref = activeRoomId
    ? `/study-rooms/${activeRoomId}`
    : "/study-rooms";

  const displayScore = learningScore > 0 ? learningScore : overallProgress;

  const focusItems = [
    pdfs[0]
      ? {
          title: `Continue ${pdfs[0].original_filename}`,
          href: roomHref,
        }
      : null,
    notesCount > 0
      ? {
          title: "Review your latest note",
          href: getRoomAwareHref("/notes", activeRoomId),
        }
      : null,
    flashcardsCount > 0
      ? {
          title: "Review Concept Cards",
          href: getRoomAwareHref("/flashcards", activeRoomId),
        }
      : null,
    {
      title: "Complete a short quiz",
      href: getRoomAwareHref("/quizzes", activeRoomId),
    },
  ]
    .filter(
      (
        item,
      ): item is {
        title: string;
        href: string;
      } => item !== null,
    )
    .slice(0, 4);

  const progressRows = [
    {
      label: "PDFs",
      value: pdfs.length,
      percent: getPercent(pdfs.length, 5),
    },
    {
      label: "Notes",
      value: notesCount,
      percent: getPercent(notesCount, 15),
    },
    {
      label: "Concept Cards",
      value: flashcardsCount,
      percent: getPercent(flashcardsCount, 60),
    },
    {
      label: "Quizzes",
      value: quizCount,
      percent: getPercent(quizCount, 10),
    },
  ];

  return (
    <div className="space-y-3">
      <details className="studysnap-glass-panel group overflow-hidden rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] shadow-[0_20px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl xl:hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-white">Today&apos;s plan</p>

            <p className="mt-0.5 text-xs text-slate-500">
              Your recommended next study steps
            </p>
          </div>

          <span className="flex shrink-0 items-center gap-2 text-xs font-black text-slate-300">
            {focusItems.length} steps
            <span className="text-lg text-slate-500">⌄</span>
          </span>
        </summary>

        <div className="border-t border-white/[0.07] px-3 py-2">
          {focusItems.map((item, index) => (
            <Link
              key={`mobile-${item.title}`}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-2 py-3 transition active:bg-white/[0.035]"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/15 text-[10px] font-black text-slate-400">
                {index + 1}
              </span>

              <span
                className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200"
                title={item.title}
              >
                {item.title}
              </span>

              <span className="text-slate-600">›</span>
            </Link>
          ))}
        </div>
      </details>

      <section className="studysnap-glass-panel hidden rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] shadow-[0_20px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl p-4 xl:block">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-white">Today&apos;s Focus</h2>

          <span className="text-xs font-black text-slate-300">
            {focusItems.length} steps
          </span>
        </div>

        <div className="mt-4 space-y-1">
          {focusItems.map((item, index) => (
            <Link
              key={item.title}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/[0.028]"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/15 text-[10px] font-black text-slate-400">
                {index + 1}
              </span>

              <span
                className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200"
                title={item.title}
              >
                {item.title}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <Link
        href="/progress"
        className="flex min-h-16 items-center justify-between gap-4 rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] shadow-[0_20px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl px-4 py-3 transition active:bg-white/[0.045] xl:hidden"
      >
        <div className="min-w-0">
          <p className="text-sm font-black text-white">Your progress</p>

          <p className="mt-1 text-xs text-slate-500">
            {streak} day{streak === 1 ? "" : "s"} streak
          </p>
        </div>

        <span className="flex shrink-0 items-center gap-2">
          <span className="text-lg font-black text-slate-300">
            {displayScore}%
          </span>

          <span className="text-slate-500">›</span>
        </span>
      </Link>

      <section className="studysnap-glass-panel hidden overflow-hidden rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] shadow-[0_20px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl xl:block">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-black text-white">Progress</h2>

            <p className="mt-0.5 text-[11px] text-slate-500">
              Your current study activity
            </p>
          </div>

          <Link
            href="/progress"
            className="shrink-0 text-xs font-black text-slate-300 transition hover:text-white"
          >
            View details
          </Link>
        </div>

        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-4 p-4">
          <div className="flex flex-col justify-center rounded-xl border border-white/[0.065] bg-white/[0.025] px-3 py-4">
            <div className="flex items-end gap-1.5">
              <span className="text-3xl font-black text-white">{streak}</span>

              <span className="pb-1 text-xs font-bold text-slate-500">
                day{streak === 1 ? "" : "s"}
              </span>
            </div>

            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Streak
            </p>
          </div>

          <div className="min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-300">
                Learning progress
              </span>

              <span className="text-sm font-black text-white">
                {displayScore}%
              </span>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#756b4d]"
                style={{
                  width: `${displayScore}%`,
                }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {progressRows.map((row) => (
                <div
                  key={row.label}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-white/[0.055] bg-white/[0.02] px-2.5 py-2"
                >
                  <p className="min-w-0 truncate text-[10px] font-bold text-slate-500">
                    {row.label}
                  </p>

                  <p className="shrink-0 text-sm font-black text-slate-200">
                    {row.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-4 py-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-xs text-[#b9a763]">S</span>

            <p className="line-clamp-2 text-xs leading-5 text-slate-400">
              {aiRecommendation}
            </p>
          </div>
        </div>
      </section>

      <section className="studysnap-glass-panel rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] shadow-[0_20px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-white">Recent PDFs</h2>

          <Link href={roomHref} className="text-xs font-black text-slate-300">
            View room
          </Link>
        </div>

        <div className="mt-3 space-y-2">
          {pdfs.length ? (
            pdfs.slice(0, 3).map((pdf) => (
              <Link
                key={pdf.id}
                href={roomHref}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.028]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-400/10 text-base">
                  📄
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-xs font-bold text-white"
                    title={pdf.original_filename}
                  >
                    {pdf.original_filename}
                  </p>

                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {formatTimeAgo(pdf.created_at)}
                  </p>
                </div>
              </Link>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs leading-5 text-slate-500">
              Uploaded PDFs will appear here.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const [generalAiPrompt, setGeneralAiPrompt] = useState("");
  const [plannerItems, setPlannerItems] =
    useState<ApiPlannerItem[]>([]);
  const [dailyGoal, setDailyGoal] =
    useState("");
  const [plannerActionBusy, setPlannerActionBusy] =
    useState(false);

  const [checked, setChecked] = useState(false);
  const [fullName, setFullName] = useState("");
  const [greetingEmoji, setGreetingEmoji] = useState("👋");
  const [learningInsights, setLearningInsights] =
    useState<LearningInsights | null>(null);
  const [, setLearningInsightsError] = useState("");

  const [smartDashboard, setSmartDashboard] =
    useState<SmartDashboardResponse | null>(null);
  const [smartDashboardLoading, setSmartDashboardLoading] = useState(true);
  const [smartDashboardLoadingMore, setSmartDashboardLoadingMore] =
    useState(false);
  const [smartDashboardError, setSmartDashboardError] = useState("");

  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [pdfs, setPdfs] = useState<PDFDocument[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [quizCount, setQuizCount] = useState(0);
  const [allStats, setAllStats] = useState<SystemStats>({
    pdfs: 0,
    notes: 0,
    flashcards: 0,
    quizzes: 0,
    rooms: 0,
  });
  const [insights, setInsights] = useState<LearningInsights | null>(null);

  const loadSmartDashboard = useCallback(async () => {
    setSmartDashboardLoading(true);
    setSmartDashboardError("");

    try {
      const data = await getSmartDashboard({
        limit: 3,
      });

      setSmartDashboard(data);
    } catch (error) {
      console.error("Could not load smart dashboard.", error);

      setSmartDashboardError(
        "Live dashboard updates are temporarily unavailable.",
      );
    } finally {
      setSmartDashboardLoading(false);
    }
  }, []);

  const loadMoreSmartDashboard = useCallback(async () => {
    const cursor = smartDashboard?.next_cursor;

    if (!cursor || smartDashboardLoadingMore) {
      return;
    }

    setSmartDashboardLoadingMore(true);
    setSmartDashboardError("");

    try {
      const nextPage = await getSmartDashboard({
        limit: 20,
        cursor,
      });

      setSmartDashboard((current) => {
        if (!current) {
          return nextPage;
        }

        const existingIds = new Set(current.feed.map((item) => item.id));

        const newItems = nextPage.feed.filter(
          (item) => !existingIds.has(item.id),
        );

        return {
          ...current,
          generated_at: nextPage.generated_at,
          feed: [...current.feed, ...newItems],
          next_cursor: nextPage.next_cursor,
          has_more: nextPage.has_more,
        };
      });
    } catch (error) {
      console.error("Could not load older dashboard activity.", error);

      setSmartDashboardError("Older learning activity could not be loaded.");
    } finally {
      setSmartDashboardLoadingMore(false);
    }
  }, [smartDashboard?.next_cursor, smartDashboardLoadingMore]);

  useEffect(() => {
    if (!checked) {
      return;
    }

    let cancelled = false;

    async function loadPlannerAndGoal() {
      try {
        const [
          plansResponse,
          settingsResponse,
        ] = await Promise.all([
          apiFetch(
            "/api/planner"
          ) as Promise<
            ApiPlannerItem[]
          >,
          apiFetch(
            "/api/users/me/settings"
          ) as Promise<
            DashboardSettings
          >,
        ]);

        if (cancelled) {
          return;
        }

        setPlannerItems(
          Array.isArray(
            plansResponse
          )
            ? plansResponse
            : []
        );

        setDailyGoal(
          typeof settingsResponse
            ?.daily_goal ===
            "string"
            ? settingsResponse
                .daily_goal
            : ""
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error(
          "Could not load dashboard planner data.",
          error
        );

        setPlannerItems([]);
      }
    }

    void loadPlannerAndGoal();

    return () => {
      cancelled = true;
    };
  }, [checked]);

  useEffect(() => {
    if (!checked) {
      return;
    }

    function refreshDashboard() {
      void loadSmartDashboard();
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void loadSmartDashboard();
      }
    }

    queueMicrotask(
      () => void loadSmartDashboard(),
    );

    window.addEventListener("studysnap:dashboard-refresh", refreshDashboard);

    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener(
        "studysnap:dashboard-refresh",
        refreshDashboard,
      );

      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [checked, loadSmartDashboard]);

  useEffect(() => {
    let cancelled = false;

    async function loadLearningInsights() {
      try {
        setLearningInsightsError("");

        const data = (await getLearningInsights()) as LearningInsights;

        if (cancelled) return;

        setLearningInsights(data);
        setInsights(data);
      } catch {
        if (cancelled) return;

        setLearningInsights(null);
        setLearningInsightsError("Live progress is not available yet.");
      }
    }

    function refreshFromLearningActivity() {
      void loadLearningInsights();
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void loadLearningInsights();
      }
    }

    function refreshFromStorage(event: StorageEvent) {
      if (event.key === "studysnap:last-learning-progress-update") {
        void loadLearningInsights();
      }
    }

    void loadLearningInsights();

    window.addEventListener(
      "studysnap:learning-progress-updated",
      refreshFromLearningActivity,
    );

    window.addEventListener("focus", refreshFromLearningActivity);

    window.addEventListener("storage", refreshFromStorage);

    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;

      window.removeEventListener(
        "studysnap:learning-progress-updated",
        refreshFromLearningActivity,
      );

      window.removeEventListener("focus", refreshFromLearningActivity);

      window.removeEventListener("storage", refreshFromStorage);

      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    const payload = parseJwt(token);

    const initialName =
      payload?.full_name ||
      payload?.sub?.split("@")[0] ||
      "Student";

    queueMicrotask(() => {
      setFullName(initialName);
      setChecked(true);
    });

    async function loadCurrentProfile() {
      try {
        const profile = await getCurrentUser();
        setFullName(
          profile.full_name || profile.email?.split("@")[0] || "Student",
        );
        setGreetingEmoji(profile.greeting_emoji ?? "");

        if (typeof window !== "undefined") {
          localStorage.setItem("studysnap_user", JSON.stringify(profile));
        }
      } catch (error) {
        console.error(error);
      }
    }

    async function loadDashboardFoundation() {
      try {
        const [roomData, learningData] = await Promise.all([
          getStudyRooms(),
          getLearningInsights().catch(() => null),
        ]);

        const roomList: StudyRoom[] = Array.isArray(roomData) ? roomData : [];
        setRooms(roomList);

        const savedRoomId = getSavedProjectRoomId();
        const savedRoomExists = roomList.some(
          (room) => room.id === savedRoomId,
        );
        const nextRoomId = savedRoomExists
          ? savedRoomId
          : roomList[0]?.id || null;

        if (nextRoomId !== null) {
          saveProjectRoomId(nextRoomId);
        }

        setActiveRoomId(nextRoomId);
        setInsights(learningData as LearningInsights | null);
      } catch {
        setRooms([]);
        setActiveRoomId(null);
      }
    }

    loadCurrentProfile();
    loadDashboardFoundation();
  }, []);

  useEffect(() => {
    const roomId = activeRoomId;

    if (roomId === null) {
      queueMicrotask(() => {
        setPdfs([]);
        setNotes([]);
        setFlashcards([]);
        setQuizCount(0);
      });
      return;
    }

    const safeRoomId = roomId;

    async function loadActiveRoomData() {
      try {
        const [pdfData, noteData, flashcardData, quizData] = await Promise.all([
          getPDFs(safeRoomId),
          getNotes(safeRoomId),
          getFlashcards(safeRoomId),
          getQuizzes(safeRoomId).catch(() => []),
        ]);

        setPdfs(Array.isArray(pdfData) ? pdfData : []);
        setNotes(Array.isArray(noteData) ? noteData : []);
        setFlashcards(Array.isArray(flashcardData) ? flashcardData : []);
        setQuizCount(
          Array.isArray(quizData)
            ? quizData.length
            : getProjectQuizCount(safeRoomId),
        );
      } catch {
        setPdfs([]);
        setNotes([]);
        setFlashcards([]);
        setQuizCount(getProjectQuizCount(safeRoomId));
      }
    }

    loadActiveRoomData();
  }, [activeRoomId]);

  useEffect(() => {
    if (!rooms.length) {
      queueMicrotask(() => {
        setAllStats({
          pdfs: 0,
          notes: 0,
          flashcards: 0,
          quizzes: 0,
          rooms: 0,
        });
      });
      return;
    }

    let mounted = true;

    async function loadAllSystemStats() {
      const roomStats = await Promise.all(
        rooms.map(async (room) => {
          const [pdfData, noteData, flashcardData, quizData] =
            await Promise.all([
              getPDFs(room.id).catch(() => []),
              getNotes(room.id).catch(() => []),
              getFlashcards(room.id).catch(() => []),
              getQuizzes(room.id).catch(() => []),
            ]);

          return {
            pdfs: Array.isArray(pdfData) ? pdfData.length : 0,
            notes: Array.isArray(noteData) ? noteData.length : 0,
            flashcards: Array.isArray(flashcardData) ? flashcardData.length : 0,
            quizzes: Array.isArray(quizData) ? quizData.length : 0,
          };
        }),
      );

      if (!mounted) return;

      setAllStats({
        pdfs: roomStats.reduce((sum, item) => sum + item.pdfs, 0),
        notes: roomStats.reduce((sum, item) => sum + item.notes, 0),
        flashcards: roomStats.reduce((sum, item) => sum + item.flashcards, 0),
        quizzes: roomStats.reduce((sum, item) => sum + item.quizzes, 0),
        rooms: rooms.length,
      });
    }

    loadAllSystemStats();

    return () => {
      mounted = false;
    };
  }, [rooms]);

  const displayName = useMemo(() => {
    if (!fullName) return "Student";
    return fullName.split(" ")[0];
  }, [fullName]);

  const activeRoom = useMemo(() => {
    return rooms.find((room) => room.id === activeRoomId) || null;
  }, [rooms, activeRoomId]);

  const roomTitle = activeRoom?.name || "StudySnap Dashboard";
  const roomSubject = activeRoom?.subject || "All Subjects";

  const overallProgress = useMemo(() => {
    return Math.min(
      100,
      Math.round(
        ((Math.min(pdfs.length, 5) / 5 +
          Math.min(notes.length, 15) / 15 +
          Math.min(flashcards.length, 60) / 60 +
          Math.min(quizCount, 10) / 10) /
          4) *
          100,
      ),
    );
  }, [flashcards.length, notes.length, pdfs.length, quizCount]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Prepared for the retained expanded dashboard view.
  const continueItems = useMemo<ContinueItem[]>(() => {
    if (!activeRoomId) return [];

    const pdfItems = pdfs.slice(0, 1).map((pdf) => ({
      id: `pdf-${pdf.id}`,
      title: pdf.original_filename,
      subtitle: `Uploaded ${formatTimeAgo(pdf.created_at)}`,
      icon: "📄",
      href: `/study-rooms/${activeRoomId}`,
      percent: 75,
    }));

    const noteItems = notes.slice(0, 1).map((note) => ({
      id: `note-${note.id}`,
      title: note.title,
      subtitle: `Edited ${formatTimeAgo(note.created_at)}`,
      icon: "📝",
      href: `/notes?roomId=${activeRoomId}&noteId=${note.id}`,
      percent: 80,
    }));

    const flashcardItems = flashcards.length
      ? [
          {
            id: "flashcards-active",
            title: `${activeRoom?.subject || "Project"} Flashcards Set 1`,
            subtitle: `${flashcards.length} card${flashcards.length === 1 ? "" : "s"} ready`,
            icon: "📘",
            href: `/flashcards?roomId=${activeRoomId}`,
            percent: 60,
          },
        ]
      : [];

    return [...pdfItems, ...noteItems, ...flashcardItems].slice(0, 3);
  }, [activeRoom, activeRoomId, flashcards, notes, pdfs]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Prepared for the retained expanded dashboard view.
  const recentActivityItems = useMemo<ActivityItem[]>(() => {
    if (!activeRoomId) {
      return [];
    }

    const items: ActivityItem[] = [];

    pdfs.slice(0, 2).forEach((pdf) => {
      items.push({
        id: `activity-pdf-${pdf.id}`,
        title: pdf.original_filename,
        subtitle: `Uploaded ${formatTimeAgo(pdf.created_at)}`,
        icon: "📄",
        href: `/study-rooms/${activeRoomId}`,
        label: "PDF",
      });
    });

    notes.slice(0, 2).forEach((note) => {
      items.push({
        id: `activity-note-${note.id}`,
        title: note.title,
        subtitle: `Edited ${formatTimeAgo(note.created_at)}`,
        icon: "📝",
        href: `/notes?roomId=${activeRoomId}&noteId=${note.id}`,
        label: "Note",
      });
    });

    if (flashcards.length) {
      items.push({
        id: "activity-concept-cards",
        title: `${activeRoom?.subject || "Room"} Concept Cards`,
        subtitle: `${flashcards.length} card${
          flashcards.length === 1 ? "" : "s"
        } ready`,
        icon: "◫",
        href: `/flashcards?roomId=${activeRoomId}`,
        label: "Cards",
      });
    }

    if (quizCount) {
      items.push({
        id: "activity-quizzes",
        title: `${activeRoom?.subject || "Room"} quizzes`,
        subtitle: `${quizCount} quiz${quizCount === 1 ? "" : "zes"} available`,
        icon: "▤",
        href: `/quizzes?roomId=${activeRoomId}`,
        label: "Quiz",
      });
    }

    return items.slice(0, 6);
  }, [activeRoom, activeRoomId, flashcards, notes, pdfs, quizCount]);

  async function handleSnoozeNextSession(
    item: ApiPlannerItem
  ) {
    if (plannerActionBusy) {
      return;
    }

    setPlannerActionBusy(true);

    try {
      const currentTime =
        new Date(
          item.scheduled_for
        ).getTime();

      const baseTime =
        Number.isNaN(
          currentTime
        )
          ? Date.now()
          : Math.max(
              currentTime,
              Date.now()
            );

      const scheduledFor =
        new Date(
          baseTime +
          10 * 60_000
        ).toISOString();

      const updated =
        await apiFetch(
          `/api/planner/${item.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              scheduled_for:
                scheduledFor,
            }),
          }
        ) as ApiPlannerItem;

      setPlannerItems(
        (current) =>
          current.map(
            (plan) =>
              plan.id ===
              updated.id
                ? updated
                : plan
          )
      );

      window.dispatchEvent(
        new CustomEvent(
          "studysnap:dashboard-refresh"
        )
      );
    } catch (error) {
      console.error(
        "Could not snooze the study session.",
        error
      );
    } finally {
      setPlannerActionBusy(false);
    }
  }

  async function handleGeneralAiSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = generalAiPrompt.trim();

    if (!prompt) {
      router.push("/general-ai?new=1");
      return;
    }

    if (
      shouldResolveAsStudyCommand(prompt)
    ) {
      const commandResult =
        await resolveStudyCommand(
          prompt,
          rooms
        );

      if (commandResult.handled) {
        router.push(
          commandResult.href
        );
        return;
      }
    }

    window.sessionStorage.setItem(
      "studysnap:pending-general-ai-prompt",
      prompt,
    );

    setGeneralAiPrompt("");
    router.push("/general-ai?new=1");
  }

  if (!checked) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0b0f14] text-white">
        Checking dashboard...
      </main>
    );
  }

  const streak = insights?.study_streak || 0;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retained for expanded dashboard navigation.
  const roomHref = activeRoomId
    ? `/study-rooms/${activeRoomId}`
    : "/study-rooms";

  const currentInsights = learningInsights || insights;

  const dashboardRightPanel = (
    <DashboardRightPanel
      activeRoomId={activeRoomId}
      pdfs={pdfs}
      notesCount={allStats.notes || notes.length}
      flashcardsCount={allStats.flashcards || flashcards.length}
      quizCount={allStats.quizzes || quizCount}
      streak={streak}
      learningScore={currentInsights?.learning_score || 0}
      overallProgress={overallProgress}
      aiRecommendation={
        currentInsights?.ai_recommendation ||
        "Start with one short review so StudySnap can learn what needs attention."
      }
    />
  );

  const nextSession =
    selectNextPlannerItem(
      plannerItems
    );

  const dailyGoalProgress =
    getDailyGoalProgress(
      dailyGoal,
      currentInsights
    );

  // Retained internally so the
  // previous calculations remain
  // validated, but it is not shown
  // as fake learning progress.
  void dashboardRightPanel;

  return (
    <AppShell
      title="Dashboard"
      subtitle={`${getTimeGreeting()}, ${displayName}. ${roomTitle} · ${roomSubject}`}
    >
      <div className="studysnap-dashboard-readable space-y-4">
        <GeneralAIStartCard
          prompt={generalAiPrompt}
          onPromptChange={
            setGeneralAiPrompt
          }
          onSubmit={
            handleGeneralAiSubmit
          }
          activeRoomId={
            activeRoomId
          }
          displayName={
            displayName
          }
          greetingEmoji={
            greetingEmoji
          }
          dailyGoal={
            dailyGoalProgress
          }
          nextSessionSummary={
            nextSession
              ? (
                  `${nextSession.title} · ` +
                  formatPlannerDateTime(
                    nextSession
                      .scheduled_for
                  )
                )
              : null
          }
        />

        {nextSession ? (
          <NextSessionCard
            item={nextSession}
            busy={
              plannerActionBusy
            }
            onSnooze={
              handleSnoozeNextSession
            }
          />
        ) : null}

        <SmartDashboardCenter
          data={smartDashboard}
          loading={
            smartDashboardLoading
          }
          loadingMore={
            smartDashboardLoadingMore
          }
          error={
            smartDashboardError
          }
          commandCenterOnly
          onRefresh={
            loadSmartDashboard
          }
          onRetry={() => {
            void loadSmartDashboard();
          }}
          onLoadMore={() => {
            void loadMoreSmartDashboard();
          }}
        />
      </div>
    </AppShell>
  );
}
