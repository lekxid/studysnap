"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import AppShell from "@/components/AppShell";
import SmartDashboardCenter from "@/components/dashboard/SmartDashboardCenter";

import {
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
import { setPendingAIAttachments } from "@/lib/aiAttachmentHandoff";

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

function GeneralAIStartCard({
  prompt,
  onPromptChange,
  onSubmit,
  activeRoomId,
  displayName,
  greetingEmoji,
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: (
    event: FormEvent<HTMLFormElement>
  ) => void;
  activeRoomId: number | null;
  displayName: string;
  greetingEmoji: string;
}) {
  const learnerName =
    displayName.trim() || "Learner";

  return (
    <section className="relative overflow-hidden rounded-[1.65rem] border border-white/[0.085] bg-[radial-gradient(circle_at_top_right,rgba(183,163,95,0.095),transparent_31%),linear-gradient(145deg,rgba(17,22,27,0.97),rgba(3,6,8,0.995))] p-4 shadow-[0_24px_75px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.055)] sm:p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full border border-[#b7a35f]/10 bg-[#b7a35f]/[0.035] blur-2xl"
      />

      <div className="relative flex items-start gap-3.5">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[1rem] border border-white/[0.105] bg-[linear-gradient(145deg,rgba(28,33,38,0.96),rgba(8,11,14,0.98))] text-xl font-black text-[#d4c78d] shadow-[0_12px_34px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.065)]">
          S
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a99b68]">
              StudySnap AI
            </p>

            {activeRoomId ? (
              <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.055] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-200">
                Room connected
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-sm font-black text-[#d7cc9b]">
            Welcome back, {learnerName}{" "}
            {greetingEmoji}
          </p>

          <h1 className="mt-1.5 text-[1.35rem] font-black leading-tight tracking-[-0.025em] text-white sm:text-[1.55rem]">
            What are you studying today?
          </h1>

          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-400">
            Ask a question, explain a difficult
            topic, or continue work already
            connected to your room.
          </p>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="relative mt-4 rounded-[1.2rem] border border-white/[0.09] bg-[#05080b]/90 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition focus-within:border-[#b7a35f]/35 focus-within:bg-[#070a0d]"
      >
        <div className="flex items-center gap-2">
          <Link
            href="/general-ai?add=1"
            aria-label="Add study material"
            title="Add study material"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[0.9rem] border border-white/[0.09] bg-white/[0.04] text-xl font-light text-slate-300 transition hover:border-white/[0.15] hover:bg-white/[0.075] hover:text-white"
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
            className="min-w-0 flex-1 bg-transparent px-1.5 py-3 text-sm font-medium text-white outline-none placeholder:text-slate-600"
          />

          <button
            type="submit"
            disabled={!prompt.trim()}
            aria-label="Send to StudySnap"
            title="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[0.9rem] border border-[#b7a35f]/30 bg-[#a89355] text-lg font-black text-[#090a08] shadow-[0_10px_25px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.22)] transition hover:bg-[#b5a161] active:scale-95 disabled:cursor-not-allowed disabled:border-white/[0.07] disabled:bg-white/[0.05] disabled:text-slate-600 disabled:shadow-none"
          >
            →
          </button>
        </div>
      </form>

      <div className="relative mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Link
          href={getRoomAwareHref(
            "/notes",
            activeRoomId,
          )}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.075] bg-white/[0.028] px-3 py-2.5 text-xs font-black text-slate-300 transition hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white"
        >
          <span className="text-emerald-300">
            ▣
          </span>

          Create note
        </Link>

        <Link
          href={getRoomAwareHref(
            "/quizzes",
            activeRoomId,
          )}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.075] bg-white/[0.028] px-3 py-2.5 text-xs font-black text-slate-300 transition hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white"
        >
          <span className="text-[#b7a35f]">
            ▤
          </span>

          Start quiz
        </Link>

        <Link
          href={
            activeRoomId
              ? `/study-rooms/${activeRoomId}`
              : "/study-rooms"
          }
          className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.075] bg-white/[0.028] px-3 py-2.5 text-xs font-black text-slate-300 transition hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white sm:col-span-1"
        >
          <span className="text-slate-400">
            ▦
          </span>

          {activeRoomId
            ? "Open room"
            : "Choose room"}
        </Link>
      </div>
    </section>
  );
}

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

  const [checked, setChecked] = useState(false);
  const [fullName, setFullName] = useState("");
  const [greetingEmoji, setGreetingEmoji] = useState("👋");
  const [learningInsights, setLearningInsights] =
    useState<LearningInsights | null>(null);
  const [learningInsightsError, setLearningInsightsError] = useState("");

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

  return (
    <AppShell
      title="Dashboard"
      subtitle={`${getTimeGreeting()}, ${displayName}. ${roomTitle} · ${roomSubject}`}
      rightPanel={dashboardRightPanel}
    >
      <div className="studysnap-dashboard-readable space-y-4">
        <GeneralAIStartCard
          prompt={generalAiPrompt}
          onPromptChange={setGeneralAiPrompt}
          onSubmit={handleGeneralAiSubmit}
          activeRoomId={activeRoomId}
          displayName={displayName}
          greetingEmoji={greetingEmoji}
        />

        <SmartDashboardCenter
          data={smartDashboard}
          loading={smartDashboardLoading}
          loadingMore={smartDashboardLoadingMore}
          error={smartDashboardError}
          onRefresh={loadSmartDashboard}
          onRetry={() => {
            void loadSmartDashboard();
          }}
          onLoadMore={() => {
            void loadMoreSmartDashboard();
          }}
        />

        <div className="xl:hidden">{dashboardRightPanel}</div>
      </div>
    </AppShell>
  );
}
