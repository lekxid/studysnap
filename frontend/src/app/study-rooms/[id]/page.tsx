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
import StudyTogetherWorkspace from "@/features/projects/StudyTogetherWorkspace";
import {
  clearProjectRoomId,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";
import useRequireAuth from "@/hooks/useRequireAuth";
import {
  deletePDF,
  analyzeStudyMaterial,
  deleteStudyMaterial,
  downloadStudyMaterial,
  openStudyMaterial,
  getFlashcards,
  getNotes,
  getPDFs,
  getQuizzes,
  getStudyMaterials,
  getRoomFoundation,
  getStudyRoom,
  retrieveBrain,
  summarizePDF,
  type BrainSource,
  type RoomFoundation,
  type StudyMaterialItem,
} from "@/lib/api";

type StudyRoom = {
  id: number;
  name: string;
  subject: string;
  description?: string | null;
  role?: string;
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
    <section className="min-w-0 max-w-full rounded-[1.5rem] border border-white/[0.07] bg-[#12181e] p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-[#cec18d]">
            How StudySnap helps in this room
          </p>
          <h2 className="mt-2 break-words text-2xl font-black text-white">
            One connected study workspace
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            This room is the home for this topic. Materials, notes, AI Tutor,
            concept cards, quizzes, progress, and future Study Together all
            connect here.
          </p>
        </div>

        <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.035] px-4 py-3 text-sm text-slate-200">
          <p className="break-words font-black">{status}</p>
          <p className="mt-1 break-words text-xs text-slate-400">
            AI Memory: {sources.map((source) => source.replaceAll("_", " ")).join(" + ")}
          </p>
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <div
            key={step.title}
            className="min-w-0 rounded-2xl border border-white/10 bg-[#0f151b] p-4"
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
  const [studyMaterials, setStudyMaterials] =
    useState<StudyMaterialItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [conceptCards, setConceptCards] = useState<ConceptCardItem[]>([]);
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);

  const [loadingRoom, setLoadingRoom] = useState(true);
  const [loadingPdfs, setLoadingPdfs] = useState(false);
  const [
    loadingStudyMaterials,
    setLoadingStudyMaterials,
  ] = useState(false);
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

  const materialSectionRef =
    useRef<HTMLDivElement | null>(null);

  const studyTogetherSectionRef =
    useRef<HTMLDivElement | null>(null);

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

    const aiTutorUrl =
      `/general-ai?roomId=${studyRoomId}`;

    router.push(aiTutorUrl);

    window.setTimeout(() => {
      aiSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);
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

    if (requestedTab === "together") {
      setActiveRoomTab("together");

      const timer = window.setTimeout(() => {
        studyTogetherSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 180);

      return () => {
        window.clearTimeout(timer);
      };
    }

    if (hasRequestedMaterial) {
      setSelectedUniversalMaterial({
        id: parsedMaterialId,
        name:
          requestedMaterialName?.trim() ||
          `Material ${parsedMaterialId}`,
      });

      setActiveRoomTab("materials");

      const timer = window.setTimeout(() => {
        materialSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 180);

      return () => {
        window.clearTimeout(timer);
      };
    }

    if (requestedTab === "materials") {
      setActiveRoomTab("materials");
      return;
    }

    if (requestedTab !== "ai") {
      return;
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
      setRoom(null);
      setError("Invalid project.");
      setLoadingRoom(false);
      return;
    }

    try {
      setLoadingRoom(true);
      setError("");
      setRoom(null);

      const loadedRoom =
        await getStudyRoom(studyRoomId);

      setRoom(loadedRoom);
      saveProjectRoomId(studyRoomId);
    } catch (err) {
      setRoom(null);

      const message =
        err instanceof Error
          ? err.message
          : "Failed to load project.";

      const normalizedMessage =
        message.toLowerCase();

      if (
        normalizedMessage.includes(
          "study room not found"
        ) ||
        normalizedMessage.includes(
          "room not found"
        )
      ) {
        clearProjectRoomId();

        router.replace(
          "/study-rooms?notice=room-not-found"
        );

        return;
      }

      setError(message);
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

  async function loadStudyMaterials() {
    if (!studyRoomId || Number.isNaN(studyRoomId)) {
      return;
    }

    try {
      setLoadingStudyMaterials(true);

      const data = await getStudyMaterials(
        studyRoomId
      );

      const loadedMaterials =
        Array.isArray(data.materials)
          ? data.materials
          : [];

      setStudyMaterials(loadedMaterials);

      const pendingMaterials =
        loadedMaterials
          .filter(
            (material) =>
              material.intelligence_status ===
              "pending"
          )
          .slice(0, 8);

      void (async () => {
        for (const material of pendingMaterials) {
          try {
            const analyzed =
              await analyzeStudyMaterial(
                material.id
              );

            setStudyMaterials((current) =>
              current.map((item) =>
                item.id === analyzed.id
                  ? analyzed
                  : item
              )
            );
          } catch {
            // Keep the original file available when
            // intelligence analysis is unavailable.
          }
        }
      })();
    } catch {
      setStudyMaterials([]);
    } finally {
      setLoadingStudyMaterials(false);
    }
  }

  async function loadNotes() {
    if (!studyRoomId || Number.isNaN(studyRoomId)) return;

    try {
      setLoadingNotes(true);
      const data = await getNotes(studyRoomId);
      const loadedNotes: NoteItem[] =
        Array.isArray(data) ? data : [];

      const realNotes = loadedNotes.filter(
        (note) => {
          const title = (
            note.title || ""
          ).trim();

          const content = (
            note.content || ""
          ).trim();

          const generatedTitle =
            /^Uploaded (image|word|slides|spreadsheet|file):/i.test(
              title
            );

          const generatedContent =
            content.startsWith(
              "StudySnap saved this "
            );

          return !(
            generatedTitle &&
            generatedContent
          );
        }
      );

      setNotes(realNotes);
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

  async function handleOpenStudyMaterial(
    materialId: number,
    filename: string
  ) {
    try {
      await openStudyMaterial(
        materialId,
        filename
      );

      await loadStudyMaterials();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Material could not be opened."
      );
    }
  }

  async function handleDownloadStudyMaterial(
    materialId: number,
    filename: string
  ) {
    try {
      await downloadStudyMaterial(
        materialId,
        filename
      );

      await loadStudyMaterials();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Material could not be downloaded."
      );
    }
  }

  async function handleDeleteStudyMaterial(
    materialId: number
  ) {
    if (!confirm("Delete this material?")) {
      return;
    }

    try {
      await deleteStudyMaterial(materialId);
      await loadStudyMaterials();

      if (
        selectedUniversalMaterial?.id ===
        materialId
      ) {
        setSelectedUniversalMaterial(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Material could not be deleted."
      );
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

    void loadRoom();
  }, [ready, studyRoomId]);

  useEffect(() => {
    if (
      !ready ||
      room?.id !== studyRoomId
    ) {
      return;
    }

    void loadPdfs();
    void loadStudyMaterials();
    void loadNotes();
    void loadPractice();
    void loadRoomFoundation();
  }, [ready, room?.id, studyRoomId]);

  if (!ready) {
    return <div className="min-h-screen bg-[#0b0f14] p-6 text-white">Checking authentication...</div>;
  }

  // Unified General AI room redirect
  useEffect(() => {
    if (
      !ready ||
      activeRoomTab !== "ai" ||
      !studyRoomId ||
      Number.isNaN(studyRoomId)
    ) {
      return;
    }

    saveProjectRoomId(
      studyRoomId
    );

    window.localStorage.setItem(
      `studysnap:room:${studyRoomId}:last-tab`,
      "overview"
    );

    setActiveRoomTab(
      "overview"
    );

    const params = new URLSearchParams({
      roomId: String(studyRoomId),
    });

    if (
      selectedUniversalMaterial?.id
    ) {
      params.set(
        "materialId",
        String(
          selectedUniversalMaterial.id
        )
      );

      if (
        selectedUniversalMaterial.name
          ?.trim()
      ) {
        params.set(
          "materialName",
          selectedUniversalMaterial.name
            .trim()
        );
      }
    }

    window.sessionStorage.setItem(
      "studysnap:unified-ai-context",
      JSON.stringify({
        roomId: studyRoomId,
        materialId:
          selectedUniversalMaterial?.id ??
          null,
        materialName:
          selectedUniversalMaterial?.name ??
          null,
        openedAt:
          new Date().toISOString(),
      })
    );

    router.push(
      `/general-ai?${params.toString()}`
    );
  }, [
    activeRoomTab,
    ready,
    router,
    selectedUniversalMaterial,
    studyRoomId,
  ]);


  function renderOverviewTab() {
    return (
      <div className="min-w-0 max-w-full space-y-3">
        <section className="grid min-w-0 gap-3 lg:grid-cols-2">
          <section className="min-w-0 rounded-[1.2rem] border border-white/[0.075] bg-white/[0.025] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.17em] text-[#a99b68]">
                  Recent materials
                </p>

                <h3 className="mt-1 text-base font-black text-white">
                  Study files
                </h3>
              </div>

              <button
                type="button"
                onClick={() =>
                  setActiveRoomTab(
                    "materials"
                  )
                }
                className="rounded-xl border border-white/[0.075] bg-white/[0.03] px-3 py-2 text-[10px] font-black text-slate-300"
              >
                View all
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {pdfs.length ? (
                pdfs
                  .slice(0, 3)
                  .map((pdf) => (
                    <button
                      key={pdf.id}
                      type="button"
                      onClick={() => {
                        rememberRoomItem({
                          type: "pdf",
                          id: pdf.id,
                          title:
                            pdf.original_filename,
                        });

                        setSelectedPdfId(
                          pdf.id
                        );

                        setSummaryTitle(
                          pdf.original_filename
                        );

                        setActiveRoomTab(
                          "materials"
                        );
                      }}
                      className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-white/[0.065] bg-white/[0.022] px-3 py-2.5 text-left transition hover:bg-white/[0.05]"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.065] bg-white/[0.03] text-xs font-black text-[#c7b979]">
                        ▦
                      </span>

                      <span className="min-w-0 flex-1 truncate text-xs font-black text-slate-200">
                        {
                          pdf.original_filename
                        }
                      </span>

                      <span className="text-xs text-slate-600">
                        ›
                      </span>
                    </button>
                  ))
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setActiveRoomTab(
                      "materials"
                    )
                  }
                  className="w-full rounded-xl border border-dashed border-white/[0.08] bg-white/[0.018] p-4 text-left"
                >
                  <p className="text-sm font-black text-white">
                    Add your first material
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Upload a PDF or another
                    study file.
                  </p>
                </button>
              )}
            </div>
          </section>

          <section className="min-w-0 rounded-[1.2rem] border border-white/[0.075] bg-white/[0.025] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.17em] text-slate-500">
                  Recent notes
                </p>

                <h3 className="mt-1 text-base font-black text-white">
                  Room notes
                </h3>
              </div>

              <button
                type="button"
                onClick={() =>
                  setActiveRoomTab(
                    "notes"
                  )
                }
                className="rounded-xl border border-white/[0.075] bg-white/[0.03] px-3 py-2 text-[10px] font-black text-slate-300"
              >
                View all
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {notes.length ? (
                notes
                  .slice(0, 3)
                  .map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => {
                        rememberRoomItem({
                          type: "note",
                          id: note.id,
                          title:
                            note.title ||
                            "Untitled Note",
                        });

                        setActiveRoomTab(
                          "notes"
                        );
                      }}
                      className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-white/[0.065] bg-white/[0.022] px-3 py-2.5 text-left transition hover:bg-white/[0.05]"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.065] bg-white/[0.03] text-xs font-black text-slate-400">
                        ▣
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-black text-slate-200">
                          {note.title ||
                            "Untitled Note"}
                        </span>

                        <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                          {cleanDisplayText(
                            note.content,
                            70
                          ) ||
                            "Open room note"}
                        </span>
                      </span>

                      <span className="text-xs text-slate-600">
                        ›
                      </span>
                    </button>
                  ))
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setActiveRoomTab(
                      "notes"
                    )
                  }
                  className="w-full rounded-xl border border-dashed border-white/[0.08] bg-white/[0.018] p-4 text-left"
                >
                  <p className="text-sm font-black text-white">
                    Create your first note
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Keep important ideas
                    connected to this room.
                  </p>
                </button>
              )}
            </div>
          </section>
        </section>

        <details className="group overflow-hidden rounded-[1.15rem] border border-white/[0.07] bg-white/[0.018]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <span>
              <span className="block text-xs font-black text-slate-300">
                About this room
              </span>

              <span className="mt-0.5 block text-[10px] text-slate-600">
                Connected tools and AI memory
              </span>
            </span>

            <span className="text-sm text-slate-500 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>

          <div className="border-t border-white/[0.06] p-3">
            <RoomGuide
              foundation={roomFoundation}
              loading={
                loadingFoundation
              }
              error={foundationError}
            />
          </div>
        </details>
      </div>
    );
  }

  function renderMaterialsTab() {
    return (
      <div className="space-y-5">
        {selectedUniversalMaterial ? (
          <section
            ref={materialSectionRef}
            className="scroll-mt-24 rounded-2xl border border-[#c9ad50]/[0.20] bg-black p-4 shadow-[0_14px_45px_rgba(0,0,0,0.35)] sm:p-5"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[#c9ad50]/[0.18] bg-white/[0.045] text-2xl">
                📄
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c9ad50]">
                  Selected for review
                </p>

                <h2 className="mt-1 break-words text-lg font-black text-[#ece8da]">
                  {selectedUniversalMaterial.name}
                </h2>

                <p className="mt-1 text-sm leading-6 text-slate-400">
                  StudySnap opened this exact upload from your dashboard.
                </p>
              </div>

              <button
                type="button"
                onClick={openProjectAi}
                className="shrink-0 rounded-xl bg-[#c9ad50] px-4 py-2.5 text-sm font-black text-black transition hover:bg-[#d5bb63]"
              >
                Study with AI
              </button>
            </div>
          </section>
        ) : null}

        <RoomMaterialsTab
          studyRoomId={studyRoomId}
          pdfs={pdfs}
          studyMaterials={studyMaterials}
          notes={notes}
          conceptCards={conceptCards}
          quizzes={quizzes}
          loadingPdfs={loadingPdfs}
          loadingStudyMaterials={
            loadingStudyMaterials
          }
          loadingNotes={loadingNotes}
          loadingPractice={loadingPractice}
          selectedStudyMaterialId={
            selectedUniversalMaterial?.id ??
            null
          }
          onOpenStudyMaterial={
            handleOpenStudyMaterial
          }
          onDownloadStudyMaterial={
            handleDownloadStudyMaterial
          }
          onDeleteStudyMaterial={
            handleDeleteStudyMaterial
          }
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
          <section className="min-w-0 max-w-full rounded-[1.5rem] border border-white/[0.07] bg-[#12181e] p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.3em] text-[#c9ad50]/80">
                  Material Summary
                </p>

                <h3 className="mt-2 break-words text-2xl font-black text-white">
                  {summaryTitle}
                </h3>
              </div>

              <button
                type="button"
                onClick={openProjectAi}
                className="rounded-2xl border border-[#c9ad50]/[0.16] bg-white/[0.045] px-4 py-3 text-sm font-black text-[#ece8da] transition hover:bg-[#c9ad50]/20"
              >
                Study this with AI Tutor
              </button>
            </div>

            <pre className="mt-6 min-w-0 max-w-full overflow-x-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-xl bg-black p-4 text-sm leading-7 text-white/80 sm:max-h-[520px] sm:p-5">
              {summary}
            </pre>
          </section>
        ) : null}
      </div>
    );
  }

  function renderNotesTab() {
    return (
      <section className="min-w-0 max-w-full rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="break-words text-xs font-black uppercase tracking-[0.18em] text-[#a8b5bd] sm:tracking-[0.25em]">
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
            className="rounded-2xl bg-[#c9ad50] px-5 py-3 text-center text-sm font-black text-black transition hover:bg-[#d5bb63]"
          >
            Open full Notes page
          </Link>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[#0f151b] p-5">
            <p className="text-sm font-black text-white">Quick note</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Use the full Notes page for editing now. Next, we can add inline
              note creation directly inside this tab.
            </p>
            <Link
              href={`/notes?roomId=${studyRoomId}`}
              className="mt-4 inline-flex rounded-xl border border-white/[0.07] bg-[#12181e] px-4 py-3 text-sm font-black text-slate-200"
            >
              Create note →
            </Link>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0f151b] p-5">
            <p className="text-sm font-black text-white">Recent notes</p>

            <div className="mt-4 space-y-3">
              {loadingNotes ? (
                <p className="text-sm text-slate-400">Loading notes...</p>
              ) : notes.length ? (
                notes.slice(0, 5).map((note) => (
                  <Link
                    key={note.id}
                    href={`/notes?roomId=${studyRoomId}&noteId=${note.id}`}
                    className="block rounded-xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-white/[0.08] hover:bg-[#12181e]"
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
        <CompactProjectAI
          studyRoomId={studyRoomId}
          projectTitle={roomTitle}
          focusComposerToken={aiComposerFocusToken}
          selectedMaterial={selectedUniversalMaterial}
        />
      </div>
    );
  }

  function renderPracticeTab() {
    return (
      <section className="min-w-0 max-w-full rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="break-words text-xs font-black uppercase tracking-[0.18em] text-[#cec18d] sm:tracking-[0.25em]">
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

          <span className="rounded-2xl border border-white/[0.07] bg-[#12181e] px-4 py-3 text-sm font-black text-slate-200">
            {loadingPractice ? "Loading practice..." : "Practice ready"}
          </span>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Link
            href={`/flashcards?roomId=${studyRoomId}`}
            className="rounded-2xl border border-white/10 bg-[#0f151b] p-5 transition hover:border-[#c9ad50]/[0.18] hover:bg-white/[0.045]"
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
            className="rounded-2xl border border-white/10 bg-[#0f151b] p-5 transition hover:border-[#c9ad50]/[0.16] hover:bg-[#12181e]"
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

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-5">
            <p className="font-black text-slate-200">AI practice plan</p>
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
      <div
        ref={studyTogetherSectionRef}
        className="scroll-mt-8"
      >
        <StudyTogetherWorkspace
          studyRoomId={studyRoomId}
          roomTitle={roomTitle}
          currentUserRole={
            roomFoundation?.user_role ||
            room?.role ||
            "member"
          }
          materialsCount={pdfs.length}
          notesCount={notes.length}
          conceptCardsCount={conceptCards.length}
          quizzesCount={quizzes.length}
          onOpenMaterials={openMaterials}
          onOpenNotes={() =>
            setActiveRoomTab("notes")
          }
          onOpenAiTutor={openProjectAi}
        />
      </div>
    );
  }

  function renderProgressTab() {
    const progressItems = [
      {
        label: "Materials",
        value: pdfs.length + studyMaterials.length,
        tab: "materials" as RoomTab,
        icon: "▦",
      },
      {
        label: "Notes",
        value: notes.length,
        tab: "notes" as RoomTab,
        icon: "▣",
      },
      {
        label: "Cards",
        value: conceptCards.length,
        tab: "practice" as RoomTab,
        icon: "◉",
      },
      {
        label: "Quizzes",
        value: quizzes.length,
        tab: "practice" as RoomTab,
        icon: "◎",
      },
    ];

    const connectedItems = progressItems.reduce(
      (total, item) => total + item.value,
      0
    );

    return (
      <div className="min-w-0 max-w-full space-y-3">
        <section className="overflow-hidden rounded-[1.25rem] border border-white/[0.08] bg-[radial-gradient(circle_at_top_right,rgba(183,163,95,0.08),transparent_34%),linear-gradient(145deg,rgba(15,20,25,0.96),rgba(3,6,8,0.99))] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.3)] sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.17em] text-[#a99b68]">
                Room progress
              </p>

              <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">
                {progressPercent}% connected
              </h2>

              <p className="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
                {connectedItems} study item{connectedItems === 1 ? "" : "s"} currently support this room.
              </p>
            </div>

            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#b7a35f]/22 bg-[#b7a35f]/[0.08] text-sm font-black text-[#d7cb94]">
              {progressPercent}%
            </span>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-[#91824f] transition-[width]"
              style={{
                width: `${progressPercent}%`,
              }}
            />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {progressItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveRoomTab(item.tab)}
              className="flex min-w-0 items-center gap-3 rounded-[1rem] border border-white/[0.075] bg-white/[0.025] p-3 text-left transition hover:border-white/[0.13] hover:bg-white/[0.055]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.065] bg-white/[0.03] text-sm font-black text-[#c7b979]">
                {item.icon}
              </span>

              <span className="min-w-0">
                <span className="block text-lg font-black leading-none text-white">
                  {item.value}
                </span>

                <span className="mt-1 block truncate text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                  {item.label}
                </span>
              </span>
            </button>
          ))}
        </section>

        <section className="rounded-[1.15rem] border border-[#b7a35f]/18 bg-[linear-gradient(145deg,rgba(183,163,95,0.065),rgba(255,255,255,0.018))] p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#a99b68]">
                Best next step
              </p>

              <h3 className="mt-1 truncate text-sm font-black text-white">
                {smartSuggestion.title}
              </h3>

              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
                {smartSuggestion.text}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveRoomTab(smartSuggestion.tab)}
              className="shrink-0 rounded-xl border border-[#b7a35f]/22 bg-[#b7a35f]/[0.08] px-3 py-2.5 text-[10px] font-black text-[#d7cb94] transition hover:bg-[#b7a35f]/[0.14]"
            >
              {smartSuggestion.actionLabel} →
            </button>
          </div>
        </section>
      </div>
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
        <section className="rounded-3xl border border-white/10 bg-[#12181e] p-6 text-white/70">
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
