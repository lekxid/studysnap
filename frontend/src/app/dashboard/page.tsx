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

import {
  resolveStudyCommand,
} from "@/lib/studyCommandRouter";
import {
  setPendingAIAttachment,
} from "@/lib/aiAttachmentHandoff";

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
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  activeRoomId: number | null;
}) {
  const router = useRouter();

  const attachmentInputRef =
    useRef<HTMLInputElement | null>(null);

  function openChatAttachmentPicker() {
    const input =
      attachmentInputRef.current;

    if (!input) {
      return;
    }

    input.value = "";
    input.click();
  }

  function handleAttachment(
    file: File | undefined,
  ) {
    if (!file) {
      return;
    }

    setPendingAIAttachment(file);
    router.push("/general-ai?attachment=pending");
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[#12181e] shadow-[0_18px_55px_rgba(0,0,0,0.2)]">
      <div className="h-px bg-white/[0.08]" />

      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.075] bg-white/[0.045] text-xl">
            ✦
          </div>

          <div>
            <h2 className="text-xl font-black text-white">
              What would you like to study today?
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Ask StudySnap a question or attach study material.
            </p>
          </div>
        </div>

        <input
          ref={attachmentInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={(event) =>
            handleAttachment(
              event.currentTarget.files?.[0],
            )
          }
        />

        <form
          onSubmit={onSubmit}
          className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] p-2 transition focus-within:border-[#c9ad50]/[0.24]"
        >
          <input
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="Ask StudySnap anything..."
            className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-slate-500"
          />

          <button
            type="button"
            onClick={openChatAttachmentPicker}
            aria-label="Attach image to StudySnap AI"
            title="Attach image to StudySnap AI"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-xl font-black text-slate-200 transition hover:border-[#c9ad50]/[0.22] hover:bg-[#c9ad50]/[0.08] hover:text-[#cec18d]"
          >
            +
          </button>

          <button
            type="submit"
            aria-label="Ask StudySnap"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#c9ad50] text-base font-black text-[#111317] transition hover:bg-[#d5bb63]"
          >
            ➤
          </button>
        </form>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/general-ai"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.075] bg-white/[0.035] px-3 py-2.5 text-sm font-bold text-slate-100 transition hover:bg-white/[0.06]"
          >
            <span>✦</span>
            Ask StudySnap
          </Link>

          <Link
            href={getRoomAwareHref("/notes", activeRoomId)}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.07]"
          >
            <span className="text-emerald-300">▣</span>
            Create note
          </Link>

          <Link
            href={getRoomAwareHref("/quizzes", activeRoomId)}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.07]"
          >
            <span className="text-orange-300">▤</span>
            Start quiz
          </Link>

          <Link
            href={getRoomAwareHref("/flashcards", activeRoomId)}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.07]"
          >
            <span className="text-[#79aeb5]">◫</span>
            Concept Cards
          </Link>
        </div>
      </div>
    </section>
  );
}

