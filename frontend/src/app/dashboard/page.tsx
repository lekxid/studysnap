"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";

const stats = [
  {
    label: "Study Rooms",
    value: "2",
    help: "Active spaces for your current subjects",
    href: "/study-rooms",
    tone: "text-cyan-300",
  },
  {
    label: "Notes",
    value: "0",
    help: "Saved notes, summaries, and pasted study content",
    href: "/notes",
    tone: "text-amber-300",
  },
  {
    label: "Flashcards",
    value: "0",
    help: "Cards ready for review and spaced repetition",
    href: "/flashcards",
    tone: "text-lime-300",
  },
  {
    label: "Quizzes",
    value: "0",
    help: "Practice sets created by you or AI",
    href: "/quizzes",
    tone: "text-pink-300",
  },
];

const rooms = [
  { id: 1, name: "Networking Fundamentals", subject: "CSTN", progress: 62 },
  { id: 2, name: "Linux Administration", subject: "Server", progress: 48 },
];

const missions = [
  "Review one flashcard set",
  "Ask AI Tutor one difficult question",
  "Study for 20 focused minutes",
];

export default function DashboardPage() {
  return (
    <AppShell
      title="Dashboard"
      subtitle="Your premium study command center for focus, progress, and quick action."
    >
      <div className="content-grid">
        <section className="hero-grid">
          <div className="gold-card rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-8">
            <div className="gold-chip mb-4">Live momentum</div>

            <h3 className="panel-title text-white text-balance">
              Stay in flow and keep your study streak alive.
            </h3>

            <p className="panel-muted mt-4 max-w-2xl">
              Open a room, continue where you stopped, and turn notes into
              flashcards, quizzes, and better explanations with AI.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3 sm:gap-4">
              <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Study streak</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="fire-icon">🔥</span>
                  <span className="text-2xl font-black text-white sm:text-3xl">
                    5 days
                  </span>
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Study XP</p>
                <p className="mt-3 text-3xl font-black text-amber-300 sm:text-4xl">
                  270
                </p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Quiz accuracy</p>
                <p className="mt-3 text-3xl font-black text-cyan-300 sm:text-4xl">
                  78%
                </p>
              </div>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/study-rooms"
                className="premium-button rounded-[1.1rem] px-5 py-3 text-center text-sm font-bold"
              >
                Open Study Rooms
              </Link>

              <Link
                href="/ai-tutor"
                className="premium-button-secondary rounded-[1.1rem] px-5 py-3 text-center text-sm font-semibold"
              >
                Ask AI Tutor
              </Link>
            </div>
          </div>

          <div className="premium-card gold-border rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-6">
            <div className="gold-chip mb-4">Today’s mission</div>

            <h3 className="panel-title text-white">Small wins. Big progress.</h3>

            <div className="mt-6 space-y-3">
              {missions.map((mission) => (
                <div
                  key={mission}
                  className="flex items-start gap-3 rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-4 py-3"
                >
                  <span className="subtle-dot mt-1.5 shrink-0" />
                  <p className="text-sm leading-7 text-slate-200">{mission}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-[1.2rem] border border-amber-300/20 bg-amber-400/10 px-4 py-4">
              <p className="text-sm font-semibold text-amber-100">
                Weak topic detected:
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-200">
                Routing protocols could use another review this week.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-4">
          {stats.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="stat-card p-5 sm:p-6 transition hover:-translate-y-1"
            >
              <p className="kpi-label">{item.label}</p>
              <p className={`mt-4 text-4xl font-black tracking-[-0.05em] sm:text-5xl ${item.tone}`}>
                {item.value}
              </p>
              <p className="kpi-help mt-4">{item.help}</p>
            </Link>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="premium-card gold-border rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="gold-chip mb-4">Recent rooms</div>
                <h3 className="panel-title text-white">Continue your rooms</h3>
                <p className="panel-muted mt-3 max-w-2xl">
                  Jump back into your active study spaces and continue from your
                  current progress.
                </p>
              </div>

              <Link
                href="/study-rooms"
                className="premium-button-secondary rounded-[1.05rem] px-4 py-3 text-center text-sm font-semibold"
              >
                View all rooms
              </Link>
            </div>

            <div className="mt-7 grid gap-4">
              {rooms.map((room) => (
                <Link
                  key={room.id}
                  href={`/study-rooms/${room.id}`}
                  className="rounded-[1.3rem] border border-white/8 bg-white/[0.03] p-4 transition hover:bg-white/[0.05] sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="gold-chip mb-3">{room.subject}</div>
                      <h4 className="text-xl font-black tracking-tight text-white">
                        {room.name}
                      </h4>
                    </div>

                    <p className="text-sm font-semibold text-amber-100">
                      {room.progress}% complete
                    </p>
                  </div>

                  <div className="room-progress mt-5">
                    <span style={{ width: `${room.progress}%` }} />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="content-grid">
            <div className="premium-card gold-border rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-6">
              <div className="gold-chip mb-4">Quick actions</div>
              <h3 className="panel-title text-white">Jump back in fast</h3>

              <div className="mt-6 grid gap-3">
                <Link
                  href="/ai-tutor"
                  className="premium-button rounded-[1.1rem] px-4 py-3 text-center text-sm font-bold"
                >
                  Ask AI Tutor
                </Link>

                <Link
                  href="/onboarding"
                  className="premium-button-secondary rounded-[1.1rem] px-4 py-3 text-center text-sm font-semibold"
                >
                  Update learning preferences
                </Link>

                <Link
                  href="/planner"
                  className="premium-button-secondary rounded-[1.1rem] px-4 py-3 text-center text-sm font-semibold"
                >
                  Plan study session
                </Link>
              </div>
            </div>

            <div className="premium-card gold-border rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-6">
              <div className="gold-chip mb-4">Smart suggestion</div>
              <h3 className="panel-title text-white">Best next step</h3>
              <p className="panel-muted mt-4">
                Review Networking Fundamentals, then ask AI Tutor to explain
                subnetting step by step before your next quiz.
              </p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
