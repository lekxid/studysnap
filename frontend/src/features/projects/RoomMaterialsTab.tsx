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
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

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

  function renderPrimaryAction(material: UnifiedMaterial) {
    const buttonClass =
      "inline-flex min-w-[92px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-xs font-black text-white transition hover:border-yellow-300/30 hover:bg-yellow-300/10 hover:text-yellow-100";

    if (material.type === "pdf") {
      const selected = material.id === selectedPdfId;

      return (
        <button
          type="button"
          onClick={() => {
            onSelectPdf(material.id, material.title);
            setOpenMenuKey(null);
          }}
          className={[
            buttonClass,
            selected
              ? "border-yellow-300/40 bg-yellow-300/15 text-yellow-100"
              : "",
          ].join(" ")}
        >
          {selected ? "Selected" : "Select"}
        </button>
      );
    }

    if (material.type === "note") {
      return (
        <Link
          href={`/notes?room=${studyRoomId}&note=${material.id}`}
          className={buttonClass}
        >
          Open
        </Link>
      );
    }

    if (material.type === "concept-card") {
      return (
        <Link
          href={`/flashcards?room=${studyRoomId}`}
          className={buttonClass}
        >
          Practice
        </Link>
      );
    }

    return (
      <Link
        href={`/quizzes?room=${studyRoomId}`}
        className={buttonClass}
      >
        Start Quiz
      </Link>
    );
  }

  function renderMaterialMenu(material: UnifiedMaterial) {
    const menuItemClass =
      "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] hover:text-white";

    if (material.type === "pdf") {
      return (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenMenuKey(null);
              onSummarizePdf(material.id);
            }}
            className={menuItemClass}
          >
            <span aria-hidden="true">✨</span>
            Summarize
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenMenuKey(null);
              onSelectPdf(material.id, material.title);
              onOpenAiTutor();
            }}
            className={menuItemClass}
          >
            <span aria-hidden="true">🤖</span>
            Ask AI Tutor
          </button>

          <div className="my-1 border-t border-white/10" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpenMenuKey(null);
              onDeletePdf(material.id);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-red-200 transition hover:bg-red-400/10 hover:text-red-100"
          >
            <span aria-hidden="true">🗑️</span>
            Delete
          </button>
        </>
      );
    }

    return (
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setOpenMenuKey(null);
          onOpenAiTutor();
        }}
        className={menuItemClass}
      >
        <span aria-hidden="true">🤖</span>
        {material.type === "concept-card"
          ? "Explain with AI"
          : "Ask AI Tutor"}
      </button>
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

      <section className="min-w-0 space-y-5">
        <details className="group rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.05] p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl outline-none [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
                Add study material
              </p>

              <h3 className="mt-1 text-lg font-black text-white">
                Upload a PDF
              </h3>

              <p className="mt-1 text-xs leading-5 text-slate-400">
                Open when you are ready to add another study material.
              </p>
            </div>

            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>

          <div className="mt-4 border-t border-white/10 pt-4">
            {renderUploader}
          </div>
        </details>

        <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
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
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-xl">
                            {material.icon}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p
                              title={material.title}
                              className="line-clamp-2 break-words text-sm font-black leading-5 text-white"
                            >
                              {material.title}
                            </p>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                              <span className="uppercase tracking-[0.1em] text-slate-300">
                                {filterLabel(material.type)}
                              </span>

                              <span aria-hidden="true">•</span>

                              <span>{formatDate(material.createdAt)}</span>
                            </div>

                            <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-slate-400">
                              {material.description}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-end gap-2 border-t border-white/10 pt-3">
                          {renderPrimaryAction(material)}

                          <div className="relative">
                            <button
                              type="button"
                              aria-label={`More actions for ${material.title}`}
                              aria-haspopup="menu"
                              aria-expanded={openMenuKey === material.key}
                              onClick={() =>
                                setOpenMenuKey((current) =>
                                  current === material.key
                                    ? null
                                    : material.key
                                )
                              }
                              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-lg font-black text-slate-300 transition hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
                            >
                              <span aria-hidden="true">⋯</span>
                            </button>

                            {openMenuKey === material.key ? (
                              <div
                                role="menu"
                                className="absolute bottom-12 right-0 z-50 w-48 rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-2xl shadow-black/60"
                              >
                                {renderMaterialMenu(material)}
                              </div>
                            ) : null}
                          </div>
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
