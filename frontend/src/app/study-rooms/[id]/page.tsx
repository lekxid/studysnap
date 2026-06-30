"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";

const roomData: Record<string, { name: string; subject: string; progress: number }> = {
  "1": { name: "Networking Fundamentals", subject: "CSTN", progress: 62 },
  "2": { name: "Linux Administration", subject: "Server", progress: 48 },
  "7": { name: "Exam Prep Room", subject: "Mixed Review", progress: 42 },
};

const tools = [
  { title: "Notes", desc: "Write and review study notes.", href: "/notes", icon: "📝" },
  { title: "AI Tutor", desc: "Ask AI questions for this room.", href: "/ai-tutor", icon: "🤖" },
  { title: "Flashcards", desc: "Review generated flashcards.", href: "/flashcards", icon: "🧠" },
  { title: "Quizzes", desc: "Test your knowledge.", href: "/quizzes", icon: "❓" },
  { title: "Planner", desc: "Plan your study sessions.", href: "/planner", icon: "📅" },
  { title: "Progress", desc: "Track your learning progress.", href: "/progress", icon: "📈" },
];

export default function StudyRoomDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const room = roomData[id] || {
    name: "Study Room",
    subject: "General",
    progress: 0,
  };

  return (
    <AppShell
      title={room.name}
      subtitle={`Subject: ${room.subject} • Room workspace`}
    >
      <div className="content-grid">
        <section className="gold-card rounded-[2rem] p-6 sm:p-8">
          <div className="gold-chip mb-4">{room.subject}</div>

          <h2 className="panel-title text-white">
            {room.name}
          </h2>

          <p className="panel-muted mt-4 max-w-3xl">
            This is your study workspace. From here, you can open notes,
            ask AI, review flashcards, take quizzes, plan study time, and
            track your progress.
          </p>

          <div className="room-progress mt-6">
            <span style={{ width: `${room.progress}%` }} />
          </div>

          <p className="mt-3 text-sm font-semibold text-cyan-200">
            {room.progress}% complete
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool) => (
            <Link
              key={tool.title}
              href={tool.href}
              className="stat-card p-5 transition hover:-translate-y-1 hover:border-cyan-400/40"
            >
              <div className="text-3xl">{tool.icon}</div>
              <h3 className="mt-4 text-xl font-black text-white">
                {tool.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {tool.desc}
              </p>
            </Link>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
