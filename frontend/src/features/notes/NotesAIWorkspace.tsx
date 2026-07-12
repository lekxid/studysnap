"use client";

import { useEffect, useRef } from "react";
import NotesAIResultCard from "./NotesAIResultCard";

export type AIHistoryItem = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  pinned?: boolean;
  prompt?: string;
  context?: string;
  tool?: "ask" | "lesson" | "flashcards" | "quiz";
};

export type AIChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Props = {
  title: string;
  content: string;
  loading?: boolean;
  status?: string;
  history?: AIHistoryItem[];
  onCopy?: () => void;
  onInsert?: () => void;
  onCopyHistory?: (content: string) => void;
  onInsertHistory?: (content: string) => void;
  onSaveHistoryAsNote?: (title: string, content: string) => void;
  onDownloadCurrent?: (title: string, content: string) => void;
  onDownloadHistory?: (title: string, content: string) => void;
  onTogglePinHistory?: (id: string) => void;
  onRegenerateHistory?: (id: string) => void;
  onReplyHistory?: (id: string, question: string) => void;
  onDeleteHistory?: (id: string) => void;
  onClearHistory?: () => void;
  chatMessages?: AIChatMessage[];
  chatInput?: string;
  chatLoading?: boolean;
  focusComposerToken?: number;
  onChatInputChange?: (value: string) => void;
  onSendChat?: () => void;
};

const QUICK_PROMPTS = [
  "What are the most important ideas in this note?",
  "Explain this in simpler words.",
  "Test me without showing the answers yet.",
];

