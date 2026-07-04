"use client";

import { useState } from "react";

type MessageToolbarProps = {
  onCopy: () => Promise<void> | void;
};

export default function MessageToolbar({ onCopy }: MessageToolbarProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await onCopy();
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}