"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import AppShell from "@/components/AppShell";
import PDFUploader from "@/components/pdf/PDFUploader";
import PDFList from "@/components/pdf/PDFList";
import CompactProjectAI from "@/features/projects/CompactProjectAI";
import ProjectWorkspace from "@/features/projects/ProjectWorkspace";
import { saveProjectRoomId } from "@/features/projects/projectRoomContext";
import useRequireAuth from "@/hooks/useRequireAuth";
import {
  deletePDF,
  getPDFs,
  getRoomFoundation,
  getStudyRooms,
  retrieveBrain,
  summarizePDF,
  type BrainSource,
  type RoomFoundation,
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

function RoomFoundationPanel({
  foundation,
  loading,
  error,
}: {
  foundation: RoomFoundation | null;
  loading: boolean;
  error: string;
}) {
  const sources =
    Array.isArray(foundation?.context_engine?.available_sources) &&
    foundation.context_engine.available_sources.length
      ? foundation.context_engine.available_sources
      : ["pdf", "note", "concept cards", "quiz", "chat"];

  const status = loading
    ? "Connecting room..."
    : error
      ? "Room guide available"
      : "AI memory ready";

  const steps = [
    {
      icon: "📚",
      title: "Add materials",
      text: "Upload PDFs or create notes. Everything stays connected to this room.",
    },
    {
      icon: "🤖",
      title: "Ask Project AI",
      text: "Use one assistant to study from this room’s PDFs, notes, concept cards, quizzes, and memory.",
    },
    {
      icon: "🧠",
      title: "Create study tools",
      text: "Turn your materials into summaries, notes, concept cards, quizzes, and review plans.",
    },
    {
      icon: "👥",
      title: "Study together",
      text: "Soon, this room will support classmates, shared AI help, room chat, and group quizzes.",
    },
  ];

  return (
    <section className="rounded-[1.5rem] border border-yellow-300/15 bg-[linear-gradient(135deg,rgba(250,204,21,0.08),rgba(14,165,233,0.05),rgba(2,6,23,0.92))] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">
            How StudySnap helps in this room
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">
            One connected study workspace
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            This room is the home for this topic. Materials, notes, AI, concept
            cards, quizzes, progress, and future Study Together all connect here.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
          <p className="font-black">{status}</p>
          <p className="mt-1 text-xs text-emerald-100/70">
            AI Memory: {sources.map((source) => source.replaceAll("_", " ")).join(" + ")}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        {steps.map((step) => (
          <div
            key={step.title}
            className="rounded-2xl border border-white/10 bg-black/25 p-4"
          >
            <div className="text-2xl">{step.icon}</div>
            <h3 className="mt-3 text-sm font-black text-white">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">{step.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

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
  const [loadingFoundation, setLoadingFoundation] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [summarizingId, setSummarizingId] = useState<number | null>(null);
  const [selectedPdfId, setSelectedPdfId] = useState<number | null>(null);
  const [summary, setSummary] = useState("");
  const [summaryTitle, setSummaryTitle] = useState("");
  const [roomFoundation, setRoomFoundation] = useState<RoomFoundation | null>(null);
  const [foundationError, setFoundationError] = useState("");
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

  const selectedPdfTitle =
    pdfs.find((pdf) => pdf.id === selectedPdfId)?.original_filename ||
    summaryTitle ||
    "Selected PDF material";

  const quickActions = [
    {
      title: "Add Materials",
      description: "Upload PDFs into this room",
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
      title: "Concept Cards",
      description: "Review key ideas",
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

  async function loadRoomFoundation() {
    if (!studyRoomId || Number.isNaN(studyRoomId)) return;

    try {
      setLoadingFoundation(true);
      setFoundationError("");

      const data = await getRoomFoundation(studyRoomId);
      setRoomFoundation(data);
    } catch (err) {
      setRoomFoundation(null);
      setFoundationError(
        err instanceof Error ? err.message : "Failed to load room foundation."
      );
    } finally {
      setLoadingFoundation(false);
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
    saveProjectRoomId(studyRoomId);
    loadRoom();
    loadPdfs();
    loadRoomFoundation();
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
          <RoomFoundationPanel
            foundation={roomFoundation}
            loading={loadingFoundation}
            error={foundationError}
          />

          <section
            ref={pdfSectionRef}
            className="scroll-mt-8 rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5"
          >
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">
                  Room Materials
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  Add PDFs to this project
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  PDFs are study materials inside this room. Upload or summarize them here,
                  then use Project AI below to study everything together.
                </p>

                {selectedPdfId ? (
                  <div className="mt-3 rounded-xl border border-yellow-300/15 bg-white/5 p-3 text-xs text-slate-300">
                    <p className="font-bold text-yellow-100">Selected Material</p>
                    <p className="mt-1">{selectedPdfTitle}</p>
                    <button
                      type="button"
                      onClick={openProjectAi}
                      className="mt-3 rounded-lg bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-300/15 hover:text-cyan-100"
                    >
                      Study with Project AI
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={openProjectAi}
                className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black transition hover:bg-yellow-200"
              >
                Ask Project AI about this room
              </button>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <PDFUploader studyRoomId={studyRoomId} onUploaded={loadPdfs} />

              <div className="space-y-4">
                <PDFList
                  pdfs={pdfs}
                  loading={loadingPdfs}
                  deletingId={deletingId}
                  summarizingId={summarizingId}
                  onDelete={handleDelete}
                  onSummarize={handleSummarize}
                />

                {pdfs.length ? (
                  <button
                    type="button"
                    onClick={openProjectAi}
                    className="w-full rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15"
                  >
                    Study these materials with Project AI
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">
                  Pinned Items
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Pin PDFs, notes, concept cards, and quizzes here later.
                </p>
              </section>

              <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">
                  Room Activity
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  AI actions, uploads, summaries, and Study Together updates will appear here later.
                </p>
              </section>
            </div>
          </section>

          {summary ? (
            <section className="rounded-[1.5rem] border border-yellow-400/20 bg-[#0a1022] p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.3em] text-yellow-300/80">
                    Material Summary
                  </p>
                  <h3 className="mt-2 text-2xl font-black text-white">
                    {summaryTitle}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={openProjectAi}
                  className="rounded-2xl border border-yellow-300/25 bg-yellow-300/10 px-4 py-3 text-sm font-black text-yellow-100 transition hover:bg-yellow-300/20"
                >
                  Study this with Project AI
                </button>
              </div>

              <pre className="mt-6 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-black p-5 text-sm leading-7 text-white/80">
                {summary}
              </pre>
            </section>
          ) : null}

          <div className="my-10 h-px w-full bg-white/10" />

          <div ref={aiSectionRef} className="scroll-mt-8">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">
                Main Assistant
              </p>
              <h2 className="mt-2 text-xl font-black text-white">
                Project AI Workspace
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Ask one AI about everything in this room: PDFs, notes, concept cards,
                quizzes, summaries, weak concepts, and study plans.
              </p>
            </div>

            <CompactProjectAI
              studyRoomId={studyRoomId}
              projectTitle={roomTitle}
            />
          </div>

        </ProjectWorkspace>
      ) : null}
    </AppShell>
  );
}
