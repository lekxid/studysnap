"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import { createNote, deleteNote, getNotes, getStudyRooms } from "@/lib/api";
import NotesStats from "@/features/notes/NotesStats";
import NotesEditor from "@/features/notes/NotesEditor";
import NotesLibrary from "@/features/notes/NotesLibrary";

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
      <NotesStats notes={notes} selectedRoom={selectedRoom} />

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <NotesEditor
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          selectedRoom={selectedRoom}
          title={title}
          content={content}
          wordCount={wordCount}
          characterCount={characterCount}
          loadingRooms={loadingRooms}
          saving={saving}
          error={error}
          onRoomChange={setSelectedRoomId}
          onTitleChange={setTitle}
          onContentChange={setContent}
          onSave={handleSaveNote}
        />

        <NotesLibrary
          selectedRoom={selectedRoom}
          query={query}
          filteredNotes={filteredNotes}
          loadingNotes={loadingNotes}
          deletingId={deletingId}
          onQueryChange={setQuery}
          onDeleteNote={handleDeleteNote}
        />
      </div>
    </AppShell>
  );
}
