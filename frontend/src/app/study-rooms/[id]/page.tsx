"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import AppShell from "@/components/AppShell";
import PDFUploader from "@/components/pdf/PDFUploader";
import PDFList from "@/components/pdf/PDFList";
import PDFChat from "@/components/pdf/PDFChat";
import RoomAIAssistant from "@/components/room-ai/RoomAIAssistant";
import ProjectWorkspace from "@/features/projects/ProjectWorkspace";
import useRequireAuth from "@/hooks/useRequireAuth";
import {
  deletePDF,
  getPDFs,
  getStudyRooms,
  retrieveBrain,
  summarizePDF,
  type BrainSource,
} from "@/lib/api";

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
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [projectSearchResults, setProjectSearchResults] = useState<BrainSource[]>([]);
  const [projectSearchLoading, setProjectSearchLoading] = useState(false);
  const [projectSearchError, setProjectSearchError] = useState("");
  const [error, setError] = useState("");

  const aiSectionRef = useRef<HTMLDivElement | null>(null);
  const pdfSectionRef = useRef<HTMLDivElement | null>(null);

  function scrollToAi() {
    aiSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToPdf() {
    pdfSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openProjectAi() {
    setActiveAiMode("general");
    setTimeout(scrollToAi, 100);
  }

  function openPdfAssistant() {
    setActiveAiMode("pdf");
    setTimeout(scrollToPdf, 100);
  }

  async function handleProjectSearch(query: string) {
    if (!query.trim()) return;

    try {
      setProjectSearchQuery(query.trim());
      setProjectSearchLoading(true);
      setProjectSearchError("");
      setProjectSearchResults([]);

      const data = await retrieveBrain(query.trim(), studyRoomId, 10);
      setProjectSearchResults(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      setProjectSearchError(
        err instanceof Error ? err.message : "Project search failed."
      );
    } finally {
      setProjectSearchLoading(false);
    }
  }

  function getNumberValue(value: unknown) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function handleOpenSearchResult(result: BrainSource) {
    const metadata = (result.metadata || {}) as Record<string, unknown>;

    if (result.source_type === "pdf_chunk") {
      const pdfId =
        getNumberValue(metadata.pdf_id) ||
        getNumberValue(metadata.document_id) ||
        getNumberValue(metadata.pdf_document_id) ||
        getNumberValue(result.source_id);

      if (pdfId !== null) {
        setSelectedPdfId(pdfId);
      }

      setSummaryTitle(result.title || "PDF result");
      openPdfAssistant();
      return;
    }

    if (result.source_type === "note_chunk") {
      const noteId =
        getNumberValue(metadata.note_id) ||
        getNumberValue(result.source_id);

      const noteParam = noteId !== null ? `&noteId=${noteId}` : "";
      router.push(`/notes?roomId=${studyRoomId}${noteParam}`);
      return;
    }

    if (result.source_type === "flashcard") {
      router.push(`/flashcards?roomId=${studyRoomId}`);
      return;
    }

    openProjectAi();
  }

  const cleanDisplayText = (value: string | null | undefined, maxLength = 100) => {
    const cleaned = (value || "")
      .replace(/[*_`>#-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}...` : cleaned;
  };

  const roomTitle = cleanDisplayText(room?.name, 90) || "Project";
  const roomSubject = cleanDisplayText(room?.subject, 60) || "Subject";
  const progressPercent = Math.min(100, Math.round((pdfs.length / 5) * 100));

  const continueItems = pdfs.slice(0, 3).map((pdf) => ({
    id: pdf.id,
    title: pdf.original_filename,
    subtitle: "Uploaded study material",
    icon: "📕",
    onOpen: () => {
      setSelectedPdfId(pdf.id);
      setSummaryTitle(pdf.original_filename);
      openPdfAssistant();
    },
  }));

  const quickActions = [
    {
      title: "Upload PDF",
      description: "Add study material",
      icon: "📄",
      onClick: openPdfAssistant,
    },
    {
      title: "Create Note",
      description: "Write and organize ideas",
      icon: "📝",
      href: `/notes?roomId=${studyRoomId}`,
    },
    {
      title: "Flashcards",
      description: "Review smart cards",
      icon: "🧠",
      href: `/flashcards?roomId=${studyRoomId}`,
    },
    {
      title: "Take Quiz",
      description: "Test your knowledge",
      icon: "🧾",
      href: `/quizzes?roomId=${studyRoomId}`,
    },
    {
      title: "Planner",
      description: "Plan study sessions",
      icon: "📅",
      href: `/planner?roomId=${studyRoomId}`,
    },
    {
      title: "Ask Project AI",
      description: "Get instant help",
      icon: "🤖",
      onClick: openProjectAi,
    },
  ];

  async function loadRoom() {
    if (!studyRoomId || Number.isNaN(studyRoomId)) {
      setError("Invalid project.");
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
        setError("Project not found.");
        return;
      }

      setRoom(foundRoom);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project.");
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
      openPdfAssistant();
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
      title={roomTitle}
      subtitle={room ? `Subject: ${roomSubject} • Project workspace` : "Project workspace"}
    >
      {loadingRoom ? (
        <section className="rounded-3xl border border-white/10 bg-[#0a1022] p-6 text-white/70">
          Loading project...
        </section>
      ) : null}

      {error ? (
        <section className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
          {error}
        </section>
      ) : null}

      {room ? (
        <ProjectWorkspace
          studyRoomId={studyRoomId}
          title={roomTitle}
          subject={roomSubject}
          description={room.description}
          pdfCount={pdfs.length}
          progress={progressPercent}
          continueItems={continueItems}
          quickActions={quickActions}
          searchQuery={projectSearchQuery}
          searchResults={projectSearchResults}
          searchLoading={projectSearchLoading}
          searchError={projectSearchError}
          onBack={() => router.push("/study-rooms")}
          onAskAI={openProjectAi}
          onUploadPDF={openPdfAssistant}
          onSearch={handleProjectSearch}
          onOpenSearchResult={handleOpenSearchResult}
          onViewAll={openPdfAssistant}
          activeTool={activeAiMode === "general" ? "ai" : "pdf"}
          onOpenNotes={() => router.push(`/notes?roomId=${studyRoomId}`)}
          onOpenFlashcards={() => router.push(`/flashcards?roomId=${studyRoomId}`)}
          onOpenQuizzes={() => router.push(`/quizzes?roomId=${studyRoomId}`)}
          onOpenPlanner={() => router.push(`/planner?roomId=${studyRoomId}`)}
        >
          {activeAiMode === "general" ? (
            <div ref={aiSectionRef} className="scroll-mt-8">
              <RoomAIAssistant
                studyRoomId={studyRoomId}
                conversationMode="general"
                title="Ask Project AI"
                subtitle="StudySnap uses this project's context to help you learn faster."
                emptyPrompt="Try: “What is tachycardia?” or “Explain this in simple words.”"
                inputPlaceholder="Ask Project AI..."
              />
            </div>
          ) : (
            <>
              <section ref={pdfSectionRef} className="grid gap-6 scroll-mt-8 xl:grid-cols-2">
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

              <RoomAIAssistant
                studyRoomId={studyRoomId}
                conversationMode="pdf"
                title="Ask questions about your uploaded PDFs"
                subtitle="Use this mode when you want help with study documents."
                emptyPrompt="Upload a PDF, summarize it, then ask a question about it."
                inputPlaceholder="Ask the PDF Assistant..."
              />

              {summary ? (
                <section className="rounded-3xl border border-yellow-400/20 bg-[#0a1022] p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-yellow-300/80">
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
        </ProjectWorkspace>
      ) : null}
    </AppShell>
  );
}
