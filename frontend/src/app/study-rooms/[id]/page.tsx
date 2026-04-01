"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";

const rooms = [
  {
    id: "1",
    name: "Networking Fundamentals",
    subject: "CSTN",
    progress: 62,
    description:
      "Core networking concepts, subnetting practice, routing basics, and exam prep.",
    notes: [
      "OSI model summary",
      "TCP vs UDP comparison",
      "Subnetting cheat notes",
    ],
    files: [
      "networking-week-3.pdf",
      "subnetting-practice.png",
      "router-config-notes.docx",
    ],
    tasks: [
      "Review subnetting",
      "Practice routing protocols",
      "Take quick quiz",
    ],
  },
  {
    id: "2",
    name: "Linux Administration",
    subject: "Server",
    progress: 48,
    description:
      "Linux commands, permissions, services, package management, and troubleshooting.",
    notes: [
      "Linux permissions breakdown",
      "Systemctl commands",
      "Apache setup notes",
    ],
    files: [
      "linux-services.pdf",
      "apache-ssl-lab.png",
      "server-checklist.docx",
    ],
    tasks: [
      "Review permissions",
      "Practice systemctl",
      "Summarize Apache SSL lab",
    ],
  },
  {
    id: "7",
    name: "Exam Prep Room",
    subject: "Mixed Review",
    progress: 42,
    description:
      "Mixed revision space for quick review, flashcards, summaries, and exam countdown prep.",
    notes: [
      "Important exam topics",
      "Revision checklist",
      "Last-minute weak areas",
    ],
    files: [
      "final-review.pdf",
      "topic-map.png",
      "practice-questions.docx",
    ],
    tasks: [
      "Review weak topics",
      "Generate flashcards",
      "Take 5-question quiz",
    ],
  },
];

export default function StudyRoomDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");

  const room = useMemo(() => {
    return rooms.find((item) => item.id === id);
  }, [id]);

  if (!room) {
    return (
      <AppShell
        title="Study Room"
        subtitle="This room could not be found."
      >
        <div className="premium-card gold-border rounded-[1.7rem] p-6 sm:rounded-[2rem] sm:p-8">
          <div className="gold-chip mb-4">Room not found</div>
          <h3 className="panel-title text-white">That study room does not exist.</h3>
          <p className="panel-muted mt-4">
            Go back to your rooms and choose another one.
          </p>

          <Link
            href="/study-rooms"
            className="premium-button mt-6 inline-flex rounded-[1.1rem] px-5 py-3 text-sm font-bold"
          >
            Back to Study Rooms
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={room.name}
      subtitle={`${room.subject} room with notes, files, AI tools, and practice actions.`}
    >
      <div className="content-grid">
        <section className="hero-grid">
          <div className="gold-card rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-3xl">
                <div className="gold-chip mb-4">{room.subject}</div>
                <h3 className="panel-title text-white text-balance">
                  {room.name}
                </h3>
                <p className="panel-muted mt-4">{room.description}</p>
              </div>

              <div className="self-start rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-4 sm:min-w-[160px]">
                <p className="kpi-label">Progress</p>
                <p className="mt-3 text-3xl font-black text-amber-300 sm:text-4xl">
                  {room.progress}%
                </p>
              </div>
            </div>

            <div className="room-progress mt-7">
              <span style={{ width: `${room.progress}%` }} />
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/ai-tutor"
                className="premium-button rounded-[1.1rem] px-5 py-3 text-center text-sm font-bold"
              >
                Ask AI About This Room
              </Link>

              <button className="premium-button-secondary rounded-[1.1rem] px-5 py-3 text-sm font-semibold">
                Add Note
              </button>

              <button className="premium-button-secondary rounded-[1.1rem] px-5 py-3 text-sm font-semibold">
                Upload File
              </button>
            </div>
          </div>

          <div className="premium-card gold-border rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-6">
            <div className="gold-chip mb-4">Room stats</div>
            <h3 className="panel-title text-white">Quick overview</h3>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-[1.05rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-xs">
                  Notes
                </p>
                <p className="mt-2 text-xl font-black text-white sm:text-2xl">
                  {room.notes.length}
                </p>
              </div>

              <div className="rounded-[1.05rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-xs">
                  Files
                </p>
                <p className="mt-2 text-xl font-black text-white sm:text-2xl">
                  {room.files.length}
                </p>
              </div>

              <div className="rounded-[1.05rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-xs">
                  Flashcards
                </p>
                <p className="mt-2 text-xl font-black text-white sm:text-2xl">
                  12
                </p>
              </div>

              <div className="rounded-[1.05rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-xs">
                  Quizzes
                </p>
                <p className="mt-2 text-xl font-black text-white sm:text-2xl">
                  4
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="content-grid">
            <div className="premium-card gold-border rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="gold-chip mb-4">Notes</div>
                  <h3 className="panel-title text-white">Room notes</h3>
                </div>

                <button className="premium-button-secondary rounded-[1.05rem] px-4 py-3 text-sm font-semibold">
                  New note
                </button>
              </div>

              <div className="mt-6 grid gap-3">
                {room.notes.map((note) => (
                  <div
                    key={note}
                    className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-4"
                  >
                    <p className="text-base font-semibold text-white">{note}</p>
                    <p className="mt-2 text-sm leading-7 text-slate-400">
                      Open, edit, summarize, or turn this into flashcards.
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="premium-card gold-border rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="gold-chip mb-4">Files</div>
                  <h3 className="panel-title text-white">Uploaded materials</h3>
                </div>

                <button className="premium-button-secondary rounded-[1.05rem] px-4 py-3 text-sm font-semibold">
                  Upload file
                </button>
              </div>

              <div className="mt-6 grid gap-3">
                {room.files.map((file) => (
                  <div
                    key={file}
                    className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-4"
                  >
                    <p className="text-base font-semibold text-white">{file}</p>
                    <p className="mt-2 text-sm leading-7 text-slate-400">
                      Use AI to summarize, explain, or generate quiz questions from this file.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="content-grid">
            <div className="premium-card gold-border rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-6">
              <div className="gold-chip mb-4">AI actions</div>
              <h3 className="panel-title text-white">Study tools for this room</h3>

              <div className="mt-6 grid gap-3">
                <Link
                  href="/ai-tutor"
                  className="premium-button rounded-[1.1rem] px-4 py-3 text-center text-sm font-bold"
                >
                  Explain this topic
                </Link>

                <button className="premium-button-secondary rounded-[1.1rem] px-4 py-3 text-sm font-semibold">
                  Summarize notes
                </button>

                <button className="premium-button-secondary rounded-[1.1rem] px-4 py-3 text-sm font-semibold">
                  Make flashcards
                </button>

                <button className="premium-button-secondary rounded-[1.1rem] px-4 py-3 text-sm font-semibold">
                  Generate quiz
                </button>

                <button className="premium-button-secondary rounded-[1.1rem] px-4 py-3 text-sm font-semibold">
                  Test me now
                </button>
              </div>
            </div>

            <div className="premium-card gold-border rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-6">
              <div className="gold-chip mb-4">Next tasks</div>
              <h3 className="panel-title text-white">Recommended actions</h3>

              <div className="mt-6 space-y-3">
                {room.tasks.map((task) => (
                  <div
                    key={task}
                    className="flex items-start gap-3 rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-4 py-4"
                  >
                    <span className="subtle-dot mt-1.5 shrink-0" />
                    <p className="text-sm leading-7 text-slate-200">{task}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="gold-card rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-6">
              <div className="gold-chip mb-4">Smart suggestion</div>
              <h3 className="panel-title text-white">Best next study step</h3>
              <p className="panel-muted mt-4">
                Review the latest notes, then generate flashcards before taking a short quiz.
              </p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
