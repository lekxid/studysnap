"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";

const rooms = [
  {
    id: 1,
    name: "Networking Fundamentals",
    subject: "CSTN",
    progress: 62,
    notes: 14,
    flashcards: 42,
    quizzes: 6,
    members: 3,
  },
  {
    id: 2,
    name: "Linux Administration",
    subject: "Server",
    progress: 48,
    notes: 9,
    flashcards: 28,
    quizzes: 4,
    members: 2,
  },
  {
    id: 7,
    name: "Exam Prep Room",
    subject: "Mixed Review",
    progress: 42,
    notes: 11,
    flashcards: 31,
    quizzes: 5,
    members: 4,
  },
];

export default function StudyRoomsPage() {
  return (
    <AppShell
      title="Study Rooms"
      subtitle="Organize each subject into a clean study space with notes, AI support, quizzes, and flashcards."
    >
      <div className="content-grid">
        <section className="hero-grid">
          <div className="gold-card rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-8">
            <div className="gold-chip mb-4">Organized learning</div>

            <h3 className="panel-title text-white text-balance">
              Turn every subject into its own premium study workspace.
            </h3>

            <p className="panel-muted mt-4 max-w-2xl">
              Create separate rooms for classes, exams, projects, or revision.
              Keep your notes, AI explanations, flashcards, and quizzes inside
              each room so studying feels structured instead of messy.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3 sm:gap-4">
              <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Total rooms</p>
                <p className="mt-3 text-3xl font-black text-cyan-300 sm:text-4xl">
                  3
                </p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Active progress</p>
                <p className="mt-3 text-3xl font-black text-amber-300 sm:text-4xl">
                  51%
                </p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Shared rooms</p>
                <p className="mt-3 text-3xl font-black text-violet-300 sm:text-4xl">
                  2
                </p>
              </div>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button className="premium-button rounded-[1.1rem] px-5 py-3 text-sm font-bold">
                Create New Room
              </button>

              <button className="premium-button-secondary rounded-[1.1rem] px-5 py-3 text-sm font-semibold">
                Import Notes
              </button>
            </div>
          </div>

          <div className="premium-card gold-border rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-6">
            <div className="gold-chip mb-4">Best next move</div>
            <h3 className="panel-title text-white">Suggested focus</h3>

            <div className="mt-6 space-y-4">
              <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-amber-100">
                  Networking Fundamentals
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-300">
                  This room has the highest momentum. Review it first before your
                  next quiz.
                </p>
              </div>

              <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-amber-100">
                  Linux Administration
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-300">
                  Needs more revision sessions to catch up this week.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:gap-5 xl:grid-cols-3">
          {rooms.map((room) => (
            <Link
              key={room.id}
              href={`/study-rooms/${room.id}`}
              className="stat-card p-5 sm:p-6 transition hover:-translate-y-1"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="gold-chip mb-4">{room.subject}</div>
                  <h4 className="text-2xl font-black tracking-tight text-white">
                    {room.name}
                  </h4>
                </div>

                <div className="self-start rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-sm font-bold text-amber-100">
                  {room.progress}%
                </div>
              </div>

              <p className="kpi-help mt-5">
                Keep all study materials, AI help, and practice tools in one
                room.
              </p>

              <div className="room-progress mt-5">
                <span style={{ width: `${room.progress}%` }} />
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-[1.05rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-xs">
                    Notes
                  </p>
                  <p className="mt-2 text-lg font-black text-white sm:text-xl">
                    {room.notes}
                  </p>
                </div>

                <div className="rounded-[1.05rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-xs">
                    Flashcards
                  </p>
                  <p className="mt-2 text-lg font-black text-white sm:text-xl">
                    {room.flashcards}
                  </p>
                </div>

                <div className="rounded-[1.05rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-xs">
                    Quizzes
                  </p>
                  <p className="mt-2 text-lg font-black text-white sm:text-xl">
                    {room.quizzes}
                  </p>
                </div>

                <div className="rounded-[1.05rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-xs">
                    Members
                  </p>
                  <p className="mt-2 text-lg font-black text-white sm:text-xl">
                    {room.members}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-300">
                  Open full room details
                </span>
                <span className="text-lg font-bold text-amber-200">→</span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
