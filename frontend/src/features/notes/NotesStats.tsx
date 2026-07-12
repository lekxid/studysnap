import Link from "next/link";

import { NoteItem, StudyRoom } from "./types";

type Props = {
  notes: NoteItem[];
  selectedRoom?: StudyRoom;
};

type NavigationItem = {
  label: string;
  icon: string;
  href: string;
  active?: boolean;
};

export default function NotesStats({
  notes,
  selectedRoom,
}: Props) {
  const totalWords = notes.reduce((count, note) => {
    return (
      count +
      (note.content.trim()
        ? note.content.trim().split(/\s+/).length
        : 0)
    );
  }, 0);

  const roomHref = selectedRoom
    ? `/study-rooms/${selectedRoom.id}`
    : "/study-rooms";

  const notesHref = selectedRoom
    ? `/notes?roomId=${selectedRoom.id}`
    : "/notes";

  const navigationItems: NavigationItem[] = [
    {
      label: "Overview",
      icon: "🏠",
      href: roomHref,
    },
    {
      label: "Materials",
      icon: "📚",
      href: `${roomHref}#materials`,
    },
    {
      label: "Notes",
      icon: "📝",
      href: notesHref,
      active: true,
    },
    {
      label: "AI Tutor",
      icon: "🤖",
      href: `${roomHref}#ai-tutor`,
    },
    {
      label: "Practice",
      icon: "🧠",
      href: `${roomHref}#practice`,
    },
    {
      label: "Together",
      icon: "👥",
      href: `${roomHref}#study-together`,
    },
    {
      label: "Progress",
      icon: "📈",
      href: `${roomHref}#progress`,
    },
  ];

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-yellow-300/20 bg-[linear-gradient(135deg,rgba(250,204,21,0.11),rgba(8,17,29,0.96)_46%,rgba(4,9,17,0.98))] shadow-[0_22px_70px_rgba(0,0,0,0.28)]">
      <div className="p-5 md:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-yellow-300/25 bg-yellow-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-yellow-200">
                Current Study Room
              </span>

              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-200">
                AI Tutor ready
              </span>
            </div>

            <h2 className="mt-4 truncate text-2xl font-black tracking-tight text-white md:text-3xl">
              {selectedRoom?.name ??
                "Choose a study room"}
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              {selectedRoom
                ? "Everything you write and create here stays connected to this room."
                : "Choose a room to connect your notes, AI Tutor, practice, and learning memory."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={roomHref}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white transition hover:border-yellow-300/30 hover:bg-yellow-300/10"
            >
              Open room
            </Link>

            <Link
              href={`${roomHref}#ai-tutor`}
              className="rounded-xl bg-yellow-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-yellow-200"
            >
              Ask AI Tutor
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-slate-500">
              Notes
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {notes.length}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-slate-500">
              Words learned
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {totalWords.toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-slate-500">
              Room memory
            </p>
            <p className="mt-2 text-sm font-black text-cyan-200">
              Connected
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-slate-500">
              Weak concepts
            </p>
            <p className="mt-2 text-sm font-bold text-slate-300">
              Discovered as you study
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.04] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
              Your AI Tutor currently knows
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {[
                "Materials",
                "Notes",
                "Concept Cards",
                "Practice",
              ].map((source) => (
                <span
                  key={source}
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-slate-300"
                >
                  {source}
                </span>
              ))}
            </div>
          </div>

          <p className="max-w-md text-xs leading-5 text-slate-400">
            StudySnap uses connected room content to give
            more relevant explanations, questions, and
            study guidance.
          </p>
        </div>
      </div>

      <nav className="border-t border-white/10 bg-black/20 px-3 py-3 md:px-5">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {navigationItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-current={
                item.active ? "page" : undefined
              }
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold transition ${
                item.active
                  ? "bg-yellow-300 text-slate-950"
                  : "border border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </section>
  );
}
