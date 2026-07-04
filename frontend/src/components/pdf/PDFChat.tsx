"use client";

import { useState } from "react";
import { chatWithPDF } from "@/lib/api";

type PDFChatProps = {
  pdfId: number | null;
  filename?: string;
};

type ChatMessage = {
  role: "user" | "ai";
  text: string;
};

export default function PDFChat({ pdfId, filename }: PDFChatProps) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [asking, setAsking] = useState(false);

  async function handleAsk() {
    if (!pdfId) {
      alert("Select or summarize a PDF first.");
      return;
    }

    if (!question.trim()) {
      alert("Type a question first.");
      return;
    }

    const userQuestion = question.trim();

    try {
      setAsking(true);
      setQuestion("");

      setMessages((current) => [
        ...current,
        { role: "user", text: userQuestion },
      ]);

      const data = await chatWithPDF(pdfId, userQuestion);

      setMessages((current) => [
        ...current,
        { role: "ai", text: data.answer || "No answer returned." },
      ]);
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          role: "ai",
          text: err instanceof Error ? err.message : "Failed to ask PDF.",
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
        Chat with PDF
      </p>

      <h3 className="mt-2 text-2xl font-bold text-white">
        {filename || "Ask about your PDF"}
      </h3>

      <div className="mt-6 min-h-[220px] space-y-4 rounded-xl bg-black p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-white/50">
            Ask questions about the selected PDF.
          </p>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={
                message.role === "user"
                  ? "rounded-xl bg-cyan-400/10 p-4 text-cyan-100"
                  : "rounded-xl bg-white/5 p-4 text-white/80"
              }
            >
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
                {message.role === "user" ? "You" : "StudySnap AI"}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-7">
                {message.text}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex gap-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask something about this PDF..."
          className="flex-1 rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30"
        />

        <button
          onClick={handleAsk}
          disabled={asking}
          className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-black disabled:opacity-60"
        >
          {asking ? "Asking..." : "Ask"}
        </button>
      </div>
    </section>
  );
}