"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  const lastSavedNoteRef = useRef<{
    id: number;
    title: string;
    content: string;
  } | null>(null);

  const autoSaveInProgressRef = useRef(false);
  const AUTO_SAVE_DELAY_MS = 10000;

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

  useEffect(() => {
    if (!ready || editingNoteId === null) return;
    if (!title.trim() || !content.trim()) return;

    const lastSaved = lastSavedNoteRef.current;
    const nextTitle = title.trim();
    const nextContent = content.trim();

    if (
      lastSaved &&
      lastSaved.id === editingNoteId &&
      lastSaved.title === nextTitle &&
      lastSaved.content === nextContent
    ) {
      return;
    }

    setSaveStatus("idle");

    const timer = window.setTimeout(async () => {
      if (autoSaveInProgressRef.current) return;

      try {
        autoSaveInProgressRef.current = true;
        setSaving(true);
        setSaveStatus("saving");
        setError("");

        const updatedNote = await updateNote(
          editingNoteId,
          nextTitle,
          nextContent
        );

        setNotes((current) =>
          current.map((note) =>
            note.id === editingNoteId ? updatedNote : note
          )
        );

        lastSavedNoteRef.current = {
          id: editingNoteId,
          title: nextTitle,
          content: nextContent,
        };

        setSaveStatus("saved");
      } catch (err) {
        setSaveStatus("idle");
        setError(err instanceof Error ? err.message : "Failed to auto-save note.");
      } finally {
        autoSaveInProgressRef.current = false;
        setSaving(false);
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [ready, editingNoteId, title, content]);

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
      setSaveStatus("saving");
      setError("");

      if (editingNoteId !== null) {
        const updatedNote = await updateNote(
          editingNoteId,
          title.trim(),
          content.trim()
        );

        setNotes((current) =>
          current.map((note) =>
            note.id === editingNoteId ? updatedNote : note
          )
        );

        lastSavedNoteRef.current = {
          id: editingNoteId,
          title: title.trim(),
          content: content.trim(),
        };

        setSaveStatus("saved");
        return;
      }

      const newNote = await createNote(selectedRoomId, title.trim(), content.trim());

      setNotes((current) => [newNote, ...current]);
      setTitle("");
      setContent("");
      setEditingNoteId(null);
      lastSavedNoteRef.current = null;
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("idle");
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


  function addAIHistoryItem(
    itemTitle: string,
    itemContent: string,
    options?: {
      prompt?: string;
      context?: string;
      tool?: "ask" | "lesson" | "flashcards" | "quiz";
    }
  ) {
    const newItem: AIHistoryItem = {
      id: `${Date.now()}-${Math.random()}`,
      title: itemTitle,
      content: itemContent,
      createdAt: new Date().toLocaleString(),
      prompt: options?.prompt,
      context: options?.context,
      tool: options?.tool,
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

      const prompt = "Summarize these notes clearly with the main points only.";
      const itemTitle = "Summary";
      setAiTitle(itemTitle);

      const result = await askAi(prompt, content);

      const output = String(result.answer || result.response || result.message || result);
      setAiContent(output);
      addAIHistoryItem(itemTitle, output, {
        prompt,
        context: content,
        tool: "ask",
      });
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

      const prompt = "Explain these notes in simple student-friendly words.";
      const itemTitle = "Explanation";
      setAiTitle(itemTitle);

      const result = await askAi(prompt, content);

      const output = String(result.answer || result.response || result.message || result);
      setAiContent(output);
      addAIHistoryItem(itemTitle, output, {
        prompt,
        context: content,
        tool: "ask",
      });
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

      const prompt = "Turn these notes into a clear mini lesson with examples and quick practice.";
      const itemTitle = "Lesson";
      setAiTitle(itemTitle);

      const result = await generateLesson(prompt, content);

      const output = String(result.lesson || result.answer || result.response || result.message || result);
      setAiContent(output);
      addAIHistoryItem(itemTitle, output, {
        prompt,
        context: content,
        tool: "lesson",
      });
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
      addAIHistoryItem("Flashcards", output, {
        tool: "flashcards",
      });
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
      addAIHistoryItem("Quiz", output, {
        tool: "quiz",
      });
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

      const prompt = "Based on these notes, ask me 3 helpful study questions and give short answers.";
      const itemTitle = "Study Questions";
      setAiTitle(itemTitle);

      const result = await askAi(prompt, content);

      const output = String(result.answer || result.response || result.message || result);
      setAiContent(output);
      addAIHistoryItem(itemTitle, output, {
        prompt,
        context: content,
        tool: "ask",
      });
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

  async function copyTextToClipboard(textToCopy: string) {
    if (!textToCopy.trim()) return;

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(textToCopy);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = textToCopy;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";

    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (!copied) {
      throw new Error("Copy is not supported in this browser.");
    }
  }


  async function handleCopyAI() {
    if (!aiContent.trim()) return;

    try {
      await copyTextToClipboard(aiContent);
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
      await copyTextToClipboard(itemContent);
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

  function handleTogglePinAIHistory(itemId: string) {
    setAiHistory((current) =>
      current.map((item) =>
        item.id === itemId
          ? { ...item, pinned: !item.pinned }
          : item
      )
    );

    setAiStatus("AI result pin updated.");
  }

  function handleDeleteAIHistory(itemId: string) {
    const confirmed = window.confirm("Delete this AI history item? This cannot be undone.");

    if (!confirmed) {
      return;
    }

    setAiHistory((current) => current.filter((item) => item.id !== itemId));
    setAiStatus("AI history item deleted.");
  }

  function handleClearAIHistory() {
    const confirmed = window.confirm("Clear all AI history? This cannot be undone.");

    if (!confirmed) {
      return;
    }

    setAiHistory([]);
    setAiStatus("AI history cleared.");
  }

  async function handleRegenerateAIHistory(itemId: string) {
    const item = aiHistory.find((historyItem) => historyItem.id === itemId);

    if (!item) {
      setError("AI history item was not found.");
      return;
    }

    if (!item.prompt || item.tool === "flashcards" || item.tool === "quiz") {
      setAiStatus("Regenerate is not available for this item yet.");
      return;
    }

    try {
      setAiLoading(true);
      setError("");
      setAiStatus("Regenerating AI result...");

      const itemContext = item.context || content;

      const result =
        item.tool === "lesson"
          ? await generateLesson(item.prompt, itemContext)
          : await askAi(item.prompt, itemContext);

      const output = String(
        result.lesson ||
          result.answer ||
          result.response ||
          result.message ||
          result
      );

      const regeneratedItem: AIHistoryItem = {
        id: `${Date.now()}-${Math.random()}`,
        title: `${item.title} (Regenerated)`,
        content: output,
        createdAt: new Date().toLocaleString(),
        prompt: item.prompt,
        context: item.context,
        tool: item.tool,
      };

      setAiHistory((current) => [regeneratedItem, ...current]);

      setAiTitle(regeneratedItem.title);
      setAiContent(output);
      setAiStatus("New regenerated AI result created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate AI result.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleReplyAIHistory(itemId: string, question: string) {
    const item = aiHistory.find((historyItem) => historyItem.id === itemId);

    if (!item) {
      setError("AI history item was not found.");
      return;
    }

    if (!question.trim()) {
      return;
    }

    try {
      setAiLoading(true);
      setError("");
      setAiStatus("Creating AI reply...");

      const replyTitle = `Reply to ${item.title}`;
      const replyPrompt = `You are continuing from this AI study result.

Previous result:

${item.content}

Student follow-up:
${question.trim()}

Answer clearly in a helpful student-friendly way.`;

      const replyContext = item.context || content;
      const result = await askAi(replyPrompt, replyContext);

      const output = String(
        result.answer ||
          result.response ||
          result.message ||
          result
      );

      const replyItem: AIHistoryItem = {
        id: `${Date.now()}-${Math.random()}`,
        title: replyTitle,
        content: output,
        createdAt: new Date().toLocaleString(),
        prompt: replyPrompt,
        context: replyContext,
        tool: "ask",
      };

      setAiHistory((current) => [replyItem, ...current]);
      setAiTitle(replyTitle);
      setAiContent(output);
      setAiStatus("AI reply created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create AI reply.");
    } finally {
      setAiLoading(false);
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
          saveStatus={saveStatus}
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
          onTogglePinHistory={handleTogglePinAIHistory}
          onRegenerateHistory={handleRegenerateAIHistory}
          onReplyHistory={handleReplyAIHistory}
          onDeleteHistory={handleDeleteAIHistory}
          onClearHistory={handleClearAIHistory}
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
            lastSavedNoteRef.current = {
              id: note.id,
              title: note.title.trim(),
              content: note.content.trim(),
            };
            setSaveStatus("saved");
          }}
        />
      </div>
    </AppShell>
  );
}
