import { ReactNode } from "react";

import ContinueLearning from "./ContinueLearning";
import ProjectBrain from "./ProjectBrain";
import ProjectHero from "./ProjectHero";
import ProjectProgress from "./ProjectProgress";
import ProjectQuickActions from "./ProjectQuickActions";
import ProjectSearch from "./ProjectSearch";
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

function WorkspaceSnapshot({
  pdfCount,
  progress,
  onAskAI,
  onUploadPDF,
}: {
  pdfCount: number;
  progress: number;
  onAskAI: () => void;
  onUploadPDF: () => void;
}) {
  const cards = [
    {
      title: "Connected Materials",
      value: String(pdfCount),
      label: "PDFs inside this project",
      icon: "📚",
    },
    {
      title: "Learning Progress",
      value: `${progress}%`,
      label: "Current project readiness",
      icon: "📈",
    },
    {
      title: "Weak Concepts",
      value: "Soon",
      label: "Brain will detect review topics",
      icon: "🎯",
    },
    {
      title: "AI Tutor",
      value: "Ready",
      label: "Project-aware help is available",
      icon: "🤖",
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-[1.4rem] border border-white/10 bg-slate-950/70 p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-bold text-slate-400">{card.title}</p>
            <span className="text-2xl">{card.icon}</span>
          </div>

          <p className="mt-4 text-3xl font-black text-white">{card.value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{card.label}</p>
        </div>
      ))}

      <div className="rounded-[1.4rem] border border-yellow-400/20 bg-yellow-400/10 p-5 sm:col-span-2 xl:col-span-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-100">
              Recommended Flow
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              Search your project first, open the matching PDF/note/flashcard, then ask Project AI to explain or quiz you.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onAskAI}
              className="rounded-2xl border border-yellow-400/30 bg-yellow-400/15 px-4 py-3 text-sm font-black text-yellow-100 transition hover:bg-yellow-400/25"
            >
              Ask AI
            </button>

            <button
              type="button"
              onClick={onUploadPDF}
              className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-black text-white transition hover:bg-white/[0.08]"
            >
              Open PDFs
            </button>
          </div>
        </div>
      </div>
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

      <WorkspaceSnapshot
        pdfCount={pdfCount}
        progress={progress}
        onAskAI={onAskAI}
        onUploadPDF={onUploadPDF}
      />

      <ProjectSearch onSearch={onSearch} />

      <ProjectSearchResults
        query={searchQuery}
        results={searchResults}
        loading={searchLoading}
        error={searchError}
        onOpenResult={onOpenSearchResult}
      />

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        <ContinueLearning items={continueItems} onViewAll={onViewAll} />

        <ProjectProgress percent={progress} pdfCount={pdfCount} />
      </div>

      <ProjectQuickActions actions={quickActions} />

      <ProjectBrain studyRoomId={studyRoomId} projectTitle={title} />

      {children}
    </div>
  );
}
