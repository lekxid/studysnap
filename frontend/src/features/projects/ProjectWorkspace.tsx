import { ReactNode } from "react";

import ProjectBrain from "./ProjectBrain";
import ProjectDashboardOverview from "./ProjectDashboardOverview";
import ProjectHero from "./ProjectHero";
import ProjectSearch from "./ProjectSearch";
import ProjectToolTabs from "./ProjectToolTabs";
import type { BrainSource } from "@/lib/api";

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

function getSourceLabel(sourceType: string) {
  if (sourceType === "pdf_chunk") return "PDF";
  if (sourceType === "note_chunk") return "Note";
  if (sourceType === "flashcard") return "Flashcard";
  if (sourceType === "brain_memory") return "Memory";

  return sourceType.replaceAll("_", " ");
}

function formatScore(score: number | undefined) {
  if (typeof score !== "number") return "—";
  return `${Math.round(score * 100)}%`;
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
    <section className="rounded-[1.7rem] border border-cyan-300/15 bg-black/25 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">
            Project Search
          </p>
          <h3 className="mt-2 text-xl font-black text-white">
            {query ? `Results for “${query}”` : "Searching..."}
          </h3>
        </div>

        <p className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-300">
          {loading ? "Loading..." : `${results.length} found`}
        </p>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {!loading && !error && query && results.length === 0 ? (
        <p className="mt-4 text-sm leading-7 text-slate-400">
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
              className="rounded-[1.3rem] border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-cyan-300/30 hover:bg-cyan-300/10"
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
  return (
    <div className="space-y-6">
      <ProjectHero
        title={title}
        subject={subject}
        description={description}
        pdfCount={pdfCount}
        onBack={onBack}
        onAskAI={onAskAI}
        onUploadPDF={onUploadPDF}
      />

      <ProjectDashboardOverview
        pdfCount={pdfCount}
        progress={progress}
        continueItems={continueItems}
        quickActions={quickActions}
        onAskAI={onAskAI}
        onUploadPDF={onUploadPDF}
        onViewAll={onViewAll}
      />

      <ProjectToolTabs
        activeTool={activeTool}
        onOpenAI={onAskAI}
        onOpenPDF={onUploadPDF}
        onOpenNotes={onOpenNotes}
        onOpenFlashcards={onOpenFlashcards}
        onOpenQuizzes={onOpenQuizzes}
        onOpenPlanner={onOpenPlanner}
      />

      <ProjectSearch onSearch={onSearch} />

      <ProjectSearchResults
        query={searchQuery}
        results={searchResults}
        loading={searchLoading}
        error={searchError}
        onOpenResult={onOpenSearchResult}
      />

      <ProjectBrain studyRoomId={studyRoomId} projectTitle={title} />

      {children}
    </div>
  );
}
