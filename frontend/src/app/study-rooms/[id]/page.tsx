"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import AppShell from "@/components/AppShell";
import PDFUploader from "@/components/pdf/PDFUploader";
import PDFList from "@/components/pdf/PDFList";
import PDFChat from "@/components/pdf/PDFChat";
import RoomAIAssistant from "@/components/room-ai/RoomAIAssistant";
import useRequireAuth from "@/hooks/useRequireAuth";
import { deletePDF, getPDFs, getStudyRooms, summarizePDF } from "@/lib/api";

type StudyRoom = {
  id: number;
  name: string;
  subject: string;
  description?: string | null;
};

type PDFDocument = {
  id: number;
  original_filename: string;
  file_size: number;
  created_at: string;
};

type AiMode = "general" | "pdf";

const tools = [
  { title: "Notes", desc: "Write and review study notes.", href: "/notes", icon: "📝" },
  { title: "Flashcards", desc: "Review generated flashcards.", href: "/flashcards", icon: "🧠" },
  { title: "Quizzes", desc: "Test your knowledge.", href: "/quizzes", icon: "❓" },
  { title: "Planner", desc: "Plan your study sessions.", href: "/planner", icon: "📅" },
  { title: "Progress", desc: "Track your learning progress.", href: "/progress", icon: "📈" },
  { title: "AI Tutor", desc: "Open the full AI Tutor workspace.", href: "/ai-tutor", icon: "🤖" },
];

