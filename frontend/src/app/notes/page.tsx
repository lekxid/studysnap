"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import { askAi, createNote, deleteNote, generateFlashcardsFromNotes, generateLesson, generateQuizzesFromNotes, getNotes, getStudyRooms, updateNote } from "@/lib/api";
import NotesStats from "@/features/notes/NotesStats";
import NotesEditor from "@/features/notes/NotesEditor";
import NotesAIWorkspace, { AIHistoryItem } from "@/features/notes/NotesAIWorkspace";
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

  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");

  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [aiTitle, setAiTitle] = useState("AI Assistant");
  const [aiContent, setAiContent] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [aiHistory, setAiHistory] = useState<AIHistoryItem[]>([]);
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


  function addAIHistoryItem(itemTitle: string, itemContent: string) {
    const newItem: AIHistoryItem = {
      id: `${Date.now()}-${Math.random()}`,
      title: itemTitle,
      content: itemContent,
      createdAt: new Date().toLocaleString(),
    };

    setAiHistory((current) => [newItem, ...current]);
  }

  async function handleSummarizeNote() {
    if (!content.trim()) {
      setError("Write or select a note first.");
      return;
    }

    try {
      setAiLoading(true);
      setError("");

      setAiTitle("Summary");

      const result = await askAi(
        "Summarize these notes clearly with the main points only.",
        content
      );

      const output = String(result.answer || result.response || result.message || result);
      setAiContent(output);
      addAIHistoryItem(aiTitle, output);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to summarize note.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleExplainNote() {
    if (!content.trim()) {
      setError("Write or select a note first.");
      return;
    }

    try {
      setAiLoading(true);
      setError("");

      setAiTitle("Explanation");

      const result = await askAi(
        "Explain these notes in simple student-friendly words.",
        content
      );

      const output = String(result.answer || result.response || result.message || result);
      setAiContent(output);
      addAIHistoryItem(aiTitle, output);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to explain note.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleLessonNote() {
    if (!content.trim()) {
      setError("Write or select a note first.");
      return;
    }

    try {
      setAiLoading(true);
      setError("");

      setAiTitle("Lesson");

      const result = await generateLesson(
        "Turn these notes into a clear mini lesson with examples and quick practice.",
        content
      );

      const output = String(result.lesson || result.answer || result.response || result.message || result);
      setAiContent(output);
      addAIHistoryItem(aiTitle, output);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create lesson.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleFlashcardsNote() {
    if (selectedRoomId === null) {
      setError("Select a study room first.");
      return;
    }

    try {
      setAiLoading(true);
      setError("");

      setAiTitle("Flashcards");
      await generateFlashcardsFromNotes(selectedRoomId);
      const output = "Flashcards generated. Open Flashcards to review them.";
      setAiContent(output);
      addAIHistoryItem("Flashcards", output);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate flashcards.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleQuizNote() {
    if (selectedRoomId === null) {
      setError("Select a study room first.");
      return;
    }

    try {
      setAiLoading(true);
      setError("");

      setAiTitle("Quiz");
      await generateQuizzesFromNotes(selectedRoomId);
      const output = "Quiz generated. Open Quizzes to review it.";
      setAiContent(output);
      addAIHistoryItem("Quiz", output);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate quiz.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleAskAINote() {
    if (!content.trim()) {
      setError("Write or select a note first.");
      return;
    }

    try {
      setAiLoading(true);
      setError("");

      setAiTitle("Study Questions");

      const result = await askAi(
        "Based on these notes, ask me 3 helpful study questions and give short answers.",
        content
      );

      const output = String(result.answer || result.response || result.message || result);
      setAiContent(output);
      addAIHistoryItem(aiTitle, output);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ask AI.");
    } finally {
      setAiLoading(false);
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


  async function handleCopyAI() {
    if (!aiContent.trim()) return;

    try {
      await navigator.clipboard.writeText(aiContent);
      setAiStatus("Copied to clipboard.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy AI response.");
    }
  }

  function handleInsertAI() {
    if (!aiContent.trim()) return;

    setContent((current) =>
      current.trim()
        ? current + "\n\n" + aiContent
        : aiContent
    );

    setAiStatus("Inserted into note.");
  }

  async function handleCopyAIHistory(itemContent: string) {
    if (!itemContent.trim()) return;

    try {
      await navigator.clipboard.writeText(itemContent);
      setAiStatus("Copied history item.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy AI history item.");
    }
  }

  function handleInsertAIHistory(itemContent: string) {
    if (!itemContent.trim()) return;

    setContent((current) =>
      current.trim()
        ? current + "\n\n" + itemContent
        : itemContent
    );

    setAiStatus("Inserted history item into note.");
  }

  async function handleSaveAIHistoryAsNote(itemTitle: string, itemContent: string) {
    if (selectedRoomId === null) {
      setError("Select a study room first.");
      return;
    }

    if (!itemContent.trim()) return;

    try {
      setSaving(true);
      setError("");

      const newNote = await createNote(
        selectedRoomId,
        `AI ${itemTitle}`,
        itemContent
      );

      setNotes((current) => [newNote, ...current]);
      setAiStatus("AI result saved as a new note.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save AI result as note.");
    } finally {
      setSaving(false);
    }
  }

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
          onSummarize={handleSummarizeNote}
          onExplain={handleExplainNote}
          onLesson={handleLessonNote}
          onFlashcards={handleFlashcardsNote}
          onQuiz={handleQuizNote}
          onAskAI={handleAskAINote}
        />

        <NotesAIWorkspace
          title={aiTitle}
          content={aiContent}
          loading={aiLoading}
          status={aiStatus}
          history={aiHistory}
          onCopy={handleCopyAI}
          onInsert={handleInsertAI}
          onCopyHistory={handleCopyAIHistory}
          onInsertHistory={handleInsertAIHistory}
          onSaveHistoryAsNote={handleSaveAIHistoryAsNote}
        />

        <NotesLibrary
          selectedRoom={selectedRoom}
          query={query}
          filteredNotes={filteredNotes}
          loadingNotes={loadingNotes}
          deletingId={deletingId}
          onQueryChange={setQuery}
          onDeleteNote={handleDeleteNote}
          onSelectNote={(note) => {
            setEditingNoteId(note.id);
            setTitle(note.title);
            setContent(note.content);
            setSaveStatus("idle");
          }}
        />
      </div>
    </AppShell>
  );
}
