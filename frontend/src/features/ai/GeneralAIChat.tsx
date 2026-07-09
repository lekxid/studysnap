"use client";

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

    for (const key of [
      "answer",
      "response",
      "message",
      "content",
      "text",
      "result",
      "output",
    ]) {
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

  function clearComposer() {
    setInput("");
    setSelectedImage(null);
    setSelectedImagePreview("");
    setError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setTimeout(() => inputRef.current?.focus(), 50);
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
      setError(
        err instanceof Error
          ? err.message
          : "StudySnap AI could not reply right now."
      );
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if ((input.trim().length > 0 || selectedImage !== null) && !loading) {
      await sendMessage();
    }
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

  function renderComposer(large = false) {
    return (
      <form
        onSubmit={handleSubmit}
        className={
          large
            ? "mx-auto mt-7 w-full max-w-5xl rounded-[1.7rem] border border-yellow-300/15 bg-[#08111d]/95 p-4 shadow-[0_0_60px_rgba(250,204,21,0.06)]"
            : "rounded-[1.4rem] border border-white/10 bg-[#08111d]/95 p-3 shadow-[0_20px_70px_rgba(0,0,0,0.45)]"
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => handleImageChange(event.target.files?.[0])}
        />

        {selectedImagePreview ? (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-3">
            <img
              src={selectedImagePreview}
              alt="Selected upload preview"
              className="h-16 w-16 rounded-xl object-cover"
            />

            <div className="min-w-0 flex-1">
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

        <div className={large ? "space-y-3" : "flex items-end gap-3"}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();

                if (canSend) {
                  void sendMessage();
                }
              }
            }}
            placeholder={
              selectedImage ? "Ask about this image..." : "Message StudySnap AI"
            }
            rows={large ? 3 : 1}
            className={
              large
                ? "min-h-28 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-lg font-semibold text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/35"
                : "max-h-40 min-h-12 w-full resize-none bg-transparent px-3 py-3 text-base font-semibold text-white outline-none placeholder:text-slate-500"
            }
          />

          <div
            className={
              large
                ? "flex items-center justify-between gap-3"
                : "flex shrink-0 items-center gap-2"
            }
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-xl font-black text-slate-300 transition hover:bg-white/[0.1]"
              title="Upload image"
            >
              ＋
            </button>

            {(input.trim().length > 0 || selectedImage !== null) ? (
              <button
                type="button"
                onClick={clearComposer}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-xs font-black text-slate-300 transition hover:bg-white/[0.1]"
              >
                Clear
              </button>
            ) : null}

            {large ? (
              <span className="rounded-full border border-yellow-300/20 bg-yellow-300/10 px-4 py-2 text-xs font-black text-yellow-100">
                Image + text ready
              </span>
            ) : null}

            <button
              type="submit"
              disabled={!canSend}
              className="grid h-11 w-11 place-items-center rounded-2xl bg-yellow-300 text-xl font-black text-slate-950 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-40"
              title="Send"
            >
              ↑
            </button>
          </div>
        </div>

        {!large ? (
          <p className="mt-2 text-center text-xs font-semibold text-slate-500">
            Enter sends • Shift + Enter makes a new line • Space and typing work normally.
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[1.7rem] border border-white/10 bg-[linear-gradient(135deg,rgba(250,204,21,0.10),rgba(8,17,29,0.92))] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-300">
              StudySnap General AI
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">
              What can I help you with?
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Ask anything, upload an image, create practice questions, brainstorm, or get help explaining a topic.
            </p>
          </div>

          <button
            type="button"
            onClick={startNewChat}
            className="rounded-2xl border border-yellow-300/25 bg-yellow-300/10 px-5 py-3 text-sm font-black text-yellow-100 transition hover:bg-yellow-300/20"
          >
            New Chat
          </button>
        </div>

        {!hasMessages ? (
          <>
            {renderComposer(true)}

            <div className="mx-auto mt-4 flex max-w-5xl flex-wrap justify-center gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void sendMessage(suggestion)}
                  className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-slate-300 shadow-xl transition hover:border-yellow-300/30 hover:bg-yellow-300/10 hover:text-white"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {hasMessages ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="max-h-[62vh] space-y-4 overflow-y-auto rounded-[1.7rem] border border-white/10 bg-[#08111d]/90 p-4">
            {messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-auto max-w-[82%] rounded-[1.4rem] bg-yellow-300 px-4 py-3 text-slate-950"
                    : "mr-auto max-w-[90%] rounded-[1.4rem] border border-white/10 bg-white/[0.06] px-4 py-3 text-slate-100"
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

                <div className="whitespace-pre-wrap text-sm leading-6">
                  {message.content}
                </div>
              </article>
            ))}

            {loading ? (
              <article className="mr-auto max-w-[90%] rounded-[1.4rem] border border-white/10 bg-white/[0.06] px-4 py-3">
                <p className="text-sm font-bold text-slate-300">
                  StudySnap AI is thinking...
                </p>
              </article>
            ) : null}

            {error ? (
              <article className="mr-auto max-w-[90%] rounded-[1.4rem] border border-red-400/25 bg-red-500/10 px-5 py-4">
                <p className="text-sm font-bold text-red-100">{error}</p>
              </article>
            ) : null}

            <div ref={bottomRef} />
          </div>

          <aside className="space-y-4">
            <div className="rounded-[1.5rem] border border-yellow-300/15 bg-yellow-300/10 p-3">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-300">
                Smart Tools
              </p>
              <div className="mt-3 grid gap-2">
                {suggestions.slice(0, 4).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void sendMessage(suggestion)}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-sm font-black text-white hover:bg-yellow-300/10"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            {renderComposer(false)}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
