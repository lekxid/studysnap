"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { getBrainInsights, type BrainSource } from "@/lib/api";

type ContinueItem = {
  id: number;
  title: string;
  subtitle: string;
  icon?: string;
  onOpen: () => void;
};

type Action = {
  title: string;
  description: string;
  icon: string;
  href?: string;
  onClick?: () => void;
};

type BrainConcept = {
  concept_id: string;
  concept_name: string;
  mastery_score: number;
  strength: string;
  needs_review: boolean;
};

type BrainInsights = {
  average_mastery?: number;
  mastered_count?: number;
  developing_count?: number;
  weak_count?: number;
  needs_review_count?: number;
  mastered_concepts?: BrainConcept[];
  developing_concepts?: BrainConcept[];
  weak_concepts?: BrainConcept[];
  review_queue?: BrainConcept[];
};

type Props = {
  studyRoomId: number;
  title: string;
  subject: string;
  description?: string | null;

  pdfCount: number;
  progress: number;

  continueItems: ContinueItem[];
  quickActions: Action[];

  searchQuery: string;
  searchResults: BrainSource[];
  searchLoading: boolean;
  searchError: string;

  onBack: () => void;
  onAskAI: () => void;
  onUploadPDF: () => void;
  onSearch: (query: string) => void;
  onOpenSearchResult: (result: BrainSource) => void;
  onViewAll: () => void;

  activeTool: "ai" | "pdf";
  onOpenNotes: () => void;
  onOpenFlashcards: () => void;
  onOpenQuizzes: () => void;
  onOpenPlanner: () => void;

  children?: ReactNode;
};

const workspaceTools = [
  {
    key: "ai",
    title: "Project AI",
    description: "Ask this room",
    icon: "🤖",
  },
  {
    key: "pdf",
    title: "Materials",
    description: "Upload + summarize",
    icon: "📄",
  },
  {
    key: "notes",
    title: "Notes",
    description: "Write and save",
    icon: "📝",
  },
  {
    key: "flashcards",
    title: "Concept Cards",
    description: "Review key ideas",
    icon: "🧠",
  },
  {
    key: "quizzes",
    title: "Quizzes",
    description: "Test yourself",
    icon: "🧾",
  },
  {
    key: "planner",
    title: "Planner",
    description: "Plan study",
    icon: "📅",
  },
] as const;

function getSourceLabel(sourceType: string) {
  if (sourceType === "pdf_chunk") return "PDF";
  if (sourceType === "note_chunk") return "Note";
  if (sourceType === "flashcard") return "Concept Card";
  if (sourceType === "brain_memory") return "Memory";

  return sourceType.replaceAll("_", " ");
}

function formatScore(score: number | undefined) {
  if (typeof score !== "number") return "—";
  return `${Math.round(score * 100)}%`;
}

function ProjectSearchBox({
  loading,
  onSearch,
}: {
  loading: boolean;
  onSearch: (query: string) => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();

        const form = event.currentTarget;
        const formData = new FormData(form);
        const query = String(formData.get("projectSearch") || "").trim();

        if (!query) return;

        onSearch(query);
        form.reset();
      }}
      className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-black/35 px-4 py-3"
    >
      <span className="text-lg">🔎</span>

      <input
        name="projectSearch"
        placeholder="Search this room’s PDFs, notes, concept cards, quizzes, and memory..."
        className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
      />

      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-yellow-300 px-4 py-2 text-xs font-black text-black transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "..." : "Search"}
      </button>
    </form>
  );
}

