"use client";

import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import SimpleMarkdown from "@/components/ui/SimpleMarkdown";
import PremiumCard from "@/components/ui/PremiumCard";
import SectionHeader from "@/components/ui/SectionHeader";
import {
  askBrain,
  getBrainHistory,
  saveBrainHistoryAsNote,
  type BrainAnswerResponse,
  type BrainHistoryItem,
  type BrainSource,
} from "@/lib/api";

type Props = {
  studyRoomId: number;
  projectTitle: string;
};

const quickQuestions = [
  "What should I study first in this project?",
  "Summarize the most important ideas in this room.",
  "What are my weak concepts in this project?",
  "Create a quick review plan for this project.",
];

function formatDate(value?: string) {
  if (!value) return "Just now";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
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

function getSourceLabel(sourceType: string) {
  if (sourceType === "pdf_chunk") return "PDF";
  if (sourceType === "note_chunk") return "Note";
  if (sourceType === "flashcard") return "Flashcard";
  if (sourceType === "brain_memory") return "Memory";

  return sourceType.replaceAll("_", " ");
}

function formatScore(score: number | undefined) {
  if (typeof score !== "number") return "—";
  return `${Math.round(score * 100)}%`;
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

export default function ProjectBrain({ studyRoomId, projectTitle }: Props) {
  const router = useRouter();

  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<BrainAnswerResponse | null>(null);
  const [history, setHistory] = useState<BrainHistoryItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  async function loadHistory() {
    try {
      setHistoryLoading(true);
      const items = await getBrainHistory(5, studyRoomId);
      setHistory(items);

      if (!result && items.length > 0) {
        setResult(historyItemToAnswer(items[0]));
        setQuestion(items[0].question);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Project Brain history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyRoomId]);

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") return;
    if (event.shiftKey) return;

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function handleAskBrain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanQuestion = question.trim();

    if (!cleanQuestion) {
      setError("Ask Project Brain a question first.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setActionMessage("");

      const response = await askBrain(cleanQuestion, studyRoomId, 6);

      setResult(response);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project Brain failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyAnswer() {
    if (!result?.answer) {
      setActionMessage("No answer to copy yet.");
      return;
    }

    const copied = await copyTextWithFallback(result.answer);

    if (copied) {
      setActionMessage("Answer copied.");
    } else {
      setActionMessage("Copy failed. Select the answer text and copy manually.");
    }
  }

  async function handleSaveAsNote() {
    if (!result?.id) {
      setError("Ask Project Brain first before saving as a note.");
      return;
    }

    try {
      setSavingNote(true);
      setError("");
      setActionMessage("Saving as note...");

      const response = await saveBrainHistoryAsNote(
        result.id,
        studyRoomId,
        `Project Brain: ${question.trim().slice(0, 70) || projectTitle}`
      );

      if (response.already_saved) {
        setActionMessage(`Already saved as note: ${response.note.title}`);
      } else {
        setActionMessage(`Saved as note: ${response.note.title}`);
      }

      setTimeout(() => {
        router.push(
          `/notes?roomId=${response.note.study_room_id}&noteId=${response.note.id}`
        );
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save as note.");
      setActionMessage("");
    } finally {
      setSavingNote(false);
    }
  }

  function openHistoryItem(item: BrainHistoryItem) {
    setQuestion(item.question);
    setResult(historyItemToAnswer(item));
    setError("");
    setActionMessage("");
  }

  function useQuickQuestion(value: string) {
    setQuestion(value);
    setError("");
    setActionMessage("");
  }

  return (
    <PremiumCard>
      <SectionHeader
        eyebrow="🧠 Project Brain"
        title="Ask this project"
        subtitle="This Brain searches only this project room first, then answers with sources."
      />

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <form onSubmit={handleAskBrain} className="space-y-4">
            <div>
              <label className="text-sm font-bold text-white">
                Ask Project Brain
              </label>

              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleQuestionKeyDown}
                maxLength={8000}
                placeholder={`Ask about ${projectTitle}...`}
                className="mt-3 min-h-32 w-full resize-none rounded-[1.5rem] border border-white/10 bg-black/35 px-5 py-4 text-sm leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
              />

              <div className="mt-2 flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span>Press Enter to ask. Press Shift + Enter for a new line.</span>
                <span>{question.length}/8000</span>
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            {actionMessage ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {actionMessage}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-6 text-slate-400">
                Focused on room #{studyRoomId}.
              </p>

              <button
                type="submit"
                disabled={loading}
                className="premium-button rounded-[1.1rem] px-6 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Thinking..." : "Ask Project Brain"}
              </button>
            </div>
          </form>

          <div className="mt-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
              Quick questions
            </p>

            <div className="flex flex-wrap gap-2">
              {quickQuestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => useQuickQuestion(item)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-left text-xs font-semibold text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-white"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-yellow-200">
                Recent
              </p>
              <h3 className="mt-2 text-xl font-black text-white">
                Room Brain history
              </h3>
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
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openHistoryItem(item)}
                  className={`block w-full rounded-[1.2rem] border p-4 text-left transition ${
                    result?.id === item.id
                      ? "border-amber-300/40 bg-amber-300/10"
                      : "border-white/10 bg-white/[0.04] hover:border-cyan-300/30 hover:bg-cyan-300/10"
                  }`}
                >
                  <p className="line-clamp-2 text-sm font-black leading-6 text-white">
                    {item.question}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {formatDate(item.created_at)}
                  </p>
                  <p className="mt-2 text-xs text-cyan-100">
                    {item.sources?.length || 0} sources
                  </p>
                </button>
              ))
            ) : (
              <p className="text-sm leading-7 text-slate-400">
                No room Brain history yet.
              </p>
            )}
          </div>
        </aside>
      </div>

      {result ? (
        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-yellow-200">
                  Brain Answer
                </p>
                <h3 className="mt-2 text-2xl font-black text-white">
                  Project response
                </h3>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyAnswer}
                  className="premium-button-secondary rounded-[1rem] px-4 py-2.5 text-sm font-semibold"
                >
                  Copy
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
            </div>

            <SimpleMarkdown
              content={result.answer}
              className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5"
            />
          </div>

          <aside className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-yellow-200">
              Sources
            </p>
            <h3 className="mt-2 text-2xl font-black text-white">
              What Brain used
            </h3>

            <div className="mt-5 space-y-3">
              {result.sources.length ? (
                result.sources.map((source: BrainSource, index) => (
                  <article
                    key={`${source.source_type}-${source.source_id}-${index}`}
                    className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4"
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
                  </article>
                ))
              ) : (
                <p className="text-sm leading-7 text-slate-400">
                  No sources were used for this answer.
                </p>
              )}
            </div>
          </aside>
        </section>
      ) : null}
    </PremiumCard>
  );
}
