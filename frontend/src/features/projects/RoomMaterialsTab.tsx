"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type MaterialFilter =
  | "all"
  | "pdf"
  | "note"
  | "concept-card"
  | "quiz";

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

type Props = {
  studyRoomId: number;

  pdfs: PDFDocument[];
  notes: NoteItem[];
  conceptCards: ConceptCardItem[];
  quizzes: QuizItem[];

  loadingPdfs: boolean;
  loadingNotes: boolean;
  loadingPractice: boolean;

  selectedPdfId: number | null;
  selectedPdfTitle: string;

  onSelectPdf: (pdfId: number, title: string) => void;
  onSummarizePdf: (pdfId: number) => void;
  onDeletePdf: (pdfId: number) => void;
  onOpenAiTutor: () => void;

  renderUploader: React.ReactNode;
};

type UnifiedMaterial = {
  key: string;
  id: number;
  type: Exclude<MaterialFilter, "all">;
  title: string;
  description: string;
  createdAt?: string;
  icon: string;
};

function formatDate(value?: string) {
  if (!value) return "Recently added";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently added";
  }

  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "PDF document";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getConceptCardTitle(card: ConceptCardItem, index: number) {
  return (
    card.question?.trim() ||
    card.front?.trim() ||
    `Concept Card ${index + 1}`
  );
}

function getConceptCardDescription(card: ConceptCardItem) {
  return (
    card.answer?.trim() ||
    card.back?.trim() ||
    "Review this concept card during practice."
  );
}

function getQuizTitle(quiz: QuizItem, index: number) {
  return quiz.title?.trim() || quiz.question?.trim() || `Quiz ${index + 1}`;
}

function filterLabel(filter: MaterialFilter) {
  if (filter === "all") return "All";
  if (filter === "pdf") return "PDFs";
  if (filter === "note") return "Notes";
  if (filter === "concept-card") return "Concept Cards";
  return "Quizzes";
}