export default function NotesAIWorkspace({
  title,
  content,
  loading = false,
  status = "",
  history = [],
  onCopy,
  onInsert,
  onCopyHistory,
  onInsertHistory,
  onSaveHistoryAsNote,
  onDownloadCurrent,
  onDownloadHistory,
  onTogglePinHistory,
  onRegenerateHistory,
  onReplyHistory,
  onDeleteHistory,
  onClearHistory,
  chatMessages = [],
  chatInput = "",
  chatLoading = false,
  focusComposerToken = 0,
  onChatInputChange,
  onSendChat,
}: Props) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const hasContent = content.trim().length > 0;
  const pinnedItems = history.filter((item) => item.pinned);
  const unpinnedItems = history.filter((item) => !item.pinned);

  const isChatResult =
    title.trim().toLowerCase() === "ai chat" ||
    title.trim().toLowerCase() === "study questions";

  const showCurrentResult = hasContent && !isChatResult;

  useEffect(() => {
    if (focusComposerToken <= 0) return;

    window.setTimeout(() => {
      composerRef.current?.focus();
      composerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);
  }, [focusComposerToken]);

  useEffect(() => {
    if (chatMessages.length === 0) return;

    window.setTimeout(() => {
      chatEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 80);
  }, [chatMessages.length]);

  function useQuickPrompt(prompt: string) {
    onChatInputChange?.(prompt);

    window.setTimeout(() => {
      composerRef.current?.focus();
    }, 40);
  }

  return (
    <section className="rounded-[1.5rem] border border-yellow-300/15 bg-[#08111f] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.24)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-yellow-200">
            Your AI Tutor
          </p>

          <h3 className="mt-1 text-xl font-bold text-white">
            Chat with your note
          </h3>

          <p className="mt-1 text-sm text-slate-400">
            Ask questions, practise concepts, or turn the note into something useful.
          </p>
        </div>

        <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-sm">
          {loading ? (
            <span className="text-yellow-200">Thinking...</span>
          ) : (
            <span className="text-emerald-300">● Ready</span>
          )}
        </div>
      </header>

      <div className="mt-5 flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => useQuickPrompt(prompt)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-yellow-300/30 hover:bg-yellow-300/10 hover:text-yellow-100"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="mt-4 max-h-[430px] min-h-[150px] space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-3">
        {chatMessages.length === 0 ? (
          <div className="flex min-h-[120px] flex-col justify-center px-2">
            <p className="text-base font-black text-white">
              Start with a real question
            </p>

            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
              I will use the current note and remember this conversation while
              you continue studying it.
            </p>
          </div>
        ) : (
          chatMessages.map((message) => (
            <article
              key={message.id}
              className={`rounded-2xl p-3 text-sm leading-6 ${
                message.role === "user"
                  ? "ml-auto max-w-[85%] bg-yellow-300 text-slate-950"
                  : "mr-auto max-w-[92%] border border-white/10 bg-white/[0.07] text-white"
              }`}
            >
              <p className="mb-1 text-[11px] font-black uppercase tracking-[0.2em] opacity-60">
                {message.role === "user" ? "You" : "StudySnap AI"}
              </p>

              <div className="whitespace-pre-wrap">{message.content}</div>
            </article>
          ))
        )}

        {chatLoading ? (
          <div className="mr-auto max-w-[92%] rounded-2xl border border-yellow-300/15 bg-yellow-300/[0.06] p-3 text-sm text-yellow-100">
            StudySnap AI is thinking about your note...
          </div>
        ) : null}

        <div ref={chatEndRef} />
      </div>

      <div className="mt-3 flex items-end gap-3 rounded-2xl border border-yellow-300/20 bg-black/35 p-2 focus-within:border-yellow-300/45">
        <textarea
          ref={composerRef}
          value={chatInput}
          onChange={(event) => onChatInputChange?.(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();

              if (chatInput.trim() && !chatLoading) {
                onSendChat?.();
              }
            }
          }}
          rows={2}
          placeholder="Ask anything about this note..."
          className="min-h-[56px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-white/35"
        />

        <button
          type="button"
          onClick={onSendChat}
          disabled={!chatInput.trim() || chatLoading}
          className="rounded-xl bg-yellow-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {chatLoading ? "Thinking..." : "Send"}
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Press Enter to send · Shift + Enter for a new line
      </p>

      {status ? (
        <p className="mt-3 text-sm font-medium text-yellow-200">{status}</p>
      ) : null}

      {showCurrentResult ? (
        <section className="mt-6 rounded-2xl border border-white/10 bg-[linear-gradient(145deg,rgba(250,204,21,0.05),rgba(0,0,0,0.36))] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-yellow-200">
                Latest created result
              </p>

              <h4 className="mt-1 text-lg font-bold text-white">
                {title || "StudySnap AI result"}
              </h4>
            </div>
          </div>

          <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/90">
            {content}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
            >
              Copy
            </button>

            <button
              type="button"
              onClick={onInsert}
              className="rounded-xl border border-green-400/30 bg-green-500/10 px-3 py-2 text-xs font-semibold text-green-300 transition hover:bg-green-500/20"
            >
              Insert into note
            </button>

            <button
              type="button"
              onClick={() =>
                onDownloadCurrent?.(
                  title || "StudySnap AI Export",
                  content
                )
              }
              className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
            >
              Download PDF
            </button>
          </div>
        </section>
      ) : null}

      <section className="mt-6 border-t border-white/10 pt-5">
        {pinnedItems.length > 0 ? (
          <div className="mb-6">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-yellow-300">
              📌 Pinned
            </h4>

            <div className="mt-4 space-y-4">
              {pinnedItems.map((item) => (
                <NotesAIResultCard
                  key={item.id}
                  title={item.title}
                  content={item.content}
                  createdAt={item.createdAt}
                  isPinned={item.pinned}
                  onCopy={() => onCopyHistory?.(item.content)}
                  onInsert={() => onInsertHistory?.(item.content)}
                  onSaveAsNote={() =>
                    onSaveHistoryAsNote?.(item.title, item.content)
                  }
                  onDownloadPdf={() =>
                    onDownloadHistory?.(item.title, item.content)
                  }
                  onPin={() => onTogglePinHistory?.(item.id)}
                  onRegenerate={() => onRegenerateHistory?.(item.id)}
                  onReply={(question) => onReplyHistory?.(item.id, question)}
                  onDelete={() => onDeleteHistory?.(item.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
              Created from this note
            </h4>

            <p className="mt-1 text-xs text-slate-500">
              Summaries, lessons, explanations, and practice results.
            </p>
          </div>

          {history.length > 0 ? (
            <button
              type="button"
              onClick={onClearHistory}
              className="rounded-lg border border-red-400/30 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-500/10"
            >
              Clear all
            </button>
          ) : null}
        </div>

        {history.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/40">
            Nothing created yet. Use the note tools when you want a summary,
            lesson, concept cards, or quiz.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {unpinnedItems.map((item) => (
              <NotesAIResultCard
                key={item.id}
                title={item.title}
                content={item.content}
                createdAt={item.createdAt}
                isPinned={item.pinned}
                onCopy={() => onCopyHistory?.(item.content)}
                onInsert={() => onInsertHistory?.(item.content)}
                onSaveAsNote={() =>
                  onSaveHistoryAsNote?.(item.title, item.content)
                }
                onDownloadPdf={() =>
                  onDownloadHistory?.(item.title, item.content)
                }
                onPin={() => onTogglePinHistory?.(item.id)}
                onRegenerate={() => onRegenerateHistory?.(item.id)}
                onReply={(question) => onReplyHistory?.(item.id, question)}
                onDelete={() => onDeleteHistory?.(item.id)}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
