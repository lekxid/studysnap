"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import AppShell from "@/components/AppShell";
import { createStudyRoom, getStudyRooms } from "@/lib/api";

type StudyRoom = {
  id: number;
  name: string;
  subject: string;
  description?: string;
};

export default function StudyRoomsPage() {
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function loadRooms() {
    try {
      setLoading(true);
      setError("");

      const data = await getStudyRooms();
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load study rooms.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRoom() {
    if (!name.trim()) {
      setError("Enter a study room name.");
      return;
    }

    if (!subject.trim()) {
      setError("Enter a subject.");
      return;
    }

    try {
      setCreating(true);
      setError("");

      await createStudyRoom(name.trim(), subject.trim(), description.trim());

      setName("");
      setSubject("");
      setDescription("");

      await loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(
      () => void loadRooms(),
      0,
    );

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AppShell
      title="Study Rooms"
      subtitle="Create and open your study workspaces"
    >
      <div className="content-grid">
        <section className="gold-card rounded-[2rem] p-6 sm:p-8">
          <div className="gold-chip mb-4">Rooms</div>

          <h2 className="panel-title text-white">Create a Study Room</h2>

          <p className="panel-muted mt-3">
            Make a room for each course, subject, or exam topic.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Room name"
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
              placeholder="Description"
              className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-slate-500"
            />
          </div>

          <button
            onClick={handleCreateRoom}
            disabled={creating}
            className="mt-5 rounded-xl bg-cyan-400 px-5 py-3 font-black text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create Room"}
          </button>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            <div className="stat-card p-5 text-slate-300">Loading rooms...</div>
          ) : rooms.length === 0 ? (
            <div className="stat-card p-5 text-slate-300">
              No study rooms yet. Create one above.
            </div>
          ) : (
            rooms.map((room) => (
              <Link
                key={room.id}
                href={`/study-rooms/${room.id}`}
                className="stat-card p-5 transition hover:-translate-y-1 hover:border-cyan-400/40"
              >
                <div className="gold-chip mb-4">{room.subject}</div>

                <h3 className="text-xl font-black text-white">{room.name}</h3>

                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {room.description || "Open this study room workspace."}
                </p>

                <p className="mt-4 text-sm font-bold text-cyan-300">
                  Open room →
                </p>
              </Link>
            ))
          )}
        </section>
      </div>
    </AppShell>
  );
}