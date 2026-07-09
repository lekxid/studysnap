"use client";

import { KeyboardEvent, useMemo, useRef, useState } from "react";

import SimpleMarkdown from "@/components/ui/SimpleMarkdown";
import {
  createAIConversation,
  streamAIMessage,
} from "@/lib/api";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type CompactProjectAIProps = {
  studyRoomId: number;
  projectTitle: string;
};

const quickPrompts = [
  "What should I study first in this project?",
  "What are my weak concepts?",
  "Quiz me from this room.",
  "Create a quick review plan.",
];

export default function CompactProjectAI({
  studyRoomId,
  projectTitle,
}: CompactProjectAIProps) {
  const chatRef = useRef<HTMLDivElement | null>(null);

  const [conversationId, setConversationId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("explain");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi, I’m your Project AI. Ask me about this room, your notes, quizzes, weak areas, or what to study next.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lastAssistantMessage = useMemo(() => {
    return [...messages].reverse().find((message) => message.role === "assistant");
  }, [messages]);

  function scrollToBottom() {
    setTimeout(() => {
      if (!chatRef.current) return;
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }, 40);
  }

  async function ensureConversation() {
    if (conversationId) return conversationId;

    const conversation = await createAIConversation(
      studyRoomId,
      "Project AI Chat",
      "general"
    );

    setConversationId(conversation.id);
    return conversation.id;
  }

  async function sendMessage(value?: string) {
    const clean = (value ?? input).trim();

    if (!clean || loading) return;

    try {
      setLoading(true);
      setError("");
      setInput("");

      const nextConversationId = await ensureConversation();

      setMessages((current) => [
        ...current,
        { role: "user", content: clean },
        { role: "assistant", content: "Thinking..." },
      ]);

      scrollToBottom();

      let streamedAnswer = "";

      await streamAIMessage(
        nextConversationId,
        clean,
        mode,
        (token) => {
          streamedAnswer += token;

          setMessages((current) => {
            const updated = [...current];
            const lastIndex = updated.length - 1;

            if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
              updated[lastIndex] = {
                role: "assistant",
                content: streamedAnswer,
              };
            }

            return updated;
          });

          scrollToBottom();
        }
      );

      setMessages((current) => {
        const updated = [...current];
        const lastIndex = updated.length - 1;

        if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
          updated[lastIndex] = {
            role: "assistant",
            content: streamedAnswer || "No answer returned.",
          };
        }

        return updated;
      });

      scrollToBottom();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project AI failed.");
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            err instanceof Error
              ? err.message
              : "Sorry, I could not answer right now.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    void sendMessage();
  }

  function clearChat() {
    setMessages([
      {
        role: "assistant",
        content:
          "Chat cleared. Ask me what to study next, explain a topic, or quiz you from this project.",
      },
    ]);
    setInput("");
    setError("");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-[1.35rem] border border-cyan-300/15 bg-black/25 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
              Room AI Assistant
            </p>
            <h3 className="mt-1 text-2xl font-black text-white">
              Ask Project AI
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Focused on {projectTitle}. No extra sidebar, no duplicate workspace.
            </p>
          </div>

          <div className="flex gap-2">
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm font-semibold text-white outline-none"
            >
              <option className="bg-[#101826] text-white" value="explain">
                Explain
              </option>
              <option className="bg-[#101826] text-white" value="teach">
                Teach me
              </option>
              <option className="bg-[#101826] text-white" value="quiz">
                Quiz me
              </option>
              <option className="bg-[#101826] text-white" value="practice">
                Practice
              </option>
            </select>

            <button
              type="button"
              onClick={clearChat}
              className="rounded-xl border border-white/10 px-3 py-2 text-sm font-black text-white transition hover:bg-white/10"
            >
              Clear
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div
          ref={chatRef}
          className="mt-4 max-h-[420px] space-y-3 overflow-y-auto rounded-[1.2rem] border border-white/10 bg-black/35 p-4"
        >
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-2xl border p-4 ${
                message.role === "user"
                  ? "ml-auto max-w-[86%] border-yellow-300/20 bg-yellow-300/10"
                  : "mr-auto max-w-[92%] border-cyan-300/15 bg-cyan-300/10"
              }`}
            >
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                {message.role === "user" ? "You" : "StudySnap AI"}
              </p>

              <SimpleMarkdown
                content={message.content}
                className="text-sm leading-7 text-slate-100"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-black/35 p-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Project AI what to study, explain a topic, or quiz you..."
            className="min-h-[95px] w-full resize-none bg-transparent p-3 text-sm leading-7 text-white outline-none placeholder:text-slate-500"
          />

          <div className="flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Press Enter to send. Shift + Enter for a new line.
            </p>

            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim()}
              className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Thinking..." : "Ask AI"}
            </button>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-[1.35rem] border border-white/10 bg-black/25 p-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-200">
            Quick prompts
          </p>

          <div className="mt-4 space-y-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void sendMessage(prompt)}
                disabled={loading}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm font-semibold text-slate-200 transition hover:border-yellow-300/30 hover:bg-yellow-300/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[1.35rem] border border-white/10 bg-black/25 p-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-200">
            Latest answer
          </p>

          <p className="mt-3 line-clamp-6 text-sm leading-7 text-slate-300">
            {lastAssistantMessage?.content || "Ask a question to begin."}
          </p>
        </section>
      </aside>
    </div>
  );
}
