"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import { createNote, deleteNote, getNotes, getStudyRooms } from "@/lib/api";

type StudyRoom = {
  id: number;
  name: string;
  subject: string;
  description?: string;
};

type NoteItem = {
  id: number;
  title: string;
  content: string;
  study_room_id: number;
  owner_id: number;
  created_at?: string;
};

export default function NotesPage() {
  const ready = useRequireAuth();

  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [notes, setNotes] = useState<NoteItem[]>([]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");

  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;

    async function loadRooms() {
      try {
        setLoadingRooms(true);
        setError("");

        const data = await getStudyRooms();
        const roomList: StudyRoom[] = Array.isArray(data) ? data : [];

        setRooms(roomList);

        if (roomList.length > 0) {
          setSelectedRoomId(roomList[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load study rooms.");
      } finally {
        setLoadingRooms(false);
      }
    }

    loadRooms();
  }, [ready]);

  useEffect(() => {
    if (!ready || selectedRoomId === null) return;

    const roomId = selectedRoomId;

    async function loadNotes() {
      try {
        setLoadingNotes(true);
        setError("");

        const data = await getNotes(roomId);
        setNotes(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load notes.");
      } finally {
        setLoadingNotes(false);
      }
    }

    loadNotes();
  }, [ready, selectedRoomId]);

  async function handleSaveNote() {
    if (selectedRoomId === null) {
      setError("Create or select a study room first.");
      return;
    }

    if (!title.trim()) {
      setError("Enter a note title.");
      return;
    }

    if (!content.trim()) {
      setError("Enter note content.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const newNote = await createNote(selectedRoomId, title.trim(), content.trim());

      setNotes((current) => [newNote, ...current]);
      setTitle("");
      setContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteNote(noteId: number) {
    try {
      setDeletingId(noteId);
      setError("");

      await deleteNote(noteId);
      setNotes((current) => current.filter((note) => note.id !== noteId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete note.");
    } finally {
      setDeletingId(null);
    }
  }

  const wordCount = useMemo(() => {
    return content.trim() ? content.trim().split(/\s+/).length : 0;
  }, [content]);

  const characterCount = content.length;

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;

    return notes.filter(
      (note) =>
        note.title.toLowerCase().includes(q) ||
        note.content.toLowerCase().includes(q)
    );
  }, [notes, query]);

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId);

  if (!ready) {
    return (
      <div className="min-h-screen bg-black p-6 text-white">
        Checking authentication...
      </div>
    );
  }

  return (
    <AppShell
      title="Notes"
      subtitle="Create database-backed study notes connected to your study rooms"
    >
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-white/10 bg-[#0a1022] p-6 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
                Notes 2.0
              </p>
              <h3 className="mt-2 text-2xl font-bold text-white">
                Write a study note
              </h3>
              <p className="mt-2 text-sm text-white/60">
                Notes now save to the backend database and are linked to a study room.
              </p>
            </div>

            <div className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm text-white/70">
              {saving ? "Saving..." : "Database ready"}
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Study Room
              </span>
              <select
                className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                value={selectedRoomId ?? ""}
                onChange={(e) => setSelectedRoomId(Number(e.target.value))}
                disabled={loadingRooms || rooms.length === 0}
              >
                {rooms.length === 0 ? (
                  <option value="">No study rooms found</option>
                ) : (
                  rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} — {room.subject}
                    </option>
                  ))
                )}
              </select>
            </label>

            <input
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300"
              placeholder="Note title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <textarea
              className="min-h-[380px] w-full resize-y rounded-xl border border-white/20 bg-black px-4 py-4 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300"
              placeholder="Write your study notes here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/60">
              <div>
                {wordCount} words · {characterCount} characters
              </div>

              {selectedRoom ? (
                <div>
                  Saving into:{" "}
                  <span className="font-semibold text-cyan-300">
                    {selectedRoom.name}
                  </span>
                </div>
              ) : null}
            </div>

            <button
              onClick={handleSaveNote}
              disabled={saving || rooms.length === 0}
              className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving Note..." : "Save Note"}
            </button>

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
                {error}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0a1022] p-6 shadow-2xl">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
              Library
            </p>
            <h3 className="mt-2 text-2xl font-bold text-white">Room Notes</h3>
            <p className="mt-2 text-sm text-white/60">
              {selectedRoom
                ? `Showing notes for ${selectedRoom.name}.`
                : "Select a room to view notes."}
            </p>
          </div>

          <input
            className="mt-6 w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300"
            placeholder="Search inside notes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {loadingNotes ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6 text-white/70">
              Loading notes...
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6 text-white/70">
              No notes found for this room yet.
            </div>
          ) : (
            <div className="mt-6 max-h-[650px] space-y-4 overflow-y-auto pr-1">
              {filteredNotes.map((note) => (
                <article
                  key={note.id}
                  className="rounded-2xl border border-white/10 bg-black p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-semibold text-cyan-300">
                        {note.title}
                      </h4>
                      {note.created_at ? (
                        <p className="mt-1 text-xs text-white/40">
                          Created {new Date(note.created_at).toLocaleString()}
                        </p>
                      ) : null}
                    </div>

                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      disabled={deletingId === note.id}
                      className="rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingId === note.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>

                  <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/75">
                    {note.content}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
