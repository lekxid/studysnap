"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import AppShell from "@/components/AppShell";
import { createStudyRoom, getStudyRooms } from "@/lib/api";

type StudyRoom = {
  id: number;
  name: string;
  subject: string;
  description?: string;
};

export default function StudyRoomsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const filteredRooms = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return rooms;

    return rooms.filter((room) =>
      [room.name, room.subject, room.description || ""]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [rooms, search]);

  async function loadRooms() {
    try {
      setLoading(true);
      setError("");

      const data = await getStudyRooms();
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRoom() {
    if (!name.trim()) {
      setError("Enter a project name.");
      return;
    }

    if (!subject.trim()) {
      setError("Enter a subject.");
      return;
    }

    try {
      setCreating(true);
      setError("");

      const room = await createStudyRoom(name.trim(), subject.trim(), description.trim());

      setName("");
      setSubject("");
      setDescription("");
      setShowCreate(false);

      await loadRooms();

      if (room?.id) {
        router.push(`/study-rooms/${room.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    loadRooms();
  }, []);

  return (
    <AppShell
      title="Projects"
      subtitle="Your personal AI study workspaces"
    >
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-yellow-400/25 bg-gradient-to-br from-yellow-400/10 via-slate-950 to-slate-950 p-6 shadow-2xl shadow-yellow-500/10 sm:p-8">
          <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
            <div>
              <div className="mb-4 inline-flex rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-xs font-black text-yellow-200">
                📁 StudySnap Projects
              </div>

              <h2 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
                Everything you study lives in a project.
              </h2>

              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                Create a project for each course, exam, or topic. Each project keeps its own AI chats, PDFs, notes, flashcards, quizzes, planner, and learning memory.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-yellow-300"
                >
                  + New Project
                </button>

                <button
                  type="button"
                  onClick={() => document.getElementById("project-search")?.focus()}
                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:border-yellow-400/40"
                >
                  🔎 Search Projects
                </button>
              </div>
            </div>

            <div className="rounded-[2rem] border border-yellow-400/20 bg-black/25 p-6">
              <p className="text-sm font-bold text-yellow-200">Project Brain</p>
              <div className="mt-5 space-y-4 text-sm text-slate-300">
                <p>✅ AI chats stay inside each project</p>
                <p>✅ PDFs, notes, and flashcards stay organized</p>
                <p>✅ Future memory will learn per project</p>
                <p>✅ Students always know where to continue</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 items-center gap-3 rounded-2xl border border-yellow-400/20 bg-black/30 px-4 py-3">
              <span className="text-yellow-300">🔎</span>
              <input
                id="project-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search any project, subject, or description..."
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={loadRooms}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white hover:border-yellow-400/40"
              >
                Refresh
              </button>

              <button
                type="button"
                onClick={() => setShowCreate((value) => !value)}
                className="rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-yellow-300"
              >
                {showCreate ? "Close" : "+ Create"}
              </button>
            </div>
          </div>

          {showCreate ? (
            <div className="mt-5 rounded-[1.5rem] border border-yellow-400/20 bg-black/25 p-5">
              <h3 className="text-xl font-black text-white">Create a new project</h3>
              <p className="mt-1 text-sm text-slate-400">
                Example: Nursing Fundamentals, Anatomy, Pharmacology, Math Exam Prep.
              </p>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Project name"
                  className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-slate-500"
                />

                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-slate-500"
                />

                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Project instructions or description"
                  className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-slate-500"
                />
              </div>

              <button
                onClick={handleCreateRoom}
                disabled={creating}
                className="mt-5 rounded-xl bg-yellow-400 px-5 py-3 font-black text-slate-950 transition hover:bg-yellow-300 disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create Project"}
              </button>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5">
            <p className="text-sm font-bold text-yellow-200">Total Projects</p>
            <p className="mt-2 text-4xl font-black text-white">{rooms.length}</p>
          </div>

          <div className="rounded-3xl border border-blue-400/20 bg-blue-400/10 p-5">
            <p className="text-sm font-bold text-blue-200">Project AI</p>
            <p className="mt-2 text-4xl font-black text-white">On</p>
          </div>

          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5">
            <p className="text-sm font-bold text-emerald-200">Knowledge</p>
            <p className="mt-2 text-4xl font-black text-white">Ready</p>
          </div>

          <div className="rounded-3xl border border-pink-400/20 bg-pink-400/10 p-5">
            <p className="text-sm font-bold text-pink-200">Memory</p>
            <p className="mt-2 text-4xl font-black text-white">Soon</p>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-2xl font-black text-white">Your Projects</h3>
              <p className="mt-1 text-sm text-slate-400">
                Open a project to continue learning.
              </p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {loading ? (
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-slate-300">
                Loading projects...
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-yellow-400/30 bg-yellow-400/10 p-6 text-yellow-100">
                No projects found. Create one to begin.
              </div>
            ) : (
              filteredRooms.map((room) => (
                <Link
                  key={room.id}
                  href={`/study-rooms/${room.id}`}
                  className="group rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 transition hover:-translate-y-1 hover:border-yellow-400/40 hover:bg-yellow-400/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-2xl">
                      📁
                    </div>

                    <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-bold text-yellow-200">
                      Project
                    </span>
                  </div>

                  <div className="mt-5 rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-xs font-black text-yellow-200">
                    {room.subject}
                  </div>

                  <h3 className="mt-4 line-clamp-2 break-words text-2xl font-black leading-tight text-white">
                    {room.name}
                  </h3>

                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-300">
                    {room.description || "Open this project workspace."}
                  </p>

                  <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-2xl bg-black/25 p-3 text-slate-300">
                      PDFs
                    </div>
                    <div className="rounded-2xl bg-black/25 p-3 text-slate-300">
                      Notes
                    </div>
                    <div className="rounded-2xl bg-black/25 p-3 text-slate-300">
                      AI
                    </div>
                  </div>

                  <p className="mt-5 text-sm font-black text-yellow-300">
                    Open project →
                  </p>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
