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
  percent: number;
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
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-black transition ${
        active
          ? "border border-yellow-300/50 bg-yellow-300/20 text-yellow-100 shadow-[0_0_32px_rgba(250,204,21,0.18)]"
          : "text-slate-200 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg ${
          active ? "bg-yellow-300 text-black" : "bg-white/[0.06] text-slate-200"
        }`}
      >
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}

function DashboardSidebar({
  activeRoomId,
}: {
  activeRoomId: number | null;
}) {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[280px] overflow-y-auto border-r border-white/10 bg-[#061018] px-4 py-5 lg:block">
      <Link href="/dashboard" className="flex items-center gap-3">
        <span className="text-4xl text-yellow-300">★</span>
        <span className="text-2xl font-black tracking-tight text-white">
          StudySnap <span className="text-yellow-300">AI</span>
        </span>
      </Link>

      <nav className="mt-7 space-y-1.5">
        <SidebarLink href="/dashboard" icon="⌂" label="Home" active />
        <SidebarLink href="/study-rooms" icon="📁" label="Study Rooms" />
        <SidebarLink href={getRoomAwareHref("/notes", activeRoomId)} icon="▣" label="Notes" />
        <SidebarLink href={getRoomAwareHref("/flashcards", activeRoomId)} icon="◫" label="Flashcards" />
        <SidebarLink href={getRoomAwareHref("/quizzes", activeRoomId)} icon="▤" label="Quizzes" />
        <SidebarLink href={getRoomAwareHref("/planner", activeRoomId)} icon="◷" label="Planner" />
        <SidebarLink href="/progress" icon="?" label="Progress" />
        <SidebarLink href="/ai-tutor" icon="✦" label="AI Tutor" />
        <SidebarLink href="/brain" icon="🧠" label="Brain" />
        <SidebarLink href="/groups" icon="👥" label="Groups" />
      </nav>

      <div className="mt-8 border-t border-white/10 pt-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
          Starred Rooms
        </p>

        <div className="mt-4 rounded-2xl border border-yellow-300/15 bg-yellow-300/10 p-4">
          <p className="font-black text-yellow-100">Upgrade to Premium</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Unlock advanced AI features, visual study tools, and smarter progress.
          </p>

          <button
            type="button"
            className="mt-4 w-full rounded-xl border border-yellow-300/35 bg-black/30 px-4 py-3 text-sm font-black text-yellow-200"
          >
            Upgrade Now →
          </button>
        </div>
      </div>
    </aside>
  );
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
    <div className="relative w-full max-w-[400px]">
      <form
        onSubmit={handleSearch}
        className="flex h-11 items-center gap-3 rounded-xl border border-white/10 bg-[#07101b]/95 px-4 shadow-[0_0_30px_rgba(0,0,0,0.25)]"
      >
        <button
          type="submit"
          className="text-xl text-white"
          aria-label="Search"
        >
          ⌕
        </button>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search..."
          className="min-w-0 flex-1 border-0 bg-transparent text-base font-semibold text-white outline-none ring-0 placeholder:text-slate-500 focus:border-0 focus:outline-none focus:ring-0"
        />
      </form>

      {open ? (
        <div className="absolute left-0 right-0 top-14 z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#08101f] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          {error ? (
            <p className="p-4 text-sm text-red-200">{error}</p>
          ) : results.length ? (
            <div className="max-h-80 overflow-y-auto p-2">
              {results.map((result, index) => (
                <Link
                  key={`${result.source_type}-${String(result.source_id)}-${index}`}
                  href={getSearchResultHref(result, activeRoomId)}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-3 transition hover:bg-yellow-300/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="line-clamp-1 text-sm font-black text-white">
                      {result.title}
                    </p>
                    <span className="shrink-0 rounded-full border border-yellow-300/20 bg-yellow-300/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-yellow-100">
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
      className={`min-h-[102px] rounded-xl border p-3 transition hover:-translate-y-1 hover:shadow-[0_0_26px_rgba(250,204,21,0.08)] ${accent}`}
    >
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-black/35 text-2xl">
        {icon}
      </div>

      <p className="mt-3 text-center text-sm font-black leading-tight text-white">
        {title}
      </p>

      <p className="mt-1 text-center text-[11px] leading-4 text-slate-400">
        {subtitle}
      </p>
    </Link>
  );
}

function ContinueLearningCard({
  items,
}: {
  items: ContinueItem[];
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#08111d]/90 p-3">
      <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
        <h2 className="flex items-center gap-3 text-xl font-black text-white">
          <span className="text-yellow-300">📖</span>
          Continue Learning
        </h2>

        <Link href="/progress" className="text-sm font-black text-yellow-300">
          View all Learning →
        </Link>
      </div>

      <div className="space-y-1">
        {items.length ? (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="grid grid-cols-[minmax(0,1fr)_165px] items-center gap-3 border-b border-white/10 px-3 py-2 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-lg">
                  {item.icon}
                </span>

                <div className="min-w-0">
                  <p className="line-clamp-1 text-base font-black text-white">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-500">{item.subtitle}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-yellow-300"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
                <span className="w-20 text-right text-sm font-bold text-slate-200">
                  {item.percent}% Complete
                </span>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm leading-6 text-slate-400">
            No activity yet. Upload a PDF, create a note, or make flashcards to begin.
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

  const prompts = [
    "What is sudo?",
    "Explain file permissions",
    "What is a kernel?",
  ];

  return (
    <section className="rounded-xl border border-yellow-300/25 bg-[#08111d]/90 p-3 shadow-[0_0_40px_rgba(250,204,21,0.06)]">
      <div className="mb-2 flex items-center gap-3 border-b border-white/10 pb-2">
        <span className="text-2xl text-yellow-300">🤖</span>
        <h2 className="text-xl font-black text-white">AI Tutor</h2>
      </div>

      <p className="text-base font-black text-yellow-300">
        Try asking me something like:
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <Link
            key={prompt}
            href={aiHref}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-white transition hover:border-yellow-300/40"
          >
            {prompt}
          </Link>
        ))}
      </div>

      <Link
        href={aiHref}
        className="mt-2 flex h-10 items-center rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-slate-400"
      >
        Ask anything about your study material...
      </Link>
    </section>
  );
}


function StudyBotArt() {
  return (
    <div className="relative h-[150px] overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_70%_55%,rgba(250,204,21,0.30),transparent_58%)]">
      <div className="absolute bottom-3 right-5 h-4 w-40 rounded-full border border-yellow-300/45 bg-yellow-300/15 shadow-[0_0_32px_rgba(250,204,21,0.45)]" />

      <div className="absolute bottom-8 right-12 h-[86px] w-[86px] rounded-full bg-yellow-300 shadow-[0_0_58px_rgba(250,204,21,0.45)]" />
      <div className="absolute bottom-[5.25rem] right-8 h-[70px] w-[112px] rounded-[2rem] border border-yellow-100/40 bg-yellow-300 shadow-[0_0_60px_rgba(250,204,21,0.45)]" />

      <div className="absolute bottom-[6.05rem] right-[2.85rem] h-[48px] w-[88px] rounded-[1.4rem] bg-[#08111d]">
        <div className="absolute left-5 top-5 h-3 w-4 rounded-b-full border-b-4 border-yellow-300" />
        <div className="absolute right-5 top-5 h-3 w-4 rounded-b-full border-b-4 border-yellow-300" />
        <div className="absolute bottom-2 left-1/2 h-3 w-8 -translate-x-1/2 rounded-b-full border-b-4 border-yellow-300" />
      </div>

      <div className="absolute bottom-4 left-9 text-5xl">📖</div>
      <div className="absolute bottom-0 right-0 text-5xl">🔥</div>
      <div className="absolute bottom-7 right-[4.75rem] text-2xl">⭐</div>

      <span className="absolute right-8 top-7 text-xl text-yellow-300">✦</span>
      <span className="absolute left-12 top-20 text-lg text-yellow-300">✦</span>
      <span className="absolute right-32 bottom-12 text-base text-yellow-300">✦</span>
    </div>
  );
}


function RightProgressCard({
  pdfCount,
  notesCount,
  flashcardsCount,
  quizCount,
  overall,
}: {
  pdfCount: number;
  notesCount: number;
  flashcardsCount: number;
  quizCount: number;
  overall: number;
}) {
  const rows = [
    ["📄", "PDFs Uploaded", `${pdfCount} / 5`],
    ["📝", "Notes Added", `${notesCount} / 15`],
    ["🧠", "Flashcards Created", `${flashcardsCount} / 60`],
    ["🧾", "Quizzes Taken", `${quizCount} / 10`],
  ];

  return (
    <aside className="rounded-xl border border-white/10 bg-[#08111d]/90 p-4 shadow-[0_0_45px_rgba(250,204,21,0.035)]">
      <h2 className="border-b border-white/10 pb-3 text-xl font-black text-white">
        Your Progress ✍️
      </h2>

      <div className="mt-3 space-y-2.5">
        {rows.map(([icon, label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between border-b border-white/10 pb-2.5 last:border-b-0"
          >
            <span className="flex items-center gap-3 text-sm font-bold text-white">
              <span>{icon}</span>
              {label}
            </span>

            <span className="text-sm font-black text-white">{value}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-[128px_minmax(0,1fr)] items-end gap-3">
        <div
          className="grid h-[122px] w-[122px] place-items-center rounded-full"
          style={{
            background: `conic-gradient(rgb(250 204 21) ${overall}%, rgba(255,255,255,0.1) 0)`,
          }}
        >
          <div className="grid h-[86px] w-[86px] place-items-center rounded-full bg-[#08111d] text-center">
            <div>
              <p className="text-3xl font-black text-white">{overall}%</p>
              <p className="text-[11px] text-slate-300">Overall Progress</p>
            </div>
          </div>
        </div>

        <StudyBotArt />
      </div>
    </aside>
  );
}

function SummaryBox({
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
    <div className={`rounded-xl border p-3 ${accent}`}>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-black/35 text-xl">
          {icon}
        </span>

        <div>
          <p className="font-black text-white">{label}</p>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>

      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [checked, setChecked] = useState(false);
  const [fullName, setFullName] = useState("");

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

    const safeRoomId = roomId;

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
          100
      )
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

  function handleLogout() {
    removeToken();
    window.location.href = "/login";
  }

  if (!checked) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#05080d] text-white">
        Checking dashboard...
      </main>
    );
  }

  const streak = insights?.study_streak || 0;
  const roomHref = activeRoomId ? `/study-rooms/${activeRoomId}` : "/study-rooms";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#05080d] text-white">
      <DashboardSidebar activeRoomId={activeRoomId} />

      <section className="min-w-0 lg:ml-[280px]">
        <div className="mx-auto max-w-[1380px] px-5 py-3">
          <header className="mb-2 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(340px,560px)] lg:items-start">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-white 2xl:text-5xl">
                {roomTitle}
              </h1>

              <p className="mt-2 text-xl font-bold text-slate-200">
                {getTimeGreeting()}, {displayName}! 👋
              </p>

              <p className="mt-1 text-sm text-slate-400">
                Subject: <span className="font-black text-yellow-300">{roomSubject}</span>
                <span className="mx-2">•</span>
                AI Learning Workspace
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <TopSearch activeRoomId={activeRoomId} />

              <Link
                href="/general-ai"
                className="grid h-12 w-12 place-items-center rounded-xl border border-yellow-300/20 bg-yellow-300/10 text-2xl shadow-[0_0_26px_rgba(250,204,21,0.2)]"
                title="General AI"
              >
                🤖
              </Link>

              <button
                type="button"
                className="relative grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-2xl"
                title="Notifications"
              >
                🔔
                <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-yellow-300 text-xs font-black text-black">
                  0
                </span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-lg font-black text-white"
                title="Logout"
              >
                {displayName.charAt(0).toUpperCase()}
              </button>
            </div>
          </header>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-5">
                <QuickActionCard
                  icon="📄"
                  title="Upload PDF"
                  subtitle="Add study material"
                  href={roomHref}
                  accent="border-yellow-300/30 bg-yellow-300/10"
                />
                <QuickActionCard
                  icon="📝"
                  title="Create Note"
                  subtitle="Create notes"
                  href={getRoomAwareHref("/notes", activeRoomId)}
                  accent="border-green-300/20 bg-green-300/10"
                />
                <QuickActionCard
                  icon="🧠"
                  title="Generate Flashcards"
                  subtitle="AI will create cards"
                  href={getRoomAwareHref("/flashcards", activeRoomId)}
                  accent="border-pink-300/20 bg-pink-300/10"
                />
                <QuickActionCard
                  icon="🧾"
                  title="Take Quiz"
                  subtitle="Test your knowledge"
                  href={getRoomAwareHref("/quizzes", activeRoomId)}
                  accent="border-orange-300/20 bg-orange-300/10"
                />
                <QuickActionCard
                  icon="🤖"
                  title="Ask AI Tutor"
                  subtitle="Get instant help"
                  href={roomHref}
                  accent="border-blue-300/20 bg-blue-300/10"
                />
              </div>

              <ContinueLearningCard items={continueItems} />

              <AiTutorCard activeRoomId={activeRoomId} />
            </div>

            <RightProgressCard
              pdfCount={pdfs.length}
              notesCount={notes.length}
              flashcardsCount={flashcards.length}
              quizCount={quizCount}
              overall={overallProgress}
            />
          </section>

          <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryBox
              icon="📄"
              label="PDFs"
              value={String(pdfs.length)}
              subtitle="PDFs"
              accent="border-purple-300/20 bg-purple-300/10"
            />
            <SummaryBox
              icon="📝"
              label="Notes"
              value={String(notes.length)}
              subtitle="Notes"
              accent="border-green-300/20 bg-green-300/10"
            />
            <SummaryBox
              icon="🧠"
              label="Flashcards"
              value={String(flashcards.length)}
              subtitle="Flashcards"
              accent="border-pink-300/20 bg-pink-300/10"
            />
            <SummaryBox
              icon="🧾"
              label="Quizzes"
              value={String(quizCount)}
              subtitle="Quizzes"
              accent="border-orange-300/20 bg-orange-300/10"
            />
            <SummaryBox
              icon="🔥"
              label="Study Streak"
              value={`${streak} Days`}
              subtitle="Study Streak"
              accent="border-blue-300/20 bg-blue-300/10"
            />
          </section>

          <section className="mt-3 rounded-xl border border-yellow-300/15 bg-yellow-300/10 px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-yellow-100">
                  Next on roadmap: AI Study Image Creator
                </p>
                <p className="text-xs text-slate-300">
                  Later we connect this to diagram generation, visual notes, image memory, and Brain.
                </p>
              </div>

              <Link
                href={roomHref}
                className="rounded-xl bg-yellow-300 px-4 py-2 text-sm font-black text-black"
              >
                Prepare →
              </Link>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