export default function StudyRoomDetailPage() {
  const ready = useRequireAuth();
  const params = useParams();
  const router = useRouter();

  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const studyRoomId = Number(id);

  const [room, setRoom] = useState<StudyRoom | null>(null);
  const [activeAiMode, setActiveAiMode] = useState<AiMode>("general");

  const [pdfs, setPdfs] = useState<PDFDocument[]>([]);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [loadingPdfs, setLoadingPdfs] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [summarizingId, setSummarizingId] = useState<number | null>(null);
  const [selectedPdfId, setSelectedPdfId] = useState<number | null>(null);
  const [summary, setSummary] = useState("");
  const [summaryTitle, setSummaryTitle] = useState("");
  const [error, setError] = useState("");

  async function loadRoom() {
    if (!studyRoomId || Number.isNaN(studyRoomId)) {
      setError("Invalid study room.");
      setLoadingRoom(false);
      return;
    }

    try {
      setLoadingRoom(true);
      setError("");

      const data = await getStudyRooms();
      const rooms = Array.isArray(data) ? data : [];
      const foundRoom = rooms.find((item: StudyRoom) => item.id === studyRoomId);

      if (!foundRoom) {
        setRoom(null);
        setError("Study room not found.");
        return;
      }

      setRoom(foundRoom);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load study room.");
    } finally {
      setLoadingRoom(false);
    }
  }

  async function loadPdfs() {
    if (!studyRoomId || Number.isNaN(studyRoomId)) return;

    try {
      setLoadingPdfs(true);
      const data = await getPDFs(studyRoomId);
      setPdfs(Array.isArray(data) ? data : []);
    } catch {
      setPdfs([]);
    } finally {
      setLoadingPdfs(false);
    }
  }

  async function handleDelete(pdfId: number) {
    if (!confirm("Delete this PDF?")) return;

    try {
      setDeletingId(pdfId);
      await deletePDF(pdfId);
      await loadPdfs();

      if (selectedPdfId === pdfId) {
        setSelectedPdfId(null);
        setSummary("");
        setSummaryTitle("");
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSummarize(pdfId: number) {
    try {
      setSummarizingId(pdfId);
      setSelectedPdfId(pdfId);
      setSummary("");
      setSummaryTitle("");

      const data = await summarizePDF(pdfId);

      setSummaryTitle(data.filename || "PDF Summary");
      setSummary(data.summary || "No summary returned.");
      setActiveAiMode("pdf");
    } finally {
      setSummarizingId(null);
    }
  }

  useEffect(() => {
    if (!ready) return;
    loadRoom();
    loadPdfs();
  }, [ready, studyRoomId]);

  if (!ready) {
    return <div className="min-h-screen bg-black p-6 text-white">Checking authentication...</div>;
  }

  return (
    <AppShell
      title={room?.name || "Study Room"}
      subtitle={room ? `Subject: ${room.subject} • AI workspace` : "AI workspace"}
    >
      <div className="content-grid">
        <div>
          <button
            type="button"
            onClick={() => router.push("/study-rooms")}
            className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            ← Back to Study Rooms
          </button>
        </div>

        {loadingRoom ? (
          <section className="rounded-2xl border border-white/10 bg-[#0a1022] p-6 text-white/70">
            Loading study room...
          </section>
        ) : null}

        {error ? (
          <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
            {error}
          </section>
        ) : null}

        {room ? (
          <>
            <section className="gold-card rounded-[2rem] p-6 sm:p-8">
              <div className="gold-chip mb-4">{room.subject}</div>
              <h2 className="panel-title text-white">{room.name}</h2>
              <p className="panel-muted mt-4 max-w-3xl">
                {room.description ||
                  "This is your AI-powered study workspace. Use General AI for normal help, or PDF Assistant to work with uploaded documents."}
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/50">
                    PDFs
                  </p>
                  <p className="mt-2 text-3xl font-black text-cyan-200">{pdfs.length}</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/50">
                    AI Modes
                  </p>
                  <p className="mt-2 text-3xl font-black text-cyan-200">2</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/50">
                    Status
                  </p>
                  <p className="mt-2 text-lg font-black text-green-300">Active</p>
                </div>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {tools.map((tool) => (
                <Link key={tool.title} href={tool.href} className="stat-card p-5">
                  <div className="text-3xl">{tool.icon}</div>
                  <h3 className="mt-4 text-xl font-black text-white">{tool.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{tool.desc}</p>
                </Link>
              ))}
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#0a1022] p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setActiveAiMode("general")}
                  className={`rounded-2xl px-5 py-4 text-sm font-black transition ${
                    activeAiMode === "general"
                      ? "bg-cyan-400 text-slate-950"
                      : "bg-black/40 text-white hover:bg-white/10"
                  }`}
                >
                  🤖 General AI
                </button>

                <button
                  type="button"
                  onClick={() => setActiveAiMode("pdf")}
                  className={`rounded-2xl px-5 py-4 text-sm font-black transition ${
                    activeAiMode === "pdf"
                      ? "bg-cyan-400 text-slate-950"
                      : "bg-black/40 text-white hover:bg-white/10"
                  }`}
                >
                  📄 PDF Assistant
                </button>
              </div>
            </section>

            {activeAiMode === "general" ? (
              <RoomAIAssistant
                studyRoomId={studyRoomId}
                conversationMode="general"
                title="Ask anything for this study room"
                subtitle="General AI help for this room. This mode does not use uploaded PDFs."
                emptyPrompt="Type a topic like “subnetting”, “Linux commands”, or “math fractions”."
                inputPlaceholder="Ask the General AI..."
              />
            ) : (
              <>
                <RoomAIAssistant
                  studyRoomId={studyRoomId}
                  conversationMode="pdf"
                  title="Ask questions about your uploaded PDFs"
                  subtitle="PDF Assistant has its own separate chat history. Real PDF RAG will be connected next."
                  emptyPrompt="Upload a PDF, then ask a question about the document."
                  inputPlaceholder="Ask the PDF Assistant..."
                />

                <section className="grid gap-6 xl:grid-cols-2">
                  <PDFUploader studyRoomId={studyRoomId} onUploaded={loadPdfs} />
                  <PDFList
                    pdfs={pdfs}
                    loading={loadingPdfs}
                    deletingId={deletingId}
                    summarizingId={summarizingId}
                    onDelete={handleDelete}
                    onSummarize={handleSummarize}
                  />
                </section>

                {summary ? (
                  <section className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
                    <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
                      AI Summary 
                    </p>
                    <h3 className="mt-2 text-2xl font-bold text-white">{summaryTitle}</h3>
                    <pre className="mt-6 whitespace-pre-wrap rounded-xl bg-black p-5 text-sm leading-7 text-white/80">
                      {summary}
                    </pre>
                  </section>
                ) : null}

                <PDFChat pdfId={selectedPdfId} filename={summaryTitle} />
              </>
            )}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}