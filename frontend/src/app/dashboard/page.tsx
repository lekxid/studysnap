"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  getFlashcards,
  getLearningInsights,
  getNotes,
  getPDFs,
  getStudyRooms,
  removeToken,
  retrieveBrain,
  type BrainSource,
} from "@/lib/api";
import {
  getSavedProjectRoomId,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";
import NotificationBell from "@/components/NotificationBell";

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

type LearningInsights = {
  cards_reviewed_today: number;
  study_streak: number;
};

type ContinueItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  href: string;
  percent: string;
};

function parseJwt(token: string): TokenPayload | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join("")
    );

    return JSON.parse(jsonPayload);
  } catch {
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
      `studysnap_quiz_questions_room_${roomId}`
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

  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function SidebarLink({
  href,
  icon,
  label,
  active = false,
}: {
  href: string;
  icon: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
        active
          ? "border border-yellow-400/35 bg-yellow-400/20 text-yellow-200 shadow-[0_0_28px_rgba(250,204,21,0.14)]"
          : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg text-lg">
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}

function StarredRoom({
  room,
  active,
  onSelect,
}: {
  room: StudyRoom;
  active: boolean;
  onSelect: (roomId: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(room.id)}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-bold transition ${
        active
          ? "bg-yellow-400/15 text-yellow-200"
          : "text-slate-300 hover:bg-white/[0.05]"
      }`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span>📁</span>
        <span className="line-clamp-1">{room.name}</span>
      </span>
      <span className={active ? "text-yellow-300" : "text-slate-500"}>
        {active ? "★" : "Open"}
      </span>
    </button>
  );
}

function DashboardSidebar({
  rooms,
  activeRoomId,
  onSelectRoom,
}: {
  rooms: StudyRoom[];
  activeRoomId: number | null;
  onSelectRoom: (roomId: number) => void;
}) {
  const starredRooms = rooms.slice(0, 3);

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[285px] flex-col overflow-y-auto border-r border-white/10 bg-[#061017]/95 px-5 py-5 lg:flex">
      <Link href="/dashboard" className="flex items-center gap-3">
        <span className="text-3xl text-yellow-300">✦</span>
        <span className="text-2xl font-black">
          StudySnap <span className="text-yellow-300">AI</span>
        </span>
      </Link>

      <nav className="mt-8 space-y-1.5">
        <SidebarLink href="/dashboard" icon="⌂" label="Home" active />
        <SidebarLink href="/study-rooms" icon="📁" label="Study Rooms" />
        <SidebarLink href="/ai-tutor" icon="⚙" label="AI Tutor" />
        <SidebarLink href={getRoomAwareHref("/notes", activeRoomId)} icon="🗒" label="Notes" />
        <SidebarLink href={getRoomAwareHref("/flashcards", activeRoomId)} icon="🗂" label="Flashcards" />
        <SidebarLink href={getRoomAwareHref("/quizzes", activeRoomId)} icon="?" label="Quizzes" />
        <SidebarLink href={getRoomAwareHref("/planner", activeRoomId)} icon="▣" label="Planner" />
        <SidebarLink href="/progress" icon="📈" label="Progress" />
        <SidebarLink href="/brain" icon="〽" label="Analytics" />
      </nav>

      <div className="mt-6 border-t border-white/10 pt-5">
        <p className="px-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
          Starred Rooms
        </p>

        <div className="mt-3 space-y-1.5">
          {starredRooms.length ? (
            starredRooms.map((room) => (
              <StarredRoom
                key={room.id}
                room={room}
                active={room.id === activeRoomId}
                onSelect={onSelectRoom}
              />
            ))
          ) : (
            <p className="px-3 py-2 text-sm leading-6 text-slate-500">
              Create a study room to connect your dashboard.
            </p>
          )}

          <Link
            href="/study-rooms"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold text-slate-300 hover:bg-white/[0.05]"
          >
            <span className="text-xl">＋</span>
            New Study Room
          </Link>
        </div>
      </div>

      <div className="mt-auto rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
        <p className="font-black text-yellow-200">👑 Upgrade to Premium</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Unlock unlimited AI, PDF analysis, advanced features and more.
        </p>
        <button className="mt-4 w-full rounded-xl bg-yellow-300 px-4 py-3 text-sm font-black text-black">
          Upgrade Now →
        </button>
      </div>
    </aside>
  );
}


function RoomSwitcher({
  rooms,
  activeRoomId,
  onSelectRoom,
}: {
  rooms: StudyRoom[];
  activeRoomId: number | null;
  onSelectRoom: (roomId: number) => void;
}) {
  if (!rooms.length) {
    return (
      <Link
        href="/study-rooms"
        className="rounded-2xl border border-yellow-400/25 bg-yellow-400/10 px-4 py-3 text-sm font-black text-yellow-100"
      >
        Create Study Room
      </Link>
    );
  }

  return (
    <label className="flex h-11 items-center gap-3 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 px-4 text-sm font-black text-yellow-100">
      <span>📁 Active Room</span>
      <select
        value={activeRoomId ?? ""}
        onChange={(event) => onSelectRoom(Number(event.target.value))}
        className="max-w-[220px] bg-transparent text-sm font-black text-white outline-none"
      >
        {rooms.map((room) => (
          <option key={room.id} value={room.id} className="bg-slate-950 text-white">
            {room.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function getSearchResultHref(result: BrainSource, activeRoomId: number | null) {
  if (result.source_type === "note_chunk") {
    return getRoomAwareHref("/notes", activeRoomId);
  }

  if (result.source_type === "flashcard") {
    return getRoomAwareHref("/flashcards", activeRoomId);
  }

  if (result.source_type === "pdf_chunk") {
    return activeRoomId ? `/study-rooms/${activeRoomId}` : "/study-rooms";
  }

  if (result.source_type === "brain_memory") {
    return "/brain";
  }

  return activeRoomId ? `/study-rooms/${activeRoomId}` : "/dashboard";
}

function TopSearch({
  activeRoomId,
}: {
  activeRoomId: number | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BrainSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setResults([]);
      setOpen(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const data = await retrieveBrain(trimmedQuery, activeRoomId, 5);
      setResults(Array.isArray(data.results) ? data.results : []);
      setOpen(true);
    } catch {
      setResults([]);
      setError("Search is not available right now.");
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative w-full md:w-[420px]">
      <form
        onSubmit={handleSearch}
        className="flex h-11 w-full items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/80 px-4 text-sm text-slate-400 shadow-2xl"
      >
        <span>⌕</span>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search room materials: PDFs, notes, flashcards..."
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white placeholder:text-slate-500 outline-none"
        />

        <button
          type="submit"
          className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-xs font-bold text-slate-300"
        >
          {loading ? "..." : "Ctrl K"}
        </button>
      </form>

      {open ? (
        <div className="absolute left-0 right-0 top-13 z-50 overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          {error ? (
            <p className="p-4 text-sm text-red-200">{error}</p>
          ) : results.length ? (
            <div className="max-h-80 overflow-y-auto p-2">
              {results.map((result, index) => (
                <Link
                  key={`${result.source_type}-${String(result.source_id)}-${index}`}
                  href={getSearchResultHref(result, activeRoomId)}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-3 transition hover:bg-yellow-400/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="line-clamp-1 text-sm font-black text-white">
                      {result.title}
                    </p>
                    <span className="shrink-0 rounded-full border border-yellow-400/20 bg-yellow-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-yellow-100">
                      {result.source_type.replaceAll("_", " ")}
                    </span>
                  </div>

                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
                    {result.text}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="p-4 text-sm text-slate-400">
              No matching project material found yet.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function QuickActionCard({
  icon,
  title,
  subtitle,
  href,
  accent,
}: {
  icon: string;
  title: string;
  subtitle: string;
  href: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className={`min-h-[132px] rounded-2xl border bg-black/25 p-3.5 transition hover:-translate-y-1 hover:bg-white/[0.06] ${accent}`}
    >
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-black/35 text-3xl">
        {icon}
      </div>
      <p className="mt-3 text-sm font-black leading-tight text-white">{title}</p>
      <p className="mt-1.5 text-xs leading-5 text-slate-300">{subtitle}</p>
    </Link>
  );
}

function StudyBotArt() {
  return (
    <div className="relative hidden min-h-[245px] overflow-hidden rounded-[1.4rem] border border-yellow-400/10 bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.25),transparent_62%)] xl:block">
      <div className="absolute left-4 top-5 rounded-2xl border border-yellow-400/15 bg-black/45 p-3 shadow-2xl">
        <p className="text-sm font-black text-yellow-100">Hi, I&apos;m StudySnap AI</p>
        <p className="mt-1 max-w-36 text-xs leading-5 text-slate-300">
          Your personal study assistant.
        </p>
      </div>

      <div className="absolute right-7 top-8 text-yellow-300">✦</div>
      <div className="absolute left-7 bottom-16 text-yellow-300">✦</div>
      <div className="absolute right-20 bottom-7 text-yellow-300">✦</div>

      <div className="absolute bottom-[28px] right-8 h-16 w-36 rounded-[50%] border border-yellow-400/25 bg-yellow-300/20" />
      <div className="absolute bottom-[52px] right-16 h-9 w-24 rounded-b-[2rem] rounded-t-lg bg-yellow-200/90" />

      <div className="absolute bottom-[88px] right-[72px] h-24 w-28 rounded-[2rem] border border-white/20 bg-white shadow-[0_0_35px_rgba(250,204,21,0.22)]" />
      <div className="absolute bottom-[116px] right-[88px] h-16 w-20 rounded-[1.6rem] bg-slate-950">
        <div className="absolute left-4 top-6 h-4 w-3 rounded-full bg-yellow-300 shadow-[0_0_14px_rgba(250,204,21,0.9)]" />
        <div className="absolute right-4 top-6 h-4 w-3 rounded-full bg-yellow-300 shadow-[0_0_14px_rgba(250,204,21,0.9)]" />
        <div className="absolute bottom-3 left-1/2 h-3 w-8 -translate-x-1/2 rounded-b-full border-b-4 border-yellow-300" />
      </div>

      <div className="absolute bottom-[128px] right-[91px] h-[68px] w-4 rounded-full bg-yellow-300" />
      <div className="absolute bottom-[128px] right-[182px] h-[68px] w-4 rounded-full bg-yellow-300" />
      <div className="absolute bottom-[104px] right-[208px] h-9 w-7 rounded-full bg-yellow-300" />
      <div className="absolute bottom-[104px] right-[74px] h-9 w-7 rounded-full bg-yellow-300" />
    </div>
  );
}

function ProgressCard({
  pdfCount,
  notesCount,
  flashcardsCount,
  quizCount,
}: {
  pdfCount: number;
  notesCount: number;
  flashcardsCount: number;
  quizCount: number;
}) {
  const progress = Math.min(
    100,
    Math.round(
      ((Math.min(pdfCount, 5) / 5 +
        Math.min(notesCount, 15) / 15 +
        Math.min(flashcardsCount, 60) / 60 +
        Math.min(quizCount, 10) / 10) /
        4) *
        100
    )
  );

  const items = [
    ["📄", "PDFs Uploaded", `${pdfCount} / 5`],
    ["📝", "Notes Added", `${notesCount} / 15`],
    ["🧠", "Flashcards Created", `${flashcardsCount} / 60`],
    ["🧾", "Quizzes Taken", `${quizCount} / 10`],
  ];

  return (
    <section className="rounded-[1.45rem] border border-white/10 bg-slate-950/75 p-4 shadow-[0_22px_70px_rgba(0,0,0,0.35)]">
      <h2 className="text-xl font-black text-white">Your Progress 📈</h2>
      <p className="mt-1 text-sm text-slate-400">
        Keep it up! You&apos;re doing great. 🔥
      </p>

      <div className="mt-5 grid gap-5 md:grid-cols-[145px_minmax(0,1fr)] md:items-center">
        <div
          className="grid h-36 w-36 place-items-center rounded-full"
          style={{
            background:
              `conic-gradient(rgb(250 204 21) ${progress}%, rgba(255,255,255,0.08) 0)`,
          }}
        >
          <div className="grid h-24 w-24 place-items-center rounded-full bg-slate-950 text-center">
            <div>
              <p className="text-3xl font-black text-white">{progress}%</p>
              <p className="text-[11px] text-slate-500">Overall Progress</p>
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          {items.map(([icon, label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-3 text-slate-300">
                <span>{icon}</span>
                <span>{label}</span>
              </span>
              <span className="font-bold text-slate-200">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <Link
        href="/progress"
        className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-black text-yellow-200 transition hover:bg-yellow-400/10"
      >
        <span>View full progress</span>
        <span>→</span>
      </Link>
    </section>
  );
}

function ContinueLearningCard({
  items,
}: {
  items: ContinueItem[];
}) {
  return (
    <section className="rounded-[1.45rem] border border-white/10 bg-slate-950/75 p-4 shadow-[0_22px_70px_rgba(0,0,0,0.32)]">
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-3 text-xl font-black text-white">
          <span className="text-yellow-300">📖</span>
          Continue Learning
        </h2>
        <Link href="/progress" className="text-sm font-black text-yellow-300">
          View all activity →
        </Link>
      </div>

      <div className="mt-4 space-y-2.5">
        {items.length ? (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left transition hover:border-yellow-400/30 hover:bg-yellow-400/10"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-lg">
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-1 font-black text-white">{item.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.subtitle}</p>
                </div>
              </div>

              <div className="hidden items-center gap-3 sm:flex">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-yellow-300" style={{ width: item.percent }} />
                </div>
                <span className="w-10 text-right text-sm font-bold text-slate-300">
                  {item.percent}
                </span>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm leading-7 text-slate-400">
            No activity yet. Create a study room, upload a PDF, write a note, or make flashcards to begin.
          </div>
        )}
      </div>
    </section>
  );
}

function AiTutorCard({
  activeRoomId,
}: {
  activeRoomId: number | null;
}) {
  const aiHref = activeRoomId ? `/study-rooms/${activeRoomId}` : "/study-rooms";
  return (
    <section className="relative overflow-hidden rounded-[1.45rem] border border-white/10 bg-slate-950/75 p-4 shadow-[0_22px_70px_rgba(0,0,0,0.32)]">
      <div className="absolute right-6 top-5 text-yellow-300/70">✦</div>
      <div className="absolute right-16 top-10 text-yellow-300/50">✦</div>

      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-yellow-400/20 bg-yellow-400/10 text-xl">
          🤖
        </span>
        <h2 className="text-xl font-black text-white">AI Tutor</h2>
        <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-2 py-1 text-xs font-black text-yellow-200">
          New
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-yellow-400/15 bg-yellow-400/10 p-3.5">
        <p className="text-sm font-black text-yellow-100">
          Try asking me something like:
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            "What should I study next?",
            "Explain my notes",
            "Quiz me from this room",
            "More examples",
          ].map((prompt) => (
            <Link
              key={prompt}
              href={aiHref}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 transition hover:border-yellow-400/30"
            >
              {prompt}
            </Link>
          ))}
        </div>
      </div>

      <Link
        href={aiHref}
        className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/35 px-4 py-3.5 text-sm text-slate-400 transition hover:border-yellow-400/30"
      >
        <span>Ask anything about your study material...</span>
        <span className="rounded-xl bg-yellow-300 px-3 py-2 font-black text-black">
          ➤
        </span>
      </Link>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={aiHref}
          className="rounded-xl border border-yellow-400/20 bg-yellow-400/10 px-3 py-2 text-xs font-black text-yellow-100"
        >
          Open Project AI
        </Link>

        <Link
          href="/general-ai"
          className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs font-black text-sky-100"
        >
          Open General AI
        </Link>
      </div>
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <div className={`rounded-[1.25rem] border p-4 ${accent}`}>
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-black/25 text-xl">
          {icon}
        </div>
        <div>
          <p className="text-sm font-black text-white">{label}</p>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function StreakStrip({
  streak,
}: {
  streak: number;
}) {
  return (
    <section className="rounded-[1.35rem] border border-yellow-400/20 bg-yellow-400/10 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-yellow-400/25 bg-yellow-400/15 text-2xl">
            🏆
          </div>
          <div>
            <p className="text-xl font-black text-white">
              {streak > 0 ? "You're on a roll! 🔥" : "Start your streak today 🔥"}
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {streak > 0
                ? `You have studied for ${streak} day${streak === 1 ? "" : "s"} in a row.`
                : "Review flashcards or use AI Tutor to begin your learning streak."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-300">
          {["1 day", "3 days", "5 days", "7 days", "10 days"].map((item, index) => (
            <div key={item} className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-yellow-300 text-black">
                {index < Math.min(streak, 4) ? "✓" : "☆"}
              </div>
              <span>{item}</span>
              {index < 4 ? <div className="h-px w-8 bg-yellow-300/60" /> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const [checked, setChecked] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [pdfs, setPdfs] = useState<PDFDocument[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [quizCount, setQuizCount] = useState(0);
  const [insights, setInsights] = useState<LearningInsights | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    const payload = parseJwt(token);

    if (!payload || (payload.exp && payload.exp * 1000 < Date.now())) {
      localStorage.removeItem("token");
      window.location.href = "/login";
      return;
    }

    setFullName(payload.full_name || payload.sub?.split("@")[0] || "Student");
    setEmail(payload.sub || "");
    setChecked(true);

    async function loadDashboardFoundation() {
      try {
        const [roomData, learningData] = await Promise.all([
          getStudyRooms(),
          getLearningInsights().catch(() => null),
        ]);

        const roomList: StudyRoom[] = Array.isArray(roomData) ? roomData : [];
        setRooms(roomList);

        const savedRoomId = getSavedProjectRoomId();
        const savedRoomExists = roomList.some((room) => room.id === savedRoomId);
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

    const safeRoomId: number = roomId;

    async function loadActiveRoomData() {
      try {
        const [pdfData, noteData, flashcardData] = await Promise.all([
          getPDFs(safeRoomId),
          getNotes(safeRoomId),
          getFlashcards(safeRoomId),
        ]);

        setPdfs(Array.isArray(pdfData) ? pdfData : []);
        setNotes(Array.isArray(noteData) ? noteData : []);
        setFlashcards(Array.isArray(flashcardData) ? flashcardData : []);
        setQuizCount(getProjectQuizCount(safeRoomId));
      } catch {
        setPdfs([]);
        setNotes([]);
        setFlashcards([]);
        setQuizCount(getProjectQuizCount(safeRoomId));
      }
    }

    loadActiveRoomData();
  }, [activeRoomId]);

  const displayName = useMemo(() => {
    if (!fullName) return "Student";
    return fullName.split(" ")[0];
  }, [fullName]);

  const activeRoom = useMemo(() => {
    return rooms.find((room) => room.id === activeRoomId) || null;
  }, [rooms, activeRoomId]);

  const continueItems = useMemo<ContinueItem[]>(() => {
    if (!activeRoomId) return [];

    const pdfItems = pdfs.slice(0, 2).map((pdf, index) => ({
      id: `pdf-${pdf.id}`,
      title: pdf.original_filename,
      subtitle: `Uploaded ${formatTimeAgo(pdf.created_at)}`,
      icon: "📕",
      href: `/study-rooms/${activeRoomId}`,
      percent: index === 0 ? "75%" : "65%",
    }));

    const noteItems = notes.slice(0, 1).map((note) => ({
      id: `note-${note.id}`,
      title: note.title,
      subtitle: `Edited ${formatTimeAgo(note.created_at)}`,
      icon: "📄",
      href: `/notes?roomId=${activeRoomId}&noteId=${note.id}`,
      percent: "80%",
    }));

    const flashcardItems = flashcards.length
      ? [
          {
            id: "flashcards-active",
            title: `${activeRoom?.subject || "Project"} Flashcards`,
            subtitle: `${flashcards.length} card${flashcards.length === 1 ? "" : "s"} ready`,
            icon: "📘",
            href: `/flashcards?roomId=${activeRoomId}`,
            percent: "60%",
          },
        ]
      : [];

    return [...pdfItems, ...noteItems, ...flashcardItems].slice(0, 3);
  }, [activeRoom, activeRoomId, flashcards, notes, pdfs]);

  function handleLogout() {
    removeToken();
    window.location.href = "/login";
  }

  function handleSelectRoom(roomId: number) {
    saveProjectRoomId(roomId);
    setActiveRoomId(roomId);
  }

  if (!checked) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#05080d] text-white">
        Checking dashboard...
      </main>
    );
  }

  const cardsReviewed = insights?.cards_reviewed_today || flashcards.length;
  const streak = insights?.study_streak || 0;
  const roomTitle = activeRoom?.name || "StudySnap Dashboard";
  const roomSubject = activeRoom?.subject || "All Subjects";

  return (
    <main className="min-h-screen bg-[#05080d] text-white">
      <DashboardSidebar
        rooms={rooms}
        activeRoomId={activeRoomId}
        onSelectRoom={handleSelectRoom}
      />

      <section className="min-w-0 lg:ml-[285px]">
        <div className="mx-auto max-w-[1420px] px-5 py-5">
          <header className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div>
              <p className="text-sm text-slate-300">
                {getTimeGreeting()}, {displayName}! 👋
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-black tracking-tight text-white xl:text-5xl">
                  {roomTitle}
                </h1>
                <span className="text-xl text-slate-400">✎</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Subject: <span className="font-bold text-yellow-300">{roomSubject}</span>
                <span className="mx-2">•</span>
                AI Workspace
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-start gap-3 xl:justify-end">
              <RoomSwitcher
                rooms={rooms}
                activeRoomId={activeRoomId}
                onSelectRoom={handleSelectRoom}
              />

              <TopSearch activeRoomId={activeRoomId} />

              <Link
                href="/general-ai"
                className="rounded-2xl border border-sky-400/25 bg-sky-400/10 px-4 py-3 text-sm font-black text-sky-100 transition hover:bg-sky-400/20"
              >
                ✨ General AI
              </Link>

              <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-2 py-1.5">
                <NotificationBell />
              </div>

              <div className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-gradient-to-br from-yellow-300 to-sky-400 text-lg font-black text-black">
                {displayName.slice(0, 1).toUpperCase()}
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-black text-white"
              >
                Logout
              </button>
            </div>
          </header>

          <div className="mt-4 flex justify-end gap-3">
            <Link
              href={activeRoomId ? `/study-rooms/${activeRoomId}` : "/study-rooms"}
              className="rounded-2xl border border-white/10 bg-slate-950/75 px-5 py-3 text-sm font-black text-white"
            >
              Open Room
            </Link>
            <Link
              href="/groups"
              className="rounded-2xl border border-white/10 bg-slate-950/75 px-5 py-3 text-sm font-black text-white"
            >
              👥 Share Room
            </Link>
            <Link
              href="/settings"
              className="rounded-2xl border border-white/10 bg-slate-950/75 px-5 py-3 text-sm font-black text-white"
            >
              ⋯
            </Link>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_390px]">
            <section className="rounded-[1.45rem] border border-yellow-400/20 bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.16),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_285px]">
                <div>
                  <div className="inline-flex rounded-full border border-yellow-400/25 bg-yellow-400/10 px-4 py-2 text-xs font-black text-yellow-200">
                    ✨ Let's get started
                  </div>

                  <h2 className="mt-4 text-3xl font-black text-white">
                    What do you want to do today?
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-300">
                    Pick up where you left off or start something new.
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                    <QuickActionCard
                      icon="📄"
                      title="Upload PDF"
                      subtitle="Add your study material"
                      href={activeRoomId ? `/study-rooms/${activeRoomId}` : "/study-rooms"}
                      accent="border-yellow-400/30"
                    />
                    <QuickActionCard
                      icon="📝"
                      title="Create Note"
                      subtitle="Write and organize ideas"
                      href={getRoomAwareHref("/notes", activeRoomId)}
                      accent="border-green-400/25"
                    />
                    <QuickActionCard
                      icon="🧠"
                      title="Generate Flashcards"
                      subtitle="AI will create flashcards"
                      href={getRoomAwareHref("/flashcards", activeRoomId)}
                      accent="border-pink-400/25"
                    />
                    <QuickActionCard
                      icon="🧾"
                      title="Take Quiz"
                      subtitle="Test your knowledge"
                      href={getRoomAwareHref("/quizzes", activeRoomId)}
                      accent="border-orange-400/25"
                    />
                    <QuickActionCard
                      icon="🤖"
                      title="Ask Project AI"
                      subtitle="Ask about this room"
                      href={activeRoomId ? `/study-rooms/${activeRoomId}` : "/study-rooms"}
                      accent="border-sky-400/25"
                    />

                    <QuickActionCard
                      icon="✨"
                      title="Ask General AI"
                      subtitle="Ask anything random"
                      href="/general-ai"
                      accent="border-cyan-400/25"
                    />
                  </div>
                </div>

                <StudyBotArt />
              </div>
            </section>

            <ProgressCard
              pdfCount={pdfs.length}
              notesCount={notes.length}
              flashcardsCount={flashcards.length}
              quizCount={quizCount}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <ContinueLearningCard items={continueItems} />
            <AiTutorCard activeRoomId={activeRoomId} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              icon="📚"
              label="PDFs"
              value={String(pdfs.length)}
              subtitle="Files uploaded"
              accent="border-violet-400/25 bg-violet-500/10"
            />
            <StatCard
              icon="📝"
              label="Notes"
              value={String(notes.length)}
              subtitle="Total notes"
              accent="border-green-400/25 bg-green-500/10"
            />
            <StatCard
              icon="🧠"
              label="Flashcards"
              value={String(cardsReviewed)}
              subtitle="Cards reviewed or ready"
              accent="border-pink-400/25 bg-pink-500/10"
            />
            <StatCard
              icon="🧾"
              label="Quizzes"
              value={String(quizCount)}
              subtitle="Project quizzes"
              accent="border-orange-400/25 bg-orange-500/10"
            />
            <StatCard
              icon="🔥"
              label="Study Streak"
              value={String(streak)}
              subtitle="Days in a row"
              accent="border-sky-400/25 bg-sky-500/10"
            />
          </div>

          <div className="mt-4">
            <StreakStrip streak={streak} />
          </div>

          <p className="mt-4 text-center text-xs text-slate-600">
            Logged in as {email}
          </p>
        </div>
      </section>
    </main>
  );
}
