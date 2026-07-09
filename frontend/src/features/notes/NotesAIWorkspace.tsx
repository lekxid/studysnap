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
  onChatInputChange?: (value: string) => void;
  onSendChat?: () => void;
};

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
  onChatInputChange,
  onSendChat,
}: Props) {
  const hasContent = content.trim().length > 0;
  const pinnedItems = history.filter((item) => item.pinned);
  const unpinnedItems = history.filter((item) => !item.pinned);

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-[#08111f] p-5 shadow-xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
            AI Workspace
          </p>

          <h3 className="mt-2 text-xl font-bold text-white">
            {title || "AI Assistant"}
          </h3>
        </div>

        <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-sm">
          {loading ? (
            <span className="text-cyan-300">Thinking...</span>
          ) : (
            <span className="text-white/60">Ready</span>
          )}
        </div>
      </div>

      <div className="min-h-[220px] whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-5 text-white/90">
        {content || (
          <span className="text-white/40">
            Your AI responses will appear here.
          </span>
        )}
      </div>

      {status ? (
        <p className="mt-3 text-sm font-medium text-cyan-300">{status}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onCopy}
          disabled={!hasContent}
          className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          📋 Copy current
        </button>

        <button
          type="button"
          onClick={onInsert}
          disabled={!hasContent}
          className="rounded-xl border border-green-400/40 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-300 transition hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ➕ Insert current
        </button>

        <button
          type="button"
          onClick={() => onDownloadCurrent?.(title || "StudySnap AI Export", content)}
          disabled={!hasContent}
          className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          📄 Download current PDF
        </button>
      </div>

      <section className="mt-6 rounded-2xl border border-cyan-400/20 bg-black/25 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
              AI Chat
            </p>
            <h4 className="mt-1 text-lg font-bold text-white">
              Continue with StudySnap AI
            </h4>
          </div>

          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">
            {chatMessages.length} message{chatMessages.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="max-h-[360px] space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-3">
          {chatMessages.length === 0 ? (
            <p className="text-sm text-white/40">
              Use Ask AI or type a follow-up. StudySnap will use your note as context.
            </p>
          ) : (
            chatMessages.map((message) => (
              <div
                key={message.id}
                className={`rounded-2xl p-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "ml-auto max-w-[85%] bg-cyan-400 text-black"
                    : "mr-auto max-w-[90%] bg-white/10 text-white"
                }`}
              >
                <p className="mb-1 text-[11px] font-black uppercase tracking-[0.2em] opacity-60">
                  {message.role === "user" ? "You" : "StudySnap AI"}
                </p>
                <div className="whitespace-pre-wrap">{message.content}</div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex gap-3">
          <textarea
            value={chatInput}
            onChange={(event) => onChatInputChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSendChat?.();
              }
            }}
            rows={2}
            placeholder="Ask a follow-up question about this note..."
            className="min-h-[56px] flex-1 resize-none rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-400/50"
          />

          <button
            type="button"
            onClick={onSendChat}
            disabled={!chatInput.trim() || chatLoading}
            className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {chatLoading ? "Sending..." : "Send"}
          </button>
        </div>
      </section>

      <div className="mt-6 border-t border-white/10 pt-5">
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
          <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
            AI History
          </h4>

          {history.length > 0 ? (
            <button
              type="button"
              onClick={onClearHistory}
              className="rounded-lg border border-red-400/30 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-500/10"
            >
              🧹 Clear All
            </button>
          ) : null}
        </div>

        {history.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">
            Your generated summaries, explanations, lessons, and questions will appear here.
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
      </div>
    </div>
  );
}