function ProjectSearchResults({
  query,
  results,
  loading,
  error,
  onOpenResult,
}: {
  query: string;
  results: BrainSource[];
  loading: boolean;
  error: string;
  onOpenResult: (result: BrainSource) => void;
}) {
  if (!query && !loading && !error) return null;

  return (
    <section className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
            Project Search
          </p>
          <h3 className="mt-1 text-lg font-black text-white">
            {query ? `Results for “${query}”` : "Searching project..."}
          </h3>
        </div>

        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-bold text-slate-300">
          {loading ? "Loading..." : `${results.length} found`}
        </span>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {!loading && !error && query && results.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          No matching project materials found yet.
        </p>
      ) : null}

      {results.length ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {results.map((result, index) => (
            <button
              key={`${result.source_type}-${String(result.source_id)}-${index}`}
              type="button"
              onClick={() => onOpenResult(result)}
              className="rounded-[1.2rem] border border-white/10 bg-black/30 p-4 text-left transition hover:border-cyan-300/35 hover:bg-cyan-300/10"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
                  {getSourceLabel(result.source_type)}
                </span>

                <span className="rounded-full bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-100">
                  {formatScore(result.score)}
                </span>
              </div>

              <h4 className="line-clamp-2 text-sm font-black leading-6 text-white">
                {result.title}
              </h4>

              <p className="mt-2 line-clamp-3 text-sm leading-7 text-slate-300">
                {result.text}
              </p>

              <p className="mt-3 text-xs font-bold text-cyan-100">
                Open result →
              </p>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ToolButton({
  tool,
  active,
  onClick,
}: {
  tool: (typeof workspaceTools)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[1.25rem] border p-4 text-left transition hover:-translate-y-0.5 ${
        active
          ? "border-yellow-300/50 bg-yellow-300/15 shadow-[0_0_28px_rgba(250,204,21,0.12)]"
          : "border-white/10 bg-black/30 hover:border-yellow-300/35 hover:bg-yellow-300/10"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xl">{tool.icon}</span>

        {active ? (
          <span className="rounded-full bg-yellow-300 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-black">
            Open
          </span>
        ) : null}
      </div>

      <p className="mt-4 text-sm font-black text-white">{tool.title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">
        {tool.description}
      </p>
    </button>
  );
}

export default function ProjectWorkspace({
  studyRoomId,
  title,
  subject,
  description,
  pdfCount,
  progress,
  continueItems,
  quickActions,
  searchQuery,
  searchResults,
  searchLoading,
  searchError,
  onBack,
  onAskAI,
  onUploadPDF,
  onSearch,
  onOpenSearchResult,
  onViewAll,
  activeTool,
  onOpenNotes,
  onOpenFlashcards,
  onOpenQuizzes,
  onOpenPlanner,
  children,
}: Props) {
  const [brainInsights, setBrainInsights] = useState<BrainInsights | null>(null);
  const [brainLoading, setBrainLoading] = useState(false);

  const safeProgress = Math.max(0, Math.min(100, progress));
  const activeLabel = activeTool === "ai" ? "Project AI" : "Room Materials";

  useEffect(() => {
    let mounted = true;

    async function loadBrainInsights() {
      try {
        setBrainLoading(true);
        const data = await getBrainInsights(studyRoomId);

        if (mounted) {
          setBrainInsights(data as BrainInsights);
        }
      } catch {
        if (mounted) {
          setBrainInsights(null);
        }
      } finally {
        if (mounted) {
          setBrainLoading(false);
        }
      }
    }

    loadBrainInsights();

    return () => {
      mounted = false;
    };
  }, [studyRoomId]);

  const weakConcepts = useMemo(() => {
    return brainInsights?.weak_concepts?.slice(0, 3) || [];
  }, [brainInsights]);

  const strongConcepts = useMemo(() => {
    return brainInsights?.mastered_concepts?.slice(0, 3) || [];
  }, [brainInsights]);

  const reviewQueue = useMemo(() => {
    return brainInsights?.review_queue?.slice(0, 3) || [];
  }, [brainInsights]);

  const masteryPercent = Math.round((brainInsights?.average_mastery || 0) * 100);

  function openTool(key: string) {
    if (key === "ai") onAskAI();
    if (key === "pdf") onUploadPDF();
    if (key === "notes") onOpenNotes();
    if (key === "flashcards") onOpenFlashcards();
    if (key === "quizzes") onOpenQuizzes();
    if (key === "planner") onOpenPlanner();
  }

  const dailyAction =
    continueItems.length > 0
      ? "Continue one saved material, then test yourself with a short quiz."
      : "Start by adding a PDF or creating a note so StudySnap can build this project memory.";

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[1.7rem] border border-yellow-300/20 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.13),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                className="rounded-xl border border-yellow-300/30 bg-yellow-300/10 px-3 py-2 text-xs font-black text-yellow-100 transition hover:bg-yellow-300/20"
              >
                ← Projects
              </button>

              <span className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-yellow-100">
                AI Project Room
              </span>

              <span className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-slate-300">
                {subject}
              </span>
            </div>

            <h1 className="max-w-5xl text-4xl font-black leading-tight tracking-tight text-white">
              {title}
            </h1>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
              {description ||
                "Your PDFs, notes, concept cards, quizzes, planner, AI, search, and StudySnap Brain work together inside this project."}
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onAskAI}
                className="rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-black transition hover:bg-yellow-200"
              >
                🤖 Ask Project AI
              </button>

              <button
                type="button"
                onClick={onUploadPDF}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-black text-white transition hover:bg-white/[0.08]"
              >
                📚 Add Materials
              </button>

              <Link
                href={`/quizzes?roomId=${studyRoomId}`}
                className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-3 text-center text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15"
              >
                🧾 Take Quiz
              </Link>
            </div>
          </div>

          <aside className="grid gap-3 sm:grid-cols-3 xl:w-[430px] xl:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Project Progress
              </p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <p className="text-3xl font-black text-white">{safeProgress}%</p>
                <p className="text-xs font-bold text-yellow-100">Live</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-yellow-300"
                  style={{ width: `${safeProgress}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Materials
              </p>
              <p className="mt-3 text-3xl font-black text-white">{pdfCount}</p>
              <p className="mt-1 text-xs text-slate-400">materials connected</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Smart Action
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                {dailyAction}
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-200">
                  Workspace Tools
                </p>
                <h2 className="mt-1 text-xl font-black text-white">
                  Everything connected in this project
                </h2>
              </div>

              <ProjectSearchBox loading={searchLoading} onSearch={onSearch} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {workspaceTools.map((tool) => (
                <ToolButton
                  key={tool.key}
                  tool={tool}
                  active={tool.key === activeTool}
                  onClick={() => openTool(tool.key)}
                />
              ))}
            </div>
          </section>

          <ProjectSearchResults
            query={searchQuery}
            results={searchResults}
            loading={searchLoading}
            error={searchError}
            onOpenResult={onOpenSearchResult}
          />

          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-200">
                  Active Workspace
                </p>
                <h2 className="mt-1 text-2xl font-black text-white">
                  {activeLabel}
                </h2>
              </div>

              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-black text-cyan-100">
                Focused on room #{studyRoomId}
              </span>
            </div>

            {children}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-200">
              Continue Learning
            </p>
            <h3 className="mt-1 text-xl font-black text-white">
              Pick up where you stopped
            </h3>

            <div className="mt-5 space-y-3">
              {continueItems.length ? (
                continueItems.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.onOpen}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-left transition hover:border-yellow-300/35 hover:bg-yellow-300/10"
                  >
                    <p className="line-clamp-2 break-all text-sm font-black text-white">
                      {item.icon || "📘"} {item.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {item.subtitle}
                    </p>
                  </button>
                ))
              ) : (
                <p className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-slate-400">
                  Nothing to continue yet.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onViewAll}
              className="mt-4 w-full rounded-2xl border border-yellow-300/25 bg-yellow-300/10 px-4 py-3 text-sm font-black text-yellow-100 transition hover:bg-yellow-300/20"
            >
              View all materials →
            </button>
          </section>

          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-200">
                  Project Brain
                </p>
                <h3 className="mt-1 text-xl font-black text-white">
                  Learning intelligence
                </h3>
              </div>

              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
                {brainLoading ? "Loading" : `${masteryPercent}% mastery`}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-red-300/15 bg-red-400/10 p-3 text-center">
                <p className="text-xl font-black text-white">
                  {brainInsights?.weak_count || 0}
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-red-100">
                  Weak
                </p>
              </div>

              <div className="rounded-xl border border-yellow-300/15 bg-yellow-400/10 p-3 text-center">
                <p className="text-xl font-black text-white">
                  {brainInsights?.developing_count || 0}
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-yellow-100">
                  Building
                </p>
              </div>

              <div className="rounded-xl border border-emerald-300/15 bg-emerald-400/10 p-3 text-center">
                <p className="text-xl font-black text-white">
                  {brainInsights?.mastered_count || 0}
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-100">
                  Strong
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-red-300/15 bg-red-400/10 p-4">
                <p className="text-sm font-black text-red-100">
                  Weak concepts
                </p>

                <div className="mt-3 space-y-2">
                  {weakConcepts.length ? (
                    weakConcepts.map((concept) => (
                      <div
                        key={concept.concept_id}
                        className="rounded-xl border border-white/10 bg-black/25 px-3 py-2"
                      >
                        <p className="line-clamp-2 text-xs font-bold text-white">
                          {concept.concept_name}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {Math.round(concept.mastery_score * 100)}% mastery · review needed
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs leading-5 text-slate-300">
                      No weak concepts yet. Take a quiz or review concept cards.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/10 p-4">
                <p className="text-sm font-black text-emerald-100">
                  Strong concepts
                </p>

                <div className="mt-3 space-y-2">
                  {strongConcepts.length ? (
                    strongConcepts.map((concept) => (
                      <div
                        key={concept.concept_id}
                        className="rounded-xl border border-white/10 bg-black/25 px-3 py-2"
                      >
                        <p className="line-clamp-2 text-xs font-bold text-white">
                          {concept.concept_name}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {Math.round(concept.mastery_score * 100)}% mastery
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs leading-5 text-slate-300">
                      Correct quiz answers will appear here as strengths.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/10 p-4">
                <p className="text-sm font-black text-cyan-100">
                  Review queue
                </p>

                <div className="mt-3 space-y-2">
                  {reviewQueue.length ? (
                    reviewQueue.map((concept) => (
                      <div
                        key={concept.concept_id}
                        className="rounded-xl border border-white/10 bg-black/25 px-3 py-2"
                      >
                        <p className="line-clamp-2 text-xs font-bold text-white">
                          {concept.concept_name}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs leading-5 text-slate-300">
                      Your next review items will appear after more practice.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-yellow-300/20 bg-yellow-300/10 p-5">
            <p className="text-lg font-black text-white">
              🏆 Connected study system
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              PDFs, notes, concept cards, quizzes, planner, search, and AI are tied to this room.
            </p>
          </section>
        </aside>
      </section>
    </div>
  );
}
