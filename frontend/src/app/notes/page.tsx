"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import { loadJSON, saveJSON } from "@/lib/storage";

type NoteItem = {
  id: number;
  title: string;
  content: string;
};

const STORAGE_KEY = "studysnap_notes";

export default function NotesPage() {
  const ready = useRequireAuth();

  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    setNotes(loadJSON<NoteItem[]>(STORAGE_KEY, []));
  }, [ready]);

  function persist(next: NoteItem[]) {
    setNotes(next);
    saveJSON(STORAGE_KEY, next);
  }

  function addNote() {
    if (!title.trim()) {
      setError("Enter a note title.");
      return;
    }
    if (!content.trim()) {
      setError("Enter note content.");
      return;
    }

    setError("");

    const next: NoteItem[] = [
      {
        id: Date.now(),
        title: title.trim(),
        content: content.trim(),
      },
      ...notes,
    ];

    persist(next);
    setTitle("");
    setContent("");
  }

  function deleteNote(id: number) {
    persist(notes.filter((note) => note.id !== id));
  }

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;

    return notes.filter(
      (note) =>
        note.title.toLowerCase().includes(q) ||
        note.content.toLowerCase().includes(q)
    );
  }, [notes, query]);

  if (!ready) {
    return <div className="min-h-screen bg-black text-white p-6">Checking authentication...</div>;
  }

  return (
    <AppShell title="Notes" subtitle="Save notes, search inside them, and build your study base">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-xl font-semibold text-cyan-300">Create Note</h3>

          <div className="mt-4 space-y-4">
            <input
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30"
              placeholder="Note title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <textarea
              className="min-h-[200px] w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30"
              placeholder="Paste notes here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />

            <button
              onClick={addNote}
              className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-black"
            >
              Save Note
            </button>

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-xl font-semibold text-cyan-300">Smart Search</h3>
            <input
              className="w-full max-w-sm rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30"
              placeholder="Search inside notes..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {filteredNotes.length === 0 ? (
            <div className="mt-6 rounded-xl bg-white/5 p-6 text-white/70">
              No notes found.
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {filteredNotes.map((note) => (
                <div key={note.id} className="rounded-2xl border border-white/10 bg-black p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h4 className="text-lg font-semibold text-cyan-300">{note.title}</h4>
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                  <pre className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/80">
                    {note.content}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
