"use client";

import { useState } from "react";

type Props = {
  title: string;
  content: string;
  createdAt: string;
  isPinned?: boolean;
  loading?: boolean;
  onCopy?: () => void;
  onInsert?: () => void;
  onSaveAsNote?: () => void;
  onPin?: () => void;
  onRegenerate?: () => void;
  onReply?: (question: string) => void;
};

export default function NotesAIResultCard({
  title,
  content,
  createdAt,
  isPinned = false,
  loading = false,
  onCopy,
  onInsert,
  onSaveAsNote,
  onPin,
  onRegenerate,
  onReply,
}: Props) {
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");

  function handleSendReply() {
    if (!replyText.trim()) return;

    onReply?.(replyText.trim());
    setReplyText("");
    setReplying(false);
  }

  return (
    <article className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold text-white">
            {isPinned ? "📌 " : ""}
            {title}
          </h4>

          <p className="text-xs text-white/40">{createdAt}</p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="rounded-lg border border-cyan-400/30 px-3 py-1 text-xs text-cyan-300 hover:bg-cyan-500/10"
          >
            📋 Copy
          </button>

          <button
            type="button"
            onClick={onInsert}
            className="rounded-lg border border-green-400/30 px-3 py-1 text-xs text-green-300 hover:bg-green-500/10"
          >
            ➕ Insert
          </button>

          <button
            type="button"
            onClick={onSaveAsNote}
            className="rounded-lg border border-purple-400/30 px-3 py-1 text-xs text-purple-300 hover:bg-purple-500/10"
          >
            💾 Save
          </button>

          <button
            type="button"
            onClick={() => setReplying((current) => !current)}
            className="rounded-lg border border-pink-400/30 px-3 py-1 text-xs text-pink-300 hover:bg-pink-500/10"
          >
            💬 Reply
          </button>

          <button
            type="button"
            onClick={onRegenerate}
            className="rounded-lg border border-blue-400/30 px-3 py-1 text-xs text-blue-300 hover:bg-blue-500/10"
          >
            🔄 Regenerate
          </button>

          <button
            type="button"
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

      {replying ? (
        <div className="mt-4 rounded-xl border border-pink-400/20 bg-pink-500/5 p-3">
          <p className="mb-2 text-sm font-semibold text-pink-300">
            💬 Continue this AI result
          </p>

          <textarea
            value={replyText}
            onChange={(event) => setReplyText(event.target.value)}
            placeholder="Ask a follow-up question..."
            rows={3}
            className="w-full resize-none rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-pink-400/50"
          />

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setReplying(false);
                setReplyText("");
              }}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSendReply}
              disabled={!replyText.trim() || loading}
              className="rounded-lg border border-pink-400/30 bg-pink-500/10 px-3 py-2 text-xs font-semibold text-pink-300 hover:bg-pink-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Sending..." : "Send ➜"}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
