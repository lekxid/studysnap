"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  ensureProjectRoomIdInUrl,
  getActiveProjectRoomId,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";
import useRequireAuth from "@/hooks/useRequireAuth";
import { askAi, createNote, deleteNote, downloadAITextPdf, downloadNotePdf, generateFlashcardsFromNotes, generateLesson, generateQuizzesFromNotes, getNotes, getStudyRooms, updateNote } from "@/lib/api";
import NotesStats from "@/features/notes/NotesStats";
import NotesEditor from "@/features/notes/NotesEditor";
import NotesAIWorkspace, { AIChatMessage, AIHistoryItem } from "@/features/notes/NotesAIWorkspace";
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

type AIHistoryDeleteRequest =
  | {
      kind: "item";
      itemId: string;
    }
  | {
      kind: "all";
    }
  | null;

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
  const [aiTitle, setAiTitle] = useState("Your AI Tutor");
  const [aiContent, setAiContent] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [aiHistory, setAiHistory] = useState<AIHistoryItem[]>([]);
  const [aiChatMessages, setAiChatMessages] = useState<AIChatMessage[]>([]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiComposerFocusToken, setAiComposerFocusToken] = useState(0);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [aiHistoryDeleteRequest, setAiHistoryDeleteRequest] =
    useState<AIHistoryDeleteRequest>(null);

  const lastSavedNoteRef = useRef<{
    id: number;
    title: string;
    content: string;
  } | null>(null);

  const aiWorkspaceRef = useRef<HTMLDivElement | null>(null);

  function scrollToAIWorkspace() {
    window.setTimeout(() => {
      aiWorkspaceRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
  }

  function focusAIComposer() {
    setAiComposerFocusToken((current) => current + 1);

    window.setTimeout(() => {
      aiWorkspaceRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  }

  function getAIText(result: unknown): string {
    if (typeof result === "string") return result;

    if (result && typeof result === "object") {
      const data = result as Record<string, unknown>;
      const possibleText =
        data.answer ||
        data.response ||
        data.message ||
        data.content ||
        data.text ||
        data.summary;

      if (typeof possibleText === "string") return possibleText;

      const lesson = data.lesson;

      if (typeof lesson === "string") return lesson;

      if (lesson && typeof lesson === "object") {
        const lessonData = lesson as Record<string, unknown>;
        const lessonText =
          lessonData.content ||
          lessonData.text ||
          lessonData.lesson ||
          lessonData.answer;

        if (typeof lessonText === "string") return lessonText;

        return JSON.stringify(lessonData, null, 2);
      }

      return JSON.stringify(data, null, 2);
    }

    return String(result || "");
  }

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

        const requestedRoomId = getActiveProjectRoomId();
        const matchingRoom =
          requestedRoomId !== null
            ? roomList.find((room) => room.id === requestedRoomId)
            : null;

        if (matchingRoom) {
          saveProjectRoomId(matchingRoom.id);
          ensureProjectRoomIdInUrl(matchingRoom.id);
          setSelectedRoomId(matchingRoom.id);
        } else if (roomList.length > 0) {
          saveProjectRoomId(roomList[0].id);
          ensureProjectRoomIdInUrl(roomList[0].id);
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
    if (selectedRoomId === null) return;

    saveProjectRoomId(selectedRoomId);
    ensureProjectRoomIdInUrl(selectedRoomId);
  }, [selectedRoomId]);

  useEffect(() => {
    if (!ready || selectedRoomId === null) return;

    const roomId = selectedRoomId;

    async function loadNotes() {
      try {
        setLoadingNotes(true);
        setError("");

        const data = await getNotes(roomId);
        const noteList: NoteItem[] = Array.isArray(data) ? data : [];
        setNotes(noteList);

        const params = new URLSearchParams(window.location.search);
        const requestedNoteId = Number(params.get("noteId"));
        const matchingNote = noteList.find((note) => note.id === requestedNoteId);

        if (matchingNote) {
          setEditingNoteId(matchingNote.id);
          setTitle(matchingNote.title);
          setContent(matchingNote.content);
          lastSavedNoteRef.current = {
            id: matchingNote.id,
            title: matchingNote.title,
            content: matchingNote.content,
          };

          window.setTimeout(() => {
            window.scrollTo({
              top: 0,
              behavior: "smooth",
            });
          }, 150);
        }
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


  async function handleDownloadNotePdf(noteId: number) {
    try {
      setDownloadingId(noteId);
      setError("");

      await downloadNotePdf(noteId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download PDF.");
    } finally {
      setDownloadingId(null);
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
    scrollToAIWorkspace();
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

      const output = getAIText(result);
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

      const output = getAIText(result);
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

      const output = getAIText(result);
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

      setAiTitle("Concept Cards");
      await generateFlashcardsFromNotes(selectedRoomId);
      const output = "Flashcards generated. Open Flashcards to review them.";
      setAiContent(output);
      addAIHistoryItem("Concept Cards", output, {
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

  async function sendAIChatMessage(message: string) {
    const userMessage = message.trim();

    if (!userMessage) return;

    if (!content.trim()) {
      setError("Write or select a note first.");
      return;
    }

    const createdAt = new Date().toLocaleString();

    setAiChatMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-user-${Math.random()}`,
        role: "user",
        content: userMessage,
        createdAt,
      },
    ]);

    setAiChatInput("");

    try {
      setAiLoading(true);
      setError("");
      setAiStatus("StudySnap AI is replying...");
      scrollToAIWorkspace();

      const recentConversation = aiChatMessages
        .slice(-8)
        .map(
          (message) =>
            `${message.role === "user" ? "Student" : "StudySnap AI"}: ${message.content}`
        )
        .join("\n\n");

      const roomDescription = selectedRoom
        ? `${selectedRoom.name}${selectedRoom.subject ? ` — ${selectedRoom.subject}` : ""}`
        : "No study room selected";

      const chatContext = `CURRENT STUDY ROOM:
${roomDescription}

CURRENT NOTE TITLE:
${title.trim() || "Untitled note"}

CURRENT NOTE CONTENT:
${content.trim()}

RECENT CONVERSATION:
${recentConversation || "No previous messages in this note conversation."}`;

      const result = await askAi(userMessage, chatContext);
      const output = getAIText(result);

      setAiChatMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant-${Math.random()}`,
          role: "assistant",
          content: output,
          createdAt: new Date().toLocaleString(),
        },
      ]);

      setAiStatus("AI reply created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send AI chat message.");
    } finally {
      setAiLoading(false);
    }
  }

  function handleAskAINote() {
    setError("");
    setAiStatus("Your AI Tutor is ready. Ask anything about this note.");
    focusAIComposer();
  }

  async function handleSendAIChat() {
    await sendAIChatMessage(aiChatInput);
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


  async function handleDownloadAITextPdf(itemTitle: string, itemContent: string) {
    if (!itemContent.trim()) return;

    try {
      setAiStatus("Preparing PDF...");
      setError("");

      await downloadAITextPdf(
        itemTitle || "StudySnap AI Export",
        itemContent,
        selectedRoom
          ? `AI export from ${selectedRoom.name}`
          : "Exported from StudySnap"
      );

      setAiStatus("PDF downloaded.");
    } catch (err) {
      setAiStatus("");
      setError(err instanceof Error ? err.message : "Failed to download AI PDF.");
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
    setAiHistoryDeleteRequest({
      kind: "item",
      itemId,
    });
  }

  function handleClearAIHistory() {
    setAiHistoryDeleteRequest({
      kind: "all",
    });
  }

  function confirmAIHistoryDelete() {
    if (!aiHistoryDeleteRequest) return;

    if (aiHistoryDeleteRequest.kind === "item") {
      const itemId = aiHistoryDeleteRequest.itemId;

      setAiHistory((current) =>
        current.filter((item) => item.id !== itemId)
      );

      setAiStatus("AI history item deleted.");
    } else {
      setAiHistory([]);
      setAiStatus("AI history cleared.");
    }

    setAiHistoryDeleteRequest(null);
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

      const output = getAIText(result);

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

      const output = getAIText(result);

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
      subtitle="Write, understand, and practise inside your study room"
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

        <div ref={aiWorkspaceRef}>
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
          onDownloadCurrent={handleDownloadAITextPdf}
          onDownloadHistory={handleDownloadAITextPdf}
          onTogglePinHistory={handleTogglePinAIHistory}
          onRegenerateHistory={handleRegenerateAIHistory}
          onReplyHistory={handleReplyAIHistory}
          onDeleteHistory={handleDeleteAIHistory}
          onClearHistory={handleClearAIHistory}
          chatMessages={aiChatMessages}
          chatInput={aiChatInput}
          chatLoading={aiLoading}
          focusComposerToken={aiComposerFocusToken}
          onChatInputChange={setAiChatInput}
          onSendChat={handleSendAIChat}
          />
        </div>

        <NotesLibrary
          selectedRoom={selectedRoom}
          query={query}
          filteredNotes={filteredNotes}
          loadingNotes={loadingNotes}
          deletingId={deletingId}
          downloadingId={downloadingId}
          onQueryChange={setQuery}
          onDeleteNote={handleDeleteNote}
          onDownloadNote={handleDownloadNotePdf}
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
            setAiChatMessages([]);
            setAiChatInput("");
            setAiContent("");
            setAiTitle("Your AI Tutor");
            setAiStatus("Opened a new note. Ask anything about it.");
          }}
        />
      </div>

      {aiHistoryDeleteRequest ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/75 px-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setAiHistoryDeleteRequest(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-delete-title"
            className="w-full max-w-md rounded-[1.5rem] border border-red-400/20 bg-[#0a1422] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.65)]"
          >
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-red-400/20 bg-red-500/10 text-xl">
              🗑️
            </div>

            <h3
              id="ai-delete-title"
              className="mt-5 text-xl font-black text-white"
            >
              {aiHistoryDeleteRequest.kind === "all"
                ? "Clear created results?"
                : "Delete this result?"}
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              {aiHistoryDeleteRequest.kind === "all"
                ? "This will remove every summary, lesson, explanation, and practice result created from this note."
                : "This result will be removed from your AI history."}
            </p>

            <p className="mt-3 text-xs font-semibold text-red-300">
              This action cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setAiHistoryDeleteRequest(null)}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.08]"
              >
                Keep it
              </button>

              <button
                type="button"
                onClick={confirmAIHistoryDelete}
                className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-red-400"
              >
                {aiHistoryDeleteRequest.kind === "all"
                  ? "Clear all"
                  : "Delete"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