function ContinueLearningCard({ items }: { items: ContinueItem[] }) {
  return (
    <section className="rounded-2xl border border-white/[0.075] bg-[#12181e] p-4 sm:p-5">
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
          className="text-xs font-black text-[#c9ad50] hover:text-[#cec18d]"
        >
          View all
        </Link>
      </div>

      <div className="mt-4 space-y-2">
        {items.length ? (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="group grid gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 transition hover:border-[#c9ad50]/[0.18] hover:bg-white/[0.045] sm:grid-cols-[minmax(0,1fr)_190px] sm:items-center"
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
                    className="h-full rounded-full bg-[#c9ad50]"
                    style={{
                      width: `${item.percent}%`,
                    }}
                  />
                </div>

                <span className="w-10 text-right text-xs font-black text-slate-300">
                  {item.percent}%
                </span>

                <span className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-black text-slate-200 group-hover:border-[#c9ad50]/[0.20] group-hover:text-[#cec18d]">
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
    <section className="rounded-2xl border border-white/[0.075] bg-[#12181e] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white">Recent Activity</h2>

          <p className="mt-1 text-xs text-slate-500">
            Your latest learning work.
          </p>
        </div>

        <Link
          href="/study-rooms"
          className="text-xs font-black text-[#c9ad50] hover:text-[#cec18d]"
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
              className="flex items-center gap-3 px-3 py-3 transition hover:bg-white/[0.04]"
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
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/[0.075] bg-[#12181e] p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-white">Today&apos;s Focus</h2>

          <span className="text-xs font-black text-[#c9ad50]">
            {focusItems.length} steps
          </span>
        </div>

        <div className="mt-4 space-y-1">
          {focusItems.map((item, index) => (
            <Link
              key={item.title}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/[0.04]"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/15 text-[10px] font-black text-slate-400">
                {index + 1}
              </span>

              <span className="text-sm font-semibold text-slate-200">
                {item.title}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.075] bg-[#12181e] p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-white">🔥 Study Streak</h2>

          <Link href="/progress" className="text-xs font-black text-[#c9ad50]">
            Progress
          </Link>
        </div>

        <div className="mt-4 flex items-end gap-2">
          <span className="text-4xl font-black text-white">{streak}</span>

          <span className="pb-1 text-sm text-slate-500">
            day{streak === 1 ? "" : "s"}
          </span>
        </div>

        <p className="mt-2 text-sm leading-6 text-slate-400">
          {streak > 0
            ? "Keep going. A small study session today protects your streak."
            : "Start with one quick review today."}
        </p>
      </section>

      <section className="rounded-2xl border border-white/[0.075] bg-[#12181e] p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-white">Progress Overview</h2>

          <span className="text-xs font-black text-[#c9ad50]">
            {displayScore}%
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {progressRows.map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300">{row.label}</span>

                <span className="text-slate-500">{row.value}</span>
              </div>

              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#c9ad50]"
                  style={{
                    width: `${row.percent}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#151a24] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#b8a8cf]">
            AI Insight
          </p>

          <p className="mt-2 text-xs leading-5 text-slate-300">
            {aiRecommendation}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.075] bg-[#12181e] p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-white">Recent PDFs</h2>

          <Link href={roomHref} className="text-xs font-black text-[#c9ad50]">
            View room
          </Link>
        </div>

        <div className="mt-3 space-y-2">
          {pdfs.length ? (
            pdfs.slice(0, 3).map((pdf) => (
              <Link
                key={pdf.id}
                href={roomHref}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.04]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-400/10 text-base">
                  📄
                </span>

                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-white">
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
  const [learningInsights, setLearningInsights] =
    useState<LearningInsights | null>(null);
  const [learningInsightsError, setLearningInsightsError] = useState("");

  const [smartDashboard, setSmartDashboard] =
    useState<SmartDashboardResponse | null>(null);
  const [smartDashboardLoading, setSmartDashboardLoading] =
    useState(true);
  const [
    smartDashboardLoadingMore,
    setSmartDashboardLoadingMore,
  ] = useState(false);
  const [smartDashboardError, setSmartDashboardError] =
    useState("");

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

  const loadSmartDashboard = useCallback(
    async () => {
      setSmartDashboardLoading(true);
      setSmartDashboardError("");

      try {
        const data = await getSmartDashboard({
          limit: 3,
        });

        setSmartDashboard(data);
      } catch (error) {
        console.error(
          "Could not load smart dashboard.",
          error,
        );

        setSmartDashboardError(
          "Live dashboard updates are temporarily unavailable.",
        );
      } finally {
        setSmartDashboardLoading(false);
      }
    },
    [],
  );

  const loadMoreSmartDashboard = useCallback(
    async () => {
      const cursor = smartDashboard?.next_cursor;

      if (
        !cursor ||
        smartDashboardLoadingMore
      ) {
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

          const existingIds = new Set(
            current.feed.map((item) => item.id),
          );

          const newItems = nextPage.feed.filter(
            (item) => !existingIds.has(item.id),
          );

          return {
            ...current,
            generated_at: nextPage.generated_at,
            feed: [
              ...current.feed,
              ...newItems,
            ],
            next_cursor: nextPage.next_cursor,
            has_more: nextPage.has_more,
          };
        });
      } catch (error) {
        console.error(
          "Could not load older dashboard activity.",
          error,
        );

        setSmartDashboardError(
          "Older learning activity could not be loaded.",
        );
      } finally {
        setSmartDashboardLoadingMore(false);
      }
    },
    [
      smartDashboard?.next_cursor,
      smartDashboardLoadingMore,
    ],
  );

  useEffect(() => {
    if (!checked) {
      return;
    }

    function refreshDashboard() {
      void loadSmartDashboard();
    }

    function refreshWhenVisible() {
      if (
        document.visibilityState === "visible"
      ) {
        void loadSmartDashboard();
      }
    }

    void loadSmartDashboard();

    window.addEventListener(
      "studysnap:dashboard-refresh",
      refreshDashboard,
    );

    document.addEventListener(
      "visibilitychange",
      refreshWhenVisible,
    );

    return () => {
      window.removeEventListener(
        "studysnap:dashboard-refresh",
        refreshDashboard,
      );

      document.removeEventListener(
        "visibilitychange",
        refreshWhenVisible,
      );
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

    if (payload) {
      setFullName(
        payload.full_name ||
          payload.sub?.split("@")[0] ||
          "Student"
      );
    } else {
      setFullName("Student");
    }

    setChecked(true);

    async function loadCurrentProfile() {
      try {
        const profile = await getCurrentUser();
        setFullName(
          profile.full_name || profile.email?.split("@")[0] || "Student",
        );

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
      setPdfs([]);
      setNotes([]);
      setFlashcards([]);
      setQuizCount(0);
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
      setAllStats({
        pdfs: 0,
        notes: 0,
        flashcards: 0,
        quizzes: 0,
        rooms: 0,
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

  async function handleGeneralAiSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const prompt = generalAiPrompt.trim();

    if (!prompt) {
      router.push("/general-ai");
      return;
    }

    const commandResult =
      await resolveStudyCommand(
        prompt,
        rooms,
      );

    if (commandResult.handled) {
      router.push(commandResult.href);
      return;
    }

    router.push(
      `/general-ai?prompt=${encodeURIComponent(prompt)}`,
    );
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
      <div className="space-y-5">
        <GeneralAIStartCard
          prompt={generalAiPrompt}
          onPromptChange={setGeneralAiPrompt}
          onSubmit={handleGeneralAiSubmit}
          activeRoomId={activeRoomId}
        />

        <SmartDashboardCenter
          data={smartDashboard}
          loading={smartDashboardLoading}
          loadingMore={smartDashboardLoadingMore}
          error={smartDashboardError}
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
