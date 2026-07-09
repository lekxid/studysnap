"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { askAi, askAiWithImage } from "@/lib/api";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  imagePreview?: string;
  imageName?: string;
};

const suggestions = [
  "Explain something new",
  "Brainstorm ideas",
  "Help me study",
  "Write better",
  "Create practice questions",
  "Give me advice",
];

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extractAIText(data: unknown): string {
  if (typeof data === "string") return data;

  if (data && typeof data === "object") {
    const value = data as Record<string, unknown>;

    for (const key of ["answer", "response", "message", "content", "text", "result", "output"]) {
      if (typeof value[key] === "string" && value[key]) {
        return value[key] as string;
      }
    }

    return JSON.stringify(value, null, 2);
  }

  return "I could not read the AI response.";
}

export default function GeneralAIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState("");

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const hasMessages = messages.length > 0;

  const canSend = useMemo(() => {
    return (input.trim().length > 0 || selectedImage !== null) && !loading;
  }, [input, selectedImage, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, error]);

  function handleImageChange(file: File | undefined) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }

    const maxSize = 8 * 1024 * 1024;

    if (file.size > maxSize) {
      setError("Image must be 8MB or smaller.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setSelectedImage(file);
      setSelectedImagePreview(String(reader.result || ""));
      setError("");
      inputRef.current?.focus();
    };

    reader.readAsDataURL(file);
  }

  function removeSelectedImage() {
    setSelectedImage(null);
    setSelectedImagePreview("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    inputRef.current?.focus();
  }

  async function sendMessage(messageText?: string) {
    const question = (messageText ?? input).trim();
    const imageToSend = selectedImage;
    const imagePreviewToSend = selectedImagePreview;
    const imageNameToSend = selectedImage?.name;

    if ((!question && !imageToSend) || loading) return;

    const finalQuestion = question || "Describe this image clearly.";

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content: finalQuestion,
      imagePreview: imagePreviewToSend || undefined,
      imageName: imageNameToSend,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setSelectedImage(null);
    setSelectedImagePreview("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setLoading(true);
    setError("");

    try {
      const data = imageToSend
        ? await askAiWithImage(finalQuestion, imageToSend)
        : await askAi(finalQuestion, "");

      const answer = extractAIText(data);

      const assistantMessage: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: answer,
      };

      setMessages((current) => [...current, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "StudySnap AI could not reply right now.");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage();
  }

  function startNewChat() {
    setMessages([]);
    setInput("");
    setError("");
    setCopiedId("");
    removeSelectedImage();
  }

  async function copyMessage(message: ChatMessage) {
    await navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    setTimeout(() => setCopiedId(""), 1200);
  }

  function Composer({ large = false }: { large?: boolean }) {
    return (
      <form
        onSubmit={handleSubmit}
        className={
          large
            ? "mt-10 w-full max-w-4xl rounded-[2rem] border border-white/10 bg-[#111827]/90 p-4 shadow-[0_28px_100px_rgba(0,0,0,0.55)] backdrop-blur"
            : "mx-auto max-w-4xl"
        }
      >
        <div
          className={
            large
              ? ""
              : "flex items-end gap-3 rounded-[1.7rem] border border-white/10 bg-white/[0.06] p-3 shadow-[0_20px_80px_rgba(0,0,0,0.45)]"
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => handleImageChange(event.target.files?.[0])}
          />

          <div className="flex-1">
            {selectedImagePreview ? (
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3">
                <img
                  src={selectedImagePreview}
                  alt="Selected upload preview"
                  className="h-16 w-16 rounded-xl object-cover"
                />

                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-black text-white">
                    {selectedImage?.name || "Selected image"}
                  </p>
                  <p className="text-xs font-semibold text-slate-400">
                    Ask StudySnap AI about this image.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={removeSelectedImage}
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-300 transition hover:bg-white/[0.08]"
                >
                  Remove
                </button>
              </div>
            ) : null}

            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={selectedImage ? "Ask about this image..." : "Message StudySnap AI"}
              rows={large ? 3 : 1}
              className={
                large
                  ? "min-h-24 w-full resize-none bg-transparent px-3 py-3 text-xl font-semibold text-white outline-none placeholder:text-slate-500"
                  : "max-h-40 min-h-12 w-full resize-none bg-transparent px-3 py-3 text-base font-semibold text-white outline-none placeholder:text-slate-500"
              }
            />
          </div>

          <div className={large ? "flex items-center justify-between gap-3" : "flex shrink-0 items-center gap-2"}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-xl font-black text-slate-300 transition hover:bg-white/[0.1]"
              title="Upload image"
            >
              ＋
            </button>

            {large ? (
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-black text-slate-300">
                Image + text ready
              </span>
            ) : null}

            <button
              type="submit"
              disabled={!canSend}
              className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300 text-xl font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              title="Send"
            >
              ↑
            </button>
          </div>
        </div>

        {!large ? (
          <p className="mt-2 text-center text-xs font-semibold text-slate-500">
            General AI can make mistakes. Check important answers.
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#080d18] text-white">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(14,165,233,0.34),transparent_42%),radial-gradient(circle_at_20%_80%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(180deg,#07111f_0%,#080d18_55%,#050712_100%)]" />

      <header className="fixed left-0 right-0 top-0 z-30 border-b border-white/10 bg-[#080d18]/75 px-5 py-4 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-slate-200 transition hover:bg-white/[0.1]"
          >
            ← Dashboard
          </Link>

          <div className="text-center">
            <p className="text-xs font-black tracking-[0.24em] text-cyan-200">
              STUDYSNAP
            </p>
            <h1 className="text-base font-black">General AI</h1>
          </div>

          <button
            type="button"
            onClick={startNewChat}
            className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/20"
          >
            New Chat
          </button>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 pb-36 pt-24">
        {!hasMessages ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <h2 className="max-w-4xl text-4xl font-black tracking-tight md:text-6xl">
              What can I help you with?
            </h2>

            <Composer large />

            <div className="mt-7 flex max-w-4xl flex-wrap justify-center gap-3">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void sendMessage(suggestion)}
                  className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-3 text-sm font-bold text-slate-300 shadow-xl transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-white"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-4xl space-y-6">
            {messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-auto max-w-[82%] rounded-[1.7rem] bg-cyan-300 px-5 py-4 text-slate-950"
                    : "mr-auto max-w-[90%] rounded-[1.7rem] border border-white/10 bg-white/[0.06] px-5 py-4 text-slate-100"
                }
              >
                {message.imagePreview ? (
                  <img
                    src={message.imagePreview}
                    alt={message.imageName || "Uploaded image"}
                    className="mb-3 max-h-72 rounded-2xl object-contain"
                  />
                ) : null}

                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">
                    {message.role === "user" ? "You" : "StudySnap AI"}
                  </p>

                  {message.role === "assistant" ? (
                    <button
                      type="button"
                      onClick={() => void copyMessage(message)}
                      className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-slate-300 transition hover:bg-white/[0.08]"
                    >
                      {copiedId === message.id ? "Copied" : "Copy"}
                    </button>
                  ) : null}
                </div>

                <div className="whitespace-pre-wrap text-sm leading-7">
                  {message.content}
                </div>
              </article>
            ))}

            {loading ? (
              <article className="mr-auto max-w-[90%] rounded-[1.7rem] border border-white/10 bg-white/[0.06] px-5 py-4">
                <p className="text-sm font-bold text-slate-300">
                  StudySnap AI is thinking...
                </p>
              </article>
            ) : null}

            {error ? (
              <article className="mr-auto max-w-[90%] rounded-[1.7rem] border border-red-400/25 bg-red-500/10 px-5 py-4">
                <p className="text-sm font-bold text-red-100">{error}</p>
              </article>
            ) : null}

            <div ref={bottomRef} />
          </div>
        )}
      </section>

      {hasMessages ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#080d18]/90 px-4 py-4 backdrop-blur-2xl">
          <Composer />
        </div>
      ) : null}
    </main>
  );
}
