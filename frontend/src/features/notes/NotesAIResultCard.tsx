type Props = {
  title: string;
  content: string;
  createdAt: string;
  isPinned?: boolean;
  onCopy?: () => void;
  onInsert?: () => void;
  onSaveAsNote?: () => void;
  onPin?: () => void;
};

export default function NotesAIResultCard({
  title,
  content,
  createdAt,
  isPinned = false,
  onCopy,
  onInsert,
  onSaveAsNote,
  onPin,
}: Props) {
  return (
    <article className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-lg font-semibold text-white">
            {isPinned ? "📌 " : ""}{title}
          </h4>

          <p className="text-xs text-white/40">
            {createdAt}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCopy}
            className="rounded-lg border border-cyan-400/30 px-3 py-1 text-xs text-cyan-300 hover:bg-cyan-500/10"
          >
            📋 Copy
          </button>

          <button
            onClick={onInsert}
            className="rounded-lg border border-green-400/30 px-3 py-1 text-xs text-green-300 hover:bg-green-500/10"
          >
            ➕ Insert
          </button>

          <button
            onClick={onSaveAsNote}
            className="rounded-lg border border-purple-400/30 px-3 py-1 text-xs text-purple-300 hover:bg-purple-500/10"
          >
            💾 Save
          </button>

          <button
            onClick={onPin}
            className="rounded-lg border border-yellow-400/30 px-3 py-1 text-xs text-yellow-300 hover:bg-yellow-500/10"
          >
            {isPinned ? "Unpin" : "⭐ Pin"}
          </button>
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-white/90">
        {content}
      </div>
    </article>
  );
}