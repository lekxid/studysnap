"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";

import AppShell from "@/components/AppShell";
import PDFUploader from "@/components/pdf/PDFUploader";
import CompactProjectAI from "@/features/projects/CompactProjectAI";
import ProjectWorkspace, { type RoomTab } from "@/features/projects/ProjectWorkspace";
import RoomMaterialsTab from "@/features/projects/RoomMaterialsTab";
import { saveProjectRoomId } from "@/features/projects/projectRoomContext";
import useRequireAuth from "@/hooks/useRequireAuth";
import {
  deletePDF,
  getFlashcards,
  getNotes,
  getPDFs,
  getQuizzes,
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

type NoteItem = {
  id: number;
  title: string;
  content: string;
  study_room_id: number;
  created_at?: string;
};

type ConceptCardItem = {
  id: number;
  question?: string;
  answer?: string;
  front?: string;
  back?: string;
  created_at?: string;
};

type QuizItem = {
  id: number;
  title?: string;
  question?: string;
  study_room_id?: number;
  created_at?: string;
};

function RoomGuide({
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
      title: "Ask AI Tutor",
      text: "Ask one assistant about this room’s materials, notes, concept cards, quizzes, and memory.",
    },
    {
      icon: "🧠",
      title: "Practice",
      text: "Turn what you study into concept cards, quizzes, smart retry, and review plans.",
    },
    {
      icon: "👥",
      title: "Study together",
      text: "Soon, invite classmates, use room chat, share notes, and run group quizzes.",
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
            This room is the home for this topic. Materials, notes, AI Tutor,
            concept cards, quizzes, progress, and future Study Together all
            connect here.
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
  const searchParams = useSearchParams();

  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const studyRoomId = Number(id);

  const [room, setRoom] = useState<StudyRoom | null>(null);
  const [activeRoomTab, setActiveRoomTab] = useState<RoomTab>("overview");
  const [resumeRoomId, setResumeRoomId] = useState<number | null>(null);
  const [lastOpenedRoomItem, setLastOpenedRoomItem] = useState<{
    type: "pdf" | "note";
    id: number;
    title: string;
  } | null>(null);
  const [
    selectedUniversalMaterial,
    setSelectedUniversalMaterial,
  ] = useState<{
    id: number;
    name: string;
  } | null>(null);

  useEffect(() => {
    if (
      !studyRoomId ||
      Number.isNaN(studyRoomId) ||
      typeof window === "undefined"
    ) {
      return;
    }

    setResumeRoomId(null);
    setActiveRoomTab("overview");
    setLastOpenedRoomItem(null);
    setSelectedUniversalMaterial(null);

    const allowedTabs: RoomTab[] = [
      "overview",
      "materials",
      "notes",
      "ai",
      "practice",
      "together",
      "progress",
    ];

    const savedTab = window.localStorage.getItem(
      `studysnap:room:${studyRoomId}:last-tab`
    );

    if (savedTab && allowedTabs.includes(savedTab as RoomTab)) {
      setActiveRoomTab(savedTab as RoomTab);
    }

    const savedItem = window.localStorage.getItem(
      `studysnap:room:${studyRoomId}:last-item`
    );

    if (savedItem) {
      try {
        const parsed = JSON.parse(savedItem) as {
          type?: "pdf" | "note";
          id?: number;
          title?: string;
        };

        if (
          (parsed.type === "pdf" || parsed.type === "note") &&
          typeof parsed.id === "number" &&
          typeof parsed.title === "string"
        ) {
          setLastOpenedRoomItem({
            type: parsed.type,
            id: parsed.id,
            title: parsed.title,
          });
        }
      } catch {
        window.localStorage.removeItem(
          `studysnap:room:${studyRoomId}:last-item`
        );
      }
    }

    setResumeRoomId(studyRoomId);
  }, [studyRoomId]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      resumeRoomId !== studyRoomId
    ) {
      return;
    }

    window.localStorage.setItem(
      `studysnap:room:${studyRoomId}:last-tab`,
      activeRoomTab
    );
  }, [activeRoomTab, resumeRoomId, studyRoomId]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      resumeRoomId !== studyRoomId
    ) {
      return;
    }

    const now = new Date().toISOString();

    window.localStorage.setItem(
      "studysnap:last-study-activity-at",
      now
    );

    window.localStorage.setItem(
      "studysnap:last-study-room-id",
      String(studyRoomId)
    );

    window.localStorage.setItem(
      `studysnap:room:${studyRoomId}:last-active-at`,
      now
    );
  }, [activeRoomTab, resumeRoomId, studyRoomId]);

  const [pdfs, setPdfs] = useState<PDFDocument[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [conceptCards, setConceptCards] = useState<ConceptCardItem[]>([]);
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);

  const [loadingRoom, setLoadingRoom] = useState(true);
  const [loadingPdfs, setLoadingPdfs] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingPractice, setLoadingPractice] = useState(false);
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
  const [aiComposerFocusToken, setAiComposerFocusToken] =
    useState(0);

  const aiSectionRef = useRef<HTMLDivElement | null>(null);

  const requestedTab =
    searchParams.get("tab");

  const requestedMaterialId =
    searchParams.get("materialId") ??
    searchParams.get("material_id") ??
    searchParams.get("studyMaterialId") ??
    searchParams.get("study_material_id") ??
    searchParams.get("taskMaterialId") ??
    searchParams.get("task_material_id") ??
    searchParams.get("contextId") ??
    searchParams.get("context_id") ??
    searchParams.get("material");

  const requestedMaterialName =
    searchParams.get("materialName") ??
    searchParams.get("material_name") ??
    searchParams.get("materialTitle") ??
    searchParams.get("material_title") ??
    searchParams.get("filename") ??
    searchParams.get("name") ??
    searchParams.get("title");

  function changeRoomTab(tab: RoomTab) {
    setActiveRoomTab(tab);

    if (tab === "ai") {
      setAiComposerFocusToken(
        (current) => current + 1
      );
    }
  }

  function openProjectAi() {
    changeRoomTab("ai");

    setTimeout(() => {
      aiSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }

  function openMaterials() {
    setActiveRoomTab("materials");
  }

  useEffect(() => {
    if (
      !studyRoomId ||
      Number.isNaN(studyRoomId)
    ) {
      return;
    }

    const parsedMaterialId = Number(
      requestedMaterialId
    );

    const hasRequestedMaterial =
      requestedMaterialId !== null &&
      Number.isFinite(parsedMaterialId) &&
      parsedMaterialId > 0;

    const shouldOpenAi =
      requestedTab === "ai" ||
      hasRequestedMaterial;

    if (!shouldOpenAi) {
      return;
    }

    if (hasRequestedMaterial) {
      setSelectedUniversalMaterial({
        id: parsedMaterialId,
        name:
          requestedMaterialName?.trim() ||
          "Selected material",
      });
    }

    setActiveRoomTab("ai");
    setAiComposerFocusToken(
      (current) => current + 1
    );

    const timer = window.setTimeout(() => {
      aiSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    requestedMaterialId,
    requestedMaterialName,
    requestedTab,
    studyRoomId,
  ]);

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
        err instanceof Error ? err.message : "Room search failed."
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
      setActiveRoomTab("materials");
      return;
    }

    if (result.source_type === "note_chunk") {
      setActiveRoomTab("notes");
      return;
    }

    if (result.source_type === "flashcard") {
      setActiveRoomTab("practice");
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

  const progressPercent = Math.min(
    100,
    Math.round(
      ((pdfs.length + notes.length + conceptCards.length + quizzes.length) / 12) *
        100
    )
  );

  const selectedPdfTitle =
    pdfs.find((pdf) => pdf.id === selectedPdfId)?.original_filename ||
    summaryTitle ||
    "Selected PDF material";

  const smartSuggestion = useMemo(() => {
    if (!pdfs.length && !notes.length) {
      return {
        title: "Add your first study material",
        text: "Upload a PDF or create a note so your AI Tutor can start learning with you.",
        tab: "materials" as RoomTab,
        actionLabel: "Add study material",
      };
    }

    if (!notes.length) {
      return {
        title: "Capture what you are learning",
        text: "Create a note from your material so the important ideas stay easy to review.",
        tab: "notes" as RoomTab,
        actionLabel: "Create a note",
      };
    }

    if (!conceptCards.length && !quizzes.length) {
      return {
        title: "Turn learning into practice",
        text: "You already have room context. Create Concept Cards or a quiz to test yourself.",
        tab: "practice" as RoomTab,
        actionLabel: "Start practicing",
      };
    }

    return {
      title: "Ask what to study next",
      text: "Your AI Tutor now has enough room context to explain, review, and guide your next step.",
      tab: "ai" as RoomTab,
      actionLabel: "Ask AI Tutor",
    };
  }, [
    conceptCards.length,
    notes.length,
    pdfs.length,
    quizzes.length,
  ]);

  function rememberRoomItem(item: {
    type: "pdf" | "note";
    id: number;
    title: string;
  }) {
    setLastOpenedRoomItem(item);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        `studysnap:room:${studyRoomId}:last-item`,
        JSON.stringify(item)
      );
    }
  }

  const continueItems = useMemo(() => {
    const items: {
      id: string;
      title: string;
      subtitle: string;
      icon: string;
      onOpen: () => void;
    }[] = [];

    const recentPdfs = [...pdfs].sort((first, second) => {
      const firstTime = Date.parse(first.created_at || "") || 0;
      const secondTime = Date.parse(second.created_at || "") || 0;
      return secondTime - firstTime;
    });

    const recentNotes = [...notes].sort((first, second) => {
      const firstTime = Date.parse(first.created_at || "") || 0;
      const secondTime = Date.parse(second.created_at || "") || 0;
      return secondTime - firstTime;
    });

    if (lastOpenedRoomItem?.type === "pdf") {
      const pdf = pdfs.find(
        (item) => item.id === lastOpenedRoomItem.id
      );

      if (pdf) {
        items.push({
          id: `pdf-${pdf.id}`,
          title: pdf.original_filename,
          subtitle: "Continue where you stopped",
          icon: "📕",
          onOpen: () => {
            rememberRoomItem({
              type: "pdf",
              id: pdf.id,
              title: pdf.original_filename,
            });
            setSelectedPdfId(pdf.id);
            setSummaryTitle(pdf.original_filename);
            setActiveRoomTab("materials");
          },
        });
      }
    }

    if (lastOpenedRoomItem?.type === "note") {
      const note = notes.find(
        (item) => item.id === lastOpenedRoomItem.id
      );

      if (note) {
        items.push({
          id: `note-${note.id}`,
          title: note.title || "Untitled Note",
          subtitle: "Continue where you stopped",
          icon: "📝",
          onOpen: () => {
            rememberRoomItem({
              type: "note",
              id: note.id,
              title: note.title || "Untitled Note",
            });
            setActiveRoomTab("notes");
          },
        });
      }
    }

    recentPdfs.forEach((pdf) => {
      const id = `pdf-${pdf.id}`;

      if (items.some((item) => item.id === id)) return;

      items.push({
        id,
        title: pdf.original_filename,
        subtitle: "Recently added study material",
        icon: "📕",
        onOpen: () => {
          rememberRoomItem({
            type: "pdf",
            id: pdf.id,
            title: pdf.original_filename,
          });
          setSelectedPdfId(pdf.id);
          setSummaryTitle(pdf.original_filename);
          setActiveRoomTab("materials");
        },
      });
    });

    recentNotes.forEach((note) => {
      const id = `note-${note.id}`;

      if (items.some((item) => item.id === id)) return;

      items.push({
        id,
        title: note.title || "Untitled Note",
        subtitle: "Recent room note",
        icon: "📝",
        onOpen: () => {
          rememberRoomItem({
            type: "note",
            id: note.id,
            title: note.title || "Untitled Note",
          });
          setActiveRoomTab("notes");
        },
      });
    });

    return items.slice(0, 4);
  }, [lastOpenedRoomItem, notes, pdfs]);

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

  async function loadNotes() {
    if (!studyRoomId || Number.isNaN(studyRoomId)) return;

    try {
      setLoadingNotes(true);
      const data = await getNotes(studyRoomId);
      setNotes(Array.isArray(data) ? data : []);
    } catch {
      setNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  }

  async function loadPractice() {
    if (!studyRoomId || Number.isNaN(studyRoomId)) return;

    try {
      setLoadingPractice(true);
      const [cardData, quizData] = await Promise.all([
        getFlashcards(studyRoomId).catch(() => []),
        getQuizzes(studyRoomId).catch(() => []),
      ]);

      setConceptCards(Array.isArray(cardData) ? cardData : []);
      setQuizzes(Array.isArray(quizData) ? quizData : []);
    } finally {
      setLoadingPractice(false);
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
      setActiveRoomTab("materials");
    } finally {
      setSummarizingId(null);
    }
  }

  useEffect(() => {
    if (!ready) return;
    saveProjectRoomId(studyRoomId);
    loadRoom();
    loadPdfs();
    loadNotes();
    loadPractice();
    loadRoomFoundation();
  }, [ready, studyRoomId]);

  if (!ready) {
    return <div className="min-h-screen bg-black p-6 text-white">Checking authentication...</div>;
  }

  function renderOverviewTab() {
    return (
      <div className="space-y-5">
        <RoomGuide
          foundation={roomFoundation}
          loading={loadingFoundation}
          error={foundationError}
        />

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">
              Recent Materials
            </p>
            <h3 className="mt-2 text-xl font-black text-white">
              PDFs in this room
            </h3>

            <div className="mt-4 space-y-3">
              {pdfs.length ? (
                pdfs.slice(0, 3).map((pdf) => (
                  <button
                    key={pdf.id}
                    type="button"
                    onClick={() => {
                      setSelectedPdfId(pdf.id);
                      setSummaryTitle(pdf.original_filename);
                      setActiveRoomTab("materials");
                    }}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left text-sm font-bold text-white"
                  >
                    📕 {pdf.original_filename}
                  </button>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-400">
                  Add your first PDF to start learning. Your AI Tutor can summarize it, explain it, and help you practice.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">
              Recent Notes
            </p>
            <h3 className="mt-2 text-xl font-black text-white">
              Notes connected to this room
            </h3>

            <div className="mt-4 space-y-3">
              {notes.length ? (
                notes.slice(0, 3).map((note) => (
                  <div
                    key={note.id}
                    className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
                  >
                    <p className="line-clamp-1 text-sm font-black text-white">
                      📝 {note.title || "Untitled Note"}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
                      {note.content || "Start writing — your AI Tutor can help you build this note."}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-400">
                  Write your first note — your AI Tutor will learn from it.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-yellow-300/15 bg-yellow-300/10 p-5">
            <p className="text-sm font-black text-yellow-100">Pinned Items</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Pin PDFs, notes, concept cards, and quizzes here later.
            </p>
          </div>

          <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/10 p-5">
            <p className="text-sm font-black text-cyan-100">Room Activity</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Uploads, AI actions, summaries, and Study Together updates will appear here.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-5">
            <p className="text-sm font-black text-emerald-100">
              Study Together Preview
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Invite classmates, share notes, and quiz together soon.
            </p>
          </div>
        </section>
      </div>
    );
  }

  function renderMaterialsTab() {
    return (
      <div className="space-y-5">
        <RoomMaterialsTab
          studyRoomId={studyRoomId}
          pdfs={pdfs}
          notes={notes}
          conceptCards={conceptCards}
          quizzes={quizzes}
          loadingPdfs={loadingPdfs}
          loadingNotes={loadingNotes}
          loadingPractice={loadingPractice}
          selectedPdfId={selectedPdfId}
          selectedPdfTitle={selectedPdfTitle}
          onSelectPdf={(pdfId, title) => {
            setSelectedPdfId(pdfId);
            setSummaryTitle(title);
          }}
          onSummarizePdf={handleSummarize}
          onDeletePdf={handleDelete}
          onOpenAiTutor={openProjectAi}
          renderUploader={
            <PDFUploader
              studyRoomId={studyRoomId}
              onUploaded={async () => {
                await loadPdfs();
                await loadRoomFoundation();
              }}
            />
          }
        />

        {summary ? (
          <section className="rounded-[1.5rem] border border-yellow-400/20 bg-[#0a1022] p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.3em] text-yellow-300/80">
                  Material Summary
                </p>

                <h3 className="mt-2 break-words text-2xl font-black text-white">
                  {summaryTitle}
                </h3>
              </div>

              <button
                type="button"
                onClick={openProjectAi}
                className="rounded-2xl border border-yellow-300/25 bg-yellow-300/10 px-4 py-3 text-sm font-black text-yellow-100 transition hover:bg-yellow-300/20"
              >
                Study this with AI Tutor
              </button>
            </div>

            <pre className="mt-6 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-black p-5 text-sm leading-7 text-white/80">
              {summary}
            </pre>
          </section>
        ) : null}
      </div>
    );
  }

  function renderNotesTab() {
    return (
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">
              Room Notes
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Notes live inside this room
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Create notes for this topic. AI Tutor can use them together with
              PDFs, concept cards, quizzes, and room memory.
            </p>
          </div>

          <Link
            href={`/notes?roomId=${studyRoomId}`}
            className="rounded-2xl bg-yellow-300 px-5 py-3 text-center text-sm font-black text-black transition hover:bg-yellow-200"
          >
            Open full Notes page
          </Link>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <p className="text-sm font-black text-white">Quick note</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Use the full Notes page for editing now. Next, we can add inline
              note creation directly inside this tab.
            </p>
            <Link
              href={`/notes?roomId=${studyRoomId}`}
              className="mt-4 inline-flex rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100"
            >
              Create note →
            </Link>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <p className="text-sm font-black text-white">Recent notes</p>

            <div className="mt-4 space-y-3">
              {loadingNotes ? (
                <p className="text-sm text-slate-400">Loading notes...</p>
              ) : notes.length ? (
                notes.slice(0, 5).map((note) => (
                  <Link
                    key={note.id}
                    href={`/notes?roomId=${studyRoomId}&noteId=${note.id}`}
                    className="block rounded-xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-cyan-300/25 hover:bg-cyan-300/10"
                  >
                    <p className="line-clamp-1 text-sm font-black text-white">
                      {note.title || "Untitled Note"}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
                      {note.content || "Start writing — your AI Tutor can help you build this note."}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-400">
                  Write your first note — your AI Tutor will learn from it.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderAiTab() {
    return (
      <div ref={aiSectionRef} className="scroll-mt-8">
        <div className="mb-4">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">
            AI Tutor
          </p>
          <h2 className="mt-2 text-xl font-black text-white">
            Ask one AI about this whole room
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Ask about PDFs, notes, concept cards, quizzes, summaries, weak
            concepts, and study plans.
          </p>
        </div>

        <CompactProjectAI
          studyRoomId={studyRoomId}
          projectTitle={roomTitle}
          focusComposerToken={aiComposerFocusToken}
            selectedMaterial={
              selectedUniversalMaterial
            }        />
      </div>
    );
  }

  function renderPracticeTab() {
    return (
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">
              Practice
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Concept cards, quizzes, and smart retry
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              This is where review becomes active practice. Smart retry and weak
              concept practice will grow here.
            </p>
          </div>

          <span className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100">
            {loadingPractice ? "Loading practice..." : "Practice ready"}
          </span>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Link
            href={`/flashcards?roomId=${studyRoomId}`}
            className="rounded-2xl border border-white/10 bg-black/20 p-5 transition hover:border-yellow-300/30 hover:bg-yellow-300/10"
          >
            <p className="text-3xl">🧠</p>
            <h3 className="mt-3 text-xl font-black text-white">
              Concept Cards
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {conceptCards.length} card{conceptCards.length === 1 ? "" : "s"} connected to this room.
            </p>
          </Link>

          <Link
            href={`/quizzes?roomId=${studyRoomId}`}
            className="rounded-2xl border border-white/10 bg-black/20 p-5 transition hover:border-cyan-300/30 hover:bg-cyan-300/10"
          >
            <p className="text-3xl">🧾</p>
            <h3 className="mt-3 text-xl font-black text-white">Quizzes</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {quizzes.length} quiz item{quizzes.length === 1 ? "" : "s"} connected to this room.
            </p>
          </Link>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-red-300/15 bg-red-400/10 p-5">
            <p className="font-black text-red-100">Weak concept retry</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Soon: automatically retry missed, slow, or low-confidence questions.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/10 p-5">
            <p className="font-black text-emerald-100">AI practice plan</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Soon: AI Tutor will recommend what to review next from this room.
            </p>
          </div>
        </div>
      </section>
    );
  }

  function renderStudyTogetherTab() {
    return (
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">
          Study Together
        </p>
        <h2 className="mt-2 text-2xl font-black text-white">
          Make this room feel alive
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Study Together will live inside each room so classmates can study from
          the same materials, notes, quizzes, and AI Tutor.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {[
            ["👥", "Invite classmates", "Add people to this room later."],
            ["💬", "Room chat", "Discuss materials and questions in context."],
            ["🤖", "Shared AI Tutor", "Ask questions as a group with room memory."],
            ["🧾", "Group quiz", "Practice together from the same room content."],
          ].map(([icon, title, text]) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-black/20 p-5"
            >
              <p className="text-3xl">{icon}</p>
              <h3 className="mt-3 text-lg font-black text-white">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderProgressTab() {
    return (
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-200">
          Progress
        </p>
        <h2 className="mt-2 text-2xl font-black text-white">
          Room learning progress
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Track how much content is connected and where practice should focus.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Materials", pdfs.length],
            ["Notes", notes.length],
            ["Concept Cards", conceptCards.length],
            ["Quizzes", quizzes.length],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-2xl border border-white/10 bg-black/20 p-5"
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                {label}
              </p>
              <p className="mt-3 text-3xl font-black text-white">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-yellow-300/15 bg-yellow-300/10 p-5">
          <p className="font-black text-yellow-100">Next progress upgrade</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Add concept heatmap, quiz history, confidence tracking, time-to-answer,
            and smart retry analytics.
          </p>
        </div>
      </section>
    );
  }

  function renderActiveTab() {
    if (activeRoomTab === "overview") return renderOverviewTab();
    if (activeRoomTab === "materials") return renderMaterialsTab();
    if (activeRoomTab === "notes") return renderNotesTab();
    if (activeRoomTab === "ai") return renderAiTab();
    if (activeRoomTab === "practice") return renderPracticeTab();
    if (activeRoomTab === "together") return renderStudyTogetherTab();
    return renderProgressTab();
  }

  return (
    <AppShell
      title={roomTitle}
      subtitle={room ? `Subject: ${roomSubject} • Connected study room` : "Connected study room"}
    >
      {loadingRoom ? (
        <section className="rounded-3xl border border-white/10 bg-[#0a1022] p-6 text-white/70">
          Loading room...
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
          materialsCount={pdfs.length}
          notesCount={notes.length}
          conceptCardsCount={conceptCards.length}
          quizzesCount={quizzes.length}
          progress={progressPercent}
          continueItems={continueItems}
          smartSuggestion={smartSuggestion}
          searchQuery={projectSearchQuery}
          searchResults={projectSearchResults}
          searchLoading={projectSearchLoading}
          searchError={projectSearchError}
          activeTab={activeRoomTab}
          onChangeTab={changeRoomTab}
          onBack={() => router.push("/study-rooms")}
          onSearch={handleProjectSearch}
          onOpenSearchResult={handleOpenSearchResult}
        >
          {renderActiveTab()}
        </ProjectWorkspace>
      ) : null}
    </AppShell>
  );
}
