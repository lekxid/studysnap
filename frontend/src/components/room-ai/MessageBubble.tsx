"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";
import MessageToolbar from "@/components/room-ai/MessageToolbar";

type MessageBubbleProps = {
  role: "user" | "assistant";
  content: string;
  label: string;
  onCopy: () => void;
};

export default function MessageBubble({
  role,
  content,
  label,
  onCopy,
}: MessageBubbleProps) {
  const isUser = role === "user";
  

  return (
    <div
      className={`rounded-2xl p-5 text-sm leading-7 ${
        isUser
          ? "ml-auto max-w-[85%] bg-cyan-400/10 text-cyan-100"
          : "mr-auto max-w-[90%] bg-black text-white/85"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
          {label}
        </p>

        {!isUser ? (
  <MessageToolbar onCopy={() => onCopy()} />
) : null}
      </div>

      <div className="prose prose-invert max-w-none prose-p:leading-7 prose-li:leading-7 prose-headings:text-white prose-strong:text-white prose-code:text-cyan-200">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}