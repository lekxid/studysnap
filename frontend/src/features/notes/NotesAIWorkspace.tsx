import NotesAIResultCard from "./NotesAIResultCard";

export type AIHistoryItem = {
  id: string;
  title: string;
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
}: Props) {
  const hasContent = content.trim().length > 0;

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
      </div>

      <div className="mt-6 border-t border-white/10 pt-5">
        <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
          AI History
        </h4>

        {history.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">
            Your generated summaries, explanations, lessons, and questions will appear here.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {history.map((item) => (
              <NotesAIResultCard
                key={item.id}
                title={item.title}
                content={item.content}
                createdAt={item.createdAt}
                onCopy={() => onCopyHistory?.(item.content)}
                onInsert={() => onInsertHistory?.(item.content)}
                onSaveAsNote={() => onSaveHistoryAsNote?.(item.title, item.content)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
