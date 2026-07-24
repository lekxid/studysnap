"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import SimpleMarkdown from "@/components/ui/SimpleMarkdown";
import {
  askBrain,
  deleteBrainHistory,
  getBrainHistory,
  getStudyRooms,
  saveBrainHistoryAsNote,
  type BrainAnswerResponse,
  type BrainHistoryItem,
  type BrainSource,
} from "@/lib/api";

type StudyRoom = {
  id: number;
  name: string;
  subject?: string;
  description?: string;
};

const suggestedQuestions = [
  "What do I need to complete for professional readiness?",
  "Summarize my most important study materials.",
  "What should I review next?",
  "Find my weakest concepts and explain them simply.",
];

function formatScore(score: number | undefined) {
  if (typeof score !== "number") return "—";
  return `${Math.round(score * 100)}%`;
}

function getSourceLabel(sourceType: string) {
  if (sourceType === "pdf_chunk") return "PDF";
  if (sourceType === "note_chunk") return "Note";
  if (sourceType === "flashcard") return "Flashcard";
  if (sourceType === "brain_memory") return "Memory";
  return sourceType.replaceAll("_", " ");
}

function getStudyRoomId(source: BrainSource) {
  const value = source.metadata?.study_room_id;

  if (typeof value === "number") return value;

  return null;
}

function historyItemToAnswer(item: BrainHistoryItem): BrainAnswerResponse {
  return {
    id: item.id,
    answer: item.answer,
    sources: item.sources || [],
    metadata: item.metadata || {},
    created_at: item.created_at,
  };
}

function formatDate(value?: string) {
  if (!value) return "Just now";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

async function copyTextWithFallback(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);

    return copied;
  } catch {
    return false;
  }
}

export default function BrainPage() {
  const router = useRouter();

  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<BrainAnswerResponse | null>(null);
  const [history, setHistory] = useState<BrainHistoryItem[]>([]);
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<number | null>(
    null
  );

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [answerActionMessage, setAnswerActionMessage] = useState("");

  const answerSectionRef = useRef<HTMLElement | null>(null);

  const detectedRoomId = useMemo(() => {
    if (!result) return null;

    if (typeof result.metadata.effective_study_room_id === "number") {
      return result.metadata.effective_study_room_id;
    }

    for (const source of result.sources) {
      const roomId = getStudyRoomId(source);
      if (roomId !== null) return roomId;
    }

    return null;
  }, [result]);

  const targetSaveRoomId = detectedRoomId ?? selectedRoomId;

  async function loadRooms() {
    setRoomsLoading(true);

    try {
      const data = await getStudyRooms();
      const roomList: StudyRoom[] = Array.isArray(data) ? data : [];
      setRooms(roomList);

      if (selectedRoomId === null && roomList.length > 0) {
        setSelectedRoomId(roomList[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load study rooms.");
    } finally {
      setRoomsLoading(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);

    try {
      const items = await getBrainHistory(8);
      setHistory(items);

      if (!result && items.length > 0) {
        setResult(historyItemToAnswer(items[0]));
        setQuestion(items[0].question);

        if (items[0].study_room_id) {
          setSelectedRoomId(items[0].study_room_id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Brain history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRooms();
      void loadHistory();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (detectedRoomId === null) return;

    const timer = window.setTimeout(
      () => setSelectedRoomId(detectedRoomId),
      0,
    );

    return () => window.clearTimeout(timer);
  }, [detectedRoomId]);

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") return;
    if (event.shiftKey) return;

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanQuestion = question.trim();

    if (!cleanQuestion) {
      setError("Ask StudySnap Brain a question first.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMessage("");
    setAnswerActionMessage("");

    try {
      const response = await askBrain(cleanQuestion, selectedRoomId, 6);
      setResult(response);

      const effectiveRoom = response.metadata.effective_study_room_id;
      if (typeof effectiveRoom === "number") {
        setSelectedRoomId(effectiveRoom);
      }

      await loadHistory();

      setTimeout(() => {
        answerSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 150);
    } catch (err) {
      setError(err instanceof Error ? err.message : "StudySnap Brain failed.");
    } finally {
      setLoading(false);
    }
  }

  function applySuggestedQuestion(value: string) {
    setQuestion(value);
    setError("");
    setSuccessMessage("");
    setAnswerActionMessage("");
  }

  function openHistoryItem(item: BrainHistoryItem) {
    setResult(historyItemToAnswer(item));
    setQuestion(item.question);
    setError("");
    setSuccessMessage("");
    setAnswerActionMessage("");

    if (item.study_room_id) {
      setSelectedRoomId(item.study_room_id);
    }

    setTimeout(() => {
      answerSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }

  async function handleCopyAnswer() {
    if (!result?.answer) {
      setAnswerActionMessage("No answer to copy yet.");
      return;
    }

    const copied = await copyTextWithFallback(result.answer);

    if (copied) {
      setAnswerActionMessage("Answer copied.");
    } else {
      setAnswerActionMessage("Copy failed. Select the answer text and copy manually.");
    }
  }

  async function handleSaveAsNote() {
    if (!result?.id) {
      setError("Ask Brain first before saving this answer as a note.");
      return;
    }

    if (targetSaveRoomId === null) {
      setError("Choose a study room before saving this Brain answer as a note.");
      return;
    }

    setSavingNote(true);
    setError("");
    setSuccessMessage("");
    setAnswerActionMessage("Saving as note...");

    try {
      const response = await saveBrainHistoryAsNote(
        result.id,
        targetSaveRoomId,
        `Brain Answer: ${question.trim().slice(0, 70) || "StudySnap"}`
      );

      if (response.already_saved) {
        setAnswerActionMessage(`Already saved as note: ${response.note.title}`);
      } else {
        setAnswerActionMessage(`Saved as note: ${response.note.title}`);
      }

      setTimeout(() => {
        router.push(
          `/notes?roomId=${response.note.study_room_id}&noteId=${response.note.id}`
        );
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save as note.");
      setAnswerActionMessage("");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleDeleteHistory(item: BrainHistoryItem) {
    const confirmed = window.confirm(
      "Delete this Brain history item? This will not delete any notes already saved."
    );

    if (!confirmed) return;

    setDeletingHistoryId(item.id);
    setError("");
    setSuccessMessage("");
    setAnswerActionMessage("");

    try {
      await deleteBrainHistory(item.id);

      const remaining = history.filter(
        (historyItem) => historyItem.id !== item.id
      );

      setHistory(remaining);

      if (result?.id === item.id) {
        if (remaining.length > 0) {
          setResult(historyItemToAnswer(remaining[0]));
          setQuestion(remaining[0].question);

          if (remaining[0].study_room_id) {
            setSelectedRoomId(remaining[0].study_room_id);
          }
        } else {
          setResult(null);
          setQuestion("");
        }
      }

      setSuccessMessage("Brain history item deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete history.");
    } finally {
      setDeletingHistoryId(null);
    }
  }

  return (
    <AppShell
      title="StudySnap Brain"
      subtitle="Ask one question and StudySnap will retrieve the best notes, PDFs, flashcards, and memory before answering."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <section className="premium-card rounded-[2rem] border border-white/10 p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="gold-chip mb-3 inline-flex">Brain Chat</div>
              <h3 className="text-2xl font-black tracking-tight text-white">
                Ask StudySnap anything
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">
                The Brain searches your StudySnap learning materials first, then
                gives an answer with sources and confidence.
              </p>
            </div>

            {detectedRoomId !== null ? (
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
                Room detected:{" "}
                <span className="font-bold text-white">#{detectedRoomId}</span>
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-200">
                Study room
              </span>

              <select
                value={selectedRoomId ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedRoomId(value ? Number(value) : null);
                }}
                className="w-full rounded-[1.2rem] border border-white/10 bg-slate-950 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
              >
                <option value="">All rooms / auto-detect</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                    {room.subject ? ` — ${room.subject}` : ""}
                  </option>
                ))}
              </select>

              <span className="mt-2 block text-xs text-slate-500">
                {roomsLoading
                  ? "Loading rooms..."
                  : "Choose a room when you want Brain to focus or save there."}
              </span>
            </label>

            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleQuestionKeyDown}
              maxLength={8000}
              placeholder="Example: What do I need to complete for professional readiness?"
              className="min-h-36 w-full resize-none rounded-[1.5rem] border border-white/10 bg-black/35 px-5 py-4 text-sm leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
            />

            <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>Press Enter to ask. Press Shift + Enter for a new line.</span>
              <span>{question.length}/8000</span>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {successMessage}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs leading-6 text-slate-400">
                Uses Retrieval Engine V1.1 + OpenAI Brain Answer endpoint.
              </div>

              <button
                type="submit"
                disabled={loading}
                className="premium-button rounded-[1.1rem] px-6 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Thinking..." : "Ask Brain"}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
              Try asking
            </p>

            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => applySuggestedQuestion(item)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-left text-xs font-semibold text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-white"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="premium-card rounded-[2rem] border border-white/10 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="gold-chip mb-3 inline-flex">Brain History</div>
              <h3 className="text-xl font-black text-white">Recent answers</h3>
            </div>

            <button
              type="button"
              onClick={loadHistory}
              className="premium-button-secondary rounded-[1rem] px-3 py-2 text-xs font-bold"
            >
              {historyLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {history.length ? (
              history.map((item) => (
                <article
                  key={item.id}
                  className={`rounded-[1.3rem] border p-4 transition ${
                    result?.id === item.id
                      ? "border-amber-300/40 bg-amber-300/10"
                      : "border-white/10 bg-white/[0.04]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openHistoryItem(item)}
                    className="block w-full text-left"
                  >
                    <p className="line-clamp-2 text-sm font-black leading-6 text-white">
                      {item.question}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      {formatDate(item.created_at)}
                    </p>
                    <p className="mt-2 text-xs text-cyan-100">
                      Room #{item.study_room_id || "—"} ·{" "}
                      {item.sources?.length || 0} sources
                    </p>
                  </button>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleDeleteHistory(item)}
                      disabled={deletingHistoryId === item.id}
                      className="rounded-full border border-red-300/20 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingHistoryId === item.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm leading-7 text-slate-400">
                No Brain history yet. Ask your first question to create one.
              </p>
            )}
          </div>
        </aside>
      </div>

      {result ? (
        <section
          ref={answerSectionRef}
          className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]"
        >
          <div className="premium-card rounded-[2rem] border border-white/10 p-5 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="gold-chip mb-3 inline-flex">Brain Answer</div>
                <h3 className="text-2xl font-black text-white">
                  Personalized response
                </h3>
                <p className="mt-2 text-xs text-slate-400">
                  {result.created_at ? formatDate(result.created_at) : "Current answer"}
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 sm:items-end">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopyAnswer}
                    className="premium-button-secondary rounded-[1rem] px-4 py-2.5 text-sm font-semibold"
                  >
                    Copy answer
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveAsNote}
                    disabled={savingNote}
                    className="premium-button rounded-[1rem] px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingNote ? "Saving..." : "Save as note"}
                  </button>
                </div>

                {answerActionMessage ? (
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-100">
                    {answerActionMessage}
                  </div>
                ) : null}

                {targetSaveRoomId !== null ? (
                  <p className="text-xs text-slate-500">
                    Saving into room #{targetSaveRoomId}
                  </p>
                ) : null}
              </div>
            </div>

            <SimpleMarkdown
              content={result.answer}
              className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5"
            />
          </div>

          <div className="premium-card rounded-[2rem] border border-white/10 p-5 sm:p-6">
            <div className="gold-chip mb-3 inline-flex">Sources</div>
            <h3 className="text-2xl font-black text-white">What Brain used</h3>

            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs text-slate-400">Sources used</p>
                <p className="mt-1 text-2xl font-black text-white">
                  {result.metadata.used_retrieval_count ??
                    result.metadata.source_count ??
                    result.sources.length}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs text-slate-400">Detected study room</p>
                <p className="mt-1 text-2xl font-black text-white">
                  {detectedRoomId !== null ? `#${detectedRoomId}` : "None"}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs text-slate-400">Model</p>
                <p className="mt-1 break-words text-sm font-bold text-white">
                  {result.metadata.model || "Unknown"}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {result.sources.length ? (
                result.sources.map((source, index) => (
                  <article
                    key={`${source.source_type}-${source.source_id}-${index}`}
                    className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
                        {getSourceLabel(source.source_type)}
                      </span>

                      <span className="rounded-full bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-100">
                        {formatScore(source.score)}
                      </span>
                    </div>

                    <h4 className="line-clamp-2 text-sm font-black leading-6 text-white">
                      {source.title}
                    </h4>

                    <p className="mt-2 text-xs leading-6 text-slate-400">
                      {source.reason}
                    </p>

                    <p className="mt-3 line-clamp-4 text-sm leading-7 text-slate-300">
                      {source.text}
                    </p>
                  </article>
                ))
              ) : (
                <p className="text-sm leading-7 text-slate-400">
                  No sources were used for this answer.
                </p>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
