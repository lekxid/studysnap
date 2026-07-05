type Props = {
  title: string;
  content: string;
  createdAt: string;
  onCopy?: () => void;
  onInsert?: () => void;
};

export default function NotesAIResultCard({
  title,
  content,
  createdAt,
  onCopy,
  onInsert,
}: Props) {
  return (
    <article className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-lg font-semibold text-white">
            {title}
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
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-white/90">
        {content}
      </div>
    </article>
  );
}