export default function RoomMaterialsTab({
  studyRoomId,
  pdfs,
  notes,
  conceptCards,
  quizzes,
  loadingPdfs,
  loadingNotes,
  loadingPractice,
  selectedPdfId,
  selectedPdfTitle,
  onSelectPdf,
  onSummarizePdf,
  onDeletePdf,
  onOpenAiTutor,
  renderUploader,
}: Props) {
  const [filter, setFilter] = useState<MaterialFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const materials = useMemo<UnifiedMaterial[]>(() => {
    const pdfItems: UnifiedMaterial[] = pdfs.map((pdf) => ({
      key: `pdf-${pdf.id}`,
      id: pdf.id,
      type: "pdf",
      title: pdf.original_filename,
      description: formatFileSize(pdf.file_size),
      createdAt: pdf.created_at,
      icon: "📄",
    }));

    const noteItems: UnifiedMaterial[] = notes.map((note) => ({
      key: `note-${note.id}`,
      id: note.id,
      type: "note",
      title: note.title?.trim() || "Untitled Note",
      description:
        note.content?.trim() || "This note does not have any content yet.",
      createdAt: note.created_at,
      icon: "📝",
    }));

    const conceptCardItems: UnifiedMaterial[] = conceptCards.map(
      (card, index) => ({
        key: `concept-card-${card.id}`,
        id: card.id,
        type: "concept-card",
        title: getConceptCardTitle(card, index),
        description: getConceptCardDescription(card),
        createdAt: card.created_at,
        icon: "🧠",
      })
    );

    const quizItems: UnifiedMaterial[] = quizzes.map((quiz, index) => ({
      key: `quiz-${quiz.id}`,
      id: quiz.id,
      type: "quiz",
      title: getQuizTitle(quiz, index),
      description: "Open this quiz and test your understanding.",
      createdAt: quiz.created_at,
      icon: "❓",
    }));

    return [
      ...pdfItems,
      ...noteItems,
      ...conceptCardItems,
      ...quizItems,
    ].sort((first, second) => {
      const firstTime = first.createdAt
        ? new Date(first.createdAt).getTime()
        : 0;
      const secondTime = second.createdAt
        ? new Date(second.createdAt).getTime()
        : 0;

      return secondTime - firstTime;
    });
  }, [conceptCards, notes, pdfs, quizzes]);

  const visibleMaterials = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return materials.filter((material) => {
      const matchesFilter =
        filter === "all" || material.type === filter;

      const matchesSearch =
        !normalizedSearch ||
        material.title.toLowerCase().includes(normalizedSearch) ||
        material.description.toLowerCase().includes(normalizedSearch) ||
        filterLabel(material.type).toLowerCase().includes(normalizedSearch);

      return matchesFilter && matchesSearch;
    });
  }, [filter, materials, searchQuery]);

  const filters: {
    key: MaterialFilter;
    count: number;
  }[] = [
    {
      key: "all",
      count: materials.length,
    },
    {
      key: "pdf",
      count: pdfs.length,
    },
    {
      key: "note",
      count: notes.length,
    },
    {
      key: "concept-card",
      count: conceptCards.length,
    },
    {
      key: "quiz",
      count: quizzes.length,
    },
  ];

  const loading = loadingPdfs || loadingNotes || loadingPractice;

  function renderMaterialActions(material: UnifiedMaterial) {
    if (material.type === "pdf") {
      return (
        <>
          <button
            type="button"
            onClick={() => onSelectPdf(material.id, material.title)}
            className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-white transition hover:bg-white/[0.09]"
          >
            Select
          </button>

          <button
            type="button"
            onClick={() => onSummarizePdf(material.id)}
            className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-xs font-black text-yellow-100 transition hover:bg-yellow-300/20"
          >
            Summarize
          </button>

          <button
            type="button"
            onClick={onOpenAiTutor}
            className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/20"
          >
            Ask AI
          </button>

          <button
            type="button"
            onClick={() => onDeletePdf(material.id)}
            className="rounded-xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs font-black text-red-100 transition hover:bg-red-400/20"
          >
            Delete
          </button>
        </>
      );
    }

    if (material.type === "note") {
      return (
        <>
          <Link
            href={`/notes?room=${studyRoomId}&note=${material.id}`}
            className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-white transition hover:bg-white/[0.09]"
          >
            Open Note
          </Link>

          <button
            type="button"
            onClick={onOpenAiTutor}
            className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/20"
          >
            Ask AI
          </button>
        </>
      );
    }

    if (material.type === "concept-card") {
      return (
        <>
          <Link
            href={`/flashcards?room=${studyRoomId}`}
            className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-xs font-black text-yellow-100 transition hover:bg-yellow-300/20"
          >
            Practice
          </Link>

          <button
            type="button"
            onClick={onOpenAiTutor}
            className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/20"
          >
            Explain
          </button>
        </>
      );
    }

    return (
      <>
        <Link
          href={`/quizzes?room=${studyRoomId}`}
          className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-xs font-black text-yellow-100 transition hover:bg-yellow-300/20"
        >
          Start Quiz
        </Link>

        <button
          type="button"
          onClick={onOpenAiTutor}
          className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/20"
        >
          Ask AI
        </button>
      </>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">
              Room Materials
            </p>

            <h2 className="mt-2 text-2xl font-black text-white">
              Your room knowledge library
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              PDFs, notes, concept cards, and quizzes stay connected here.
              StudySnap can use them to support AI Tutor, practice, and progress.
            </p>

            {selectedPdfId ? (
              <div className="mt-4 rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-100">
                  Selected Material
                </p>

                <p className="mt-2 break-words text-sm font-black text-white">
                  📄 {selectedPdfTitle || "Selected PDF"}
                </p>

                <button
                  type="button"
                  onClick={onOpenAiTutor}
                  className="mt-3 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/20"
                >
                  Study with AI Tutor
                </button>
              </div>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:w-[440px]">
            <button
              type="button"
              onClick={onOpenAiTutor}
              className="rounded-2xl bg-yellow-300 px-4 py-3 text-sm font-black text-black transition hover:bg-yellow-200"
            >
              🤖 Ask AI Tutor
            </button>

            <Link
              href="/settings?tab=integrations"
              className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-center text-sm font-black text-white transition hover:bg-white/[0.09]"
            >
              ☁️ Import Google Drive
            </Link>

            <Link
              href={`/notes?room=${studyRoomId}`}
              className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-center text-sm font-black text-cyan-100 transition hover:bg-cyan-300/20"
            >
              📝 Create Note
            </Link>

            <Link
              href={`/flashcards?room=${studyRoomId}`}
              className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-center text-sm font-black text-emerald-100 transition hover:bg-emerald-300/20"
            >
              🧠 Concept Cards
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div>{renderUploader}</div>

        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-200">
                Materials Library
              </p>

              <h3 className="mt-1 text-xl font-black text-white">
                {materials.length} connected item
                {materials.length === 1 ? "" : "s"}
              </h3>
            </div>

            <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 lg:w-[320px]">
              <span>🔎</span>

              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search materials..."
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {filters.map((item) => {
              const active = item.key === filter;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={[
                    "rounded-xl border px-3 py-2 text-xs font-black transition",
                    active
                      ? "border-yellow-300/40 bg-yellow-300 text-black"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white",
                  ].join(" ")}
                >
                  {filterLabel(item.key)} ({item.count})
                </button>
              );
            })}
          </div>

          <div className="mt-5 space-y-3">
            {loading && !materials.length ? (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-center">
                <p className="text-sm font-bold text-slate-300">
                  Loading room materials...
                </p>
              </div>
            ) : visibleMaterials.length ? (
              visibleMaterials.map((material) => {
                const selected =
                  material.type === "pdf" &&
                  material.id === selectedPdfId;

                return (
                  <article
                    key={material.key}
                    className={[
                      "rounded-2xl border p-4 transition",
                      selected
                        ? "border-yellow-300/35 bg-yellow-300/10"
                        : "border-white/10 bg-black/25 hover:border-white/20 hover:bg-white/[0.04]",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-xl">
                          {material.icon}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="break-words text-sm font-black text-white">
                              {material.title}
                            </p>

                            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">
                              {filterLabel(material.type)}
                            </span>
                          </div>

                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">
                            {material.description}
                          </p>

                          <p className="mt-2 text-[11px] font-bold text-slate-500">
                            {formatDate(material.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {renderMaterialActions(material)}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-7 text-center">
                <div className="text-3xl">📚</div>

                <p className="mt-3 text-sm font-black text-white">
                  No matching materials
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Upload a PDF, create a note, or choose another filter.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-blue-300/15 bg-blue-400/10 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-100">
            PDFs
          </p>
          <p className="mt-2 text-3xl font-black text-white">{pdfs.length}</p>
        </div>

        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/10 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100">
            Notes
          </p>
          <p className="mt-2 text-3xl font-black text-white">{notes.length}</p>
        </div>

        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/10 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100">
            Concept Cards
          </p>
          <p className="mt-2 text-3xl font-black text-white">
            {conceptCards.length}
          </p>
        </div>

        <div className="rounded-2xl border border-purple-300/15 bg-purple-400/10 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-100">
            Quizzes
          </p>
          <p className="mt-2 text-3xl font-black text-white">
            {quizzes.length}
          </p>
        </div>
      </section>
    </div>
  );
}
