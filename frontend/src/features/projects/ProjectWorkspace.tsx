"use client";

import {
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getBrainInsights,
  type BrainSource,
} from "@/lib/api";

export type RoomTab =
  | "overview"
  | "materials"
  | "notes"
  | "ai"
  | "practice"
  | "together"
  | "progress";

type ContinueItem = {
  id: string | number;
  title: string;
  subtitle: string;
  icon?: string;
  onOpen: () => void;
};

type SmartSuggestion = {
  title: string;
  text: string;
  tab: RoomTab;
  actionLabel: string;
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

  materialsCount: number;
  notesCount: number;
  conceptCardsCount: number;
  quizzesCount: number;
  progress: number;

  continueItems: ContinueItem[];
  smartSuggestion: SmartSuggestion;

  searchQuery: string;
  searchResults: BrainSource[];
  searchLoading: boolean;
  searchError: string;

  activeTab: RoomTab;
  onChangeTab: (tab: RoomTab) => void;

  onBack: () => void;
  onSearch: (query: string) => void;
  onOpenSearchResult: (
    result: BrainSource
  ) => void;

  children?: ReactNode;
};

const roomTabs: {
  key: RoomTab;
  title: string;
  icon: string;
}[] = [
  {
    key: "overview",
    title: "Overview",
    icon: "⌂",
  },
  {
    key: "materials",
    title: "Materials",
    icon: "▦",
  },
  {
    key: "notes",
    title: "Notes",
    icon: "▣",
  },
  {
    key: "ai",
    title: "AI Tutor",
    icon: "S",
  },
  {
    key: "practice",
    title: "Practice",
    icon: "◉",
  },
  {
    key: "together",
    title: "Together",
    icon: "◎",
  },
  {
    key: "progress",
    title: "Progress",
    icon: "↗",
  },
];

function getSourceLabel(
  sourceType: string,
) {
  if (sourceType === "pdf_chunk") {
    return "PDF";
  }

  if (sourceType === "note_chunk") {
    return "Note";
  }

  if (sourceType === "flashcard") {
    return "Concept Card";
  }

  if (sourceType === "brain_memory") {
    return "Memory";
  }

  return sourceType.replaceAll("_", " ");
}

function formatScore(
  score: number | undefined,
) {
  if (typeof score !== "number") {
    return "—";
  }

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

        const query = String(
          formData.get("projectSearch") || "",
        ).trim();

        if (!query) {
          return;
        }

        onSearch(query);
        form.reset();
      }}
      className="flex min-w-0 items-center gap-2 rounded-[1rem] border border-white/[0.085] bg-[#05080b]/90 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] focus-within:border-[#b7a35f]/30"
    >
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm text-slate-500"
      >
        ⌕
      </span>

      <input
        name="projectSearch"
        placeholder="Search this room"
        aria-label="Search this room"
        className="min-w-0 flex-1 bg-transparent py-2 text-sm font-medium text-white outline-none placeholder:text-slate-600"
      />

      <button
        type="submit"
        disabled={loading}
        className="h-9 shrink-0 rounded-xl border border-[#b7a35f]/25 bg-[#b7a35f]/[0.09] px-3 text-xs font-black text-[#d7cb95] transition hover:bg-[#b7a35f]/[0.15] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "…" : "Search"}
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
  onOpenResult: (
    result: BrainSource
  ) => void;
}) {
  if (
    !query &&
    !loading &&
    !error
  ) {
    return null;
  }

  return (
    <section className="rounded-[1.35rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(15,20,25,0.95),rgba(4,7,9,0.98))] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#a99b68]">
            Room search
          </p>

          <h3 className="mt-1 truncate text-base font-black text-white">
            {query
              ? `Results for “${query}”`
              : "Searching room"}
          </h3>
        </div>

        <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-black text-slate-400">
          {loading
            ? "Loading"
            : `${results.length} found`}
        </span>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-400/15 bg-red-500/[0.06] px-3 py-2.5 text-xs text-red-100">
          {error}
        </div>
      ) : null}

      {!loading &&
      !error &&
      query &&
      results.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-slate-400">
          No matching material was found.
          Try another phrase.
        </p>
      ) : null}

      {results.length ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {results.map(
            (result, index) => (
              <button
                key={`${result.source_type}-${String(
                  result.source_id,
                )}-${index}`}
                type="button"
                onClick={() =>
                  onOpenResult(result)
                }
                className="rounded-xl border border-white/[0.075] bg-white/[0.025] p-3 text-left transition hover:border-white/[0.14] hover:bg-white/[0.055]"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-300">
                    {getSourceLabel(
                      result.source_type,
                    )}
                  </span>

                  <span className="text-[10px] font-bold text-[#b7a35f]">
                    {formatScore(
                      result.score,
                    )}
                  </span>
                </div>

                <p className="mt-2 line-clamp-1 text-sm font-black text-white">
                  {result.title}
                </p>

                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
                  {result.text}
                </p>

                <p className="mt-2 text-[10px] font-black text-slate-300">
                  Open result →
                </p>
              </button>
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: (typeof roomTabs)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={
        active ? "page" : undefined
      }
      className={`group relative flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition active:scale-[0.98] ${
        active
          ? "border-[#b7a35f]/32 bg-[#b7a35f]/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]"
          : "border-white/[0.075] bg-white/[0.025] text-slate-400 hover:border-white/[0.13] hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid h-6 w-7 place-items-center text-sm font-black ${
          active
            ? "text-[#d8cc98]"
            : "text-slate-500 group-hover:text-slate-300"
        }`}
      >
        {tab.icon}
      </span>

      <span className="w-full truncate text-[9px] font-black">
        {tab.title}
      </span>

      {active ? (
        <span className="absolute bottom-0 h-0.5 w-5 rounded-full bg-[#9d8b55]" />
      ) : null}
    </button>
  );
}

function CompactStat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-base font-black text-white">
        {value}
      </p>
    </div>
  );
}

export default function ProjectWorkspace({
  studyRoomId,
  title,
  subject,
  description,
  materialsCount,
  notesCount,
  conceptCardsCount,
  quizzesCount,
  progress,
  continueItems,
  smartSuggestion,
  searchQuery,
  searchResults,
  searchLoading,
  searchError,
  activeTab,
  onChangeTab,
  onBack,
  onSearch,
  onOpenSearchResult,
  children,
}: Props) {
  const [
    brainInsights,
    setBrainInsights,
  ] = useState<BrainInsights | null>(
    null,
  );

  const [
    brainLoading,
    setBrainLoading,
  ] = useState(false);

  const safeProgress = Math.max(
    0,
    Math.min(
      100,
      progress,
    ),
  );

  useEffect(() => {
    let mounted = true;

    async function loadBrainInsights() {
      try {
        setBrainLoading(true);

        const data =
          await getBrainInsights(
            studyRoomId,
          );

        if (mounted) {
          setBrainInsights(
            data as BrainInsights,
          );
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

    void loadBrainInsights();

    return () => {
      mounted = false;
    };
  }, [studyRoomId]);

  const weakConcepts = useMemo(
    () =>
      brainInsights?.weak_concepts?.slice(
        0,
        2,
      ) || [],
    [brainInsights],
  );

  const masteryPercent = Math.round(
    (
      brainInsights?.average_mastery ||
      0
    ) * 100,
  );

  const primaryContinueItem =
    continueItems[0];

  const practiceCount =
    conceptCardsCount + quizzesCount;

  return (
    <div className="min-w-0 max-w-full space-y-3 pb-4 sm:space-y-4">
      <section className="relative overflow-hidden rounded-[1.45rem] border border-white/[0.085] bg-[radial-gradient(circle_at_top_right,rgba(183,163,95,0.075),transparent_30%),linear-gradient(145deg,rgba(16,21,26,0.97),rgba(3,6,8,0.995))] p-4 shadow-[0_22px_65px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.055)] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-[10px] font-black text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
            >
              ← Rooms
            </button>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#b7a35f]/20 bg-[#b7a35f]/[0.07] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[#cbbd80]">
                Study room
              </span>

              <span className="max-w-full truncate rounded-full border border-white/[0.075] bg-white/[0.03] px-2.5 py-1 text-[9px] font-black text-slate-400">
                {subject}
              </span>
            </div>

            <h1 className="mt-2 break-words text-[1.55rem] font-black leading-tight tracking-[-0.025em] text-white sm:text-3xl">
              {title}
            </h1>

            {description ? (
              <p className="mt-1.5 hidden max-w-3xl text-sm leading-6 text-slate-400 sm:block">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() =>
              onChangeTab("ai")
            }
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[0.95rem] border border-[#b7a35f]/25 bg-[#b7a35f]/[0.08] text-base font-black text-[#d7cb94] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:bg-[#b7a35f]/[0.14]"
            aria-label="Open AI Tutor"
            title="Open AI Tutor"
          >
            S
          </button>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <CompactStat
            label="Progress"
            value={`${safeProgress}%`}
          />

          <CompactStat
            label="Materials"
            value={materialsCount}
          />

          <CompactStat
            label="Notes"
            value={notesCount}
          />

          <CompactStat
            label="Practice"
            value={practiceCount}
          />
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full bg-[#91824f] transition-[width]"
            style={{
              width: `${safeProgress}%`,
            }}
          />
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(14,18,22,0.94),rgba(3,6,8,0.98))] p-3 shadow-[0_18px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.045)]">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-sm font-black text-white">
              Room workspace
            </p>

            <p className="mt-0.5 text-[10px] text-slate-500">
              Search and switch tools
            </p>
          </div>

          <span className="grid h-8 w-8 place-items-center rounded-xl border border-white/[0.075] bg-white/[0.03] text-xs font-black text-[#c9bc82]">
            S
          </span>
        </div>

        <div className="mt-3">
          <ProjectSearchBox
            loading={searchLoading}
            onSearch={onSearch}
          />
        </div>

        <div className="mt-2.5 grid grid-cols-4 gap-1.5 sm:grid-cols-7 sm:gap-2">
          {roomTabs.map((tab) => (
            <TabButton
              key={tab.key}
              tab={tab}
              active={
                tab.key === activeTab
              }
              onClick={() =>
                onChangeTab(tab.key)
              }
            />
          ))}
        </div>
      </section>

      <ProjectSearchResults
        query={searchQuery}
        results={searchResults}
        loading={searchLoading}
        error={searchError}
        onOpenResult={
          onOpenSearchResult
        }
      />

      {activeTab === "overview" ? (
        <section className="rounded-[1.25rem] border border-white/[0.075] bg-white/[0.022] p-3 xl:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#a99b68]">
                Recommended next
              </p>

              <p className="mt-1 line-clamp-1 text-sm font-black text-white">
                {primaryContinueItem
                  ? primaryContinueItem.title
                  : smartSuggestion.title}
              </p>

              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
                {primaryContinueItem
                  ? primaryContinueItem.subtitle
                  : smartSuggestion.text}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (
                  primaryContinueItem
                ) {
                  primaryContinueItem.onOpen();
                  return;
                }

                onChangeTab(
                  smartSuggestion.tab,
                );
              }}
              className="shrink-0 rounded-xl border border-[#b7a35f]/22 bg-[#b7a35f]/[0.075] px-3 py-2 text-[10px] font-black text-[#d7cb94]"
            >
              Open →
            </button>
          </div>
        </section>
      ) : null}

      <section
        className={`grid min-w-0 gap-4 ${
          activeTab === "overview"
            ? "xl:grid-cols-[minmax(0,1fr)_300px]"
            : "grid-cols-1"
        }`}
      >
        <div className="min-w-0">
          <section className="min-w-0 max-w-full overflow-hidden rounded-[1.35rem] border border-white/[0.075] bg-[linear-gradient(145deg,rgba(11,15,19,0.95),rgba(3,6,8,0.99))] p-3 shadow-[0_18px_55px_rgba(0,0,0,0.24)] sm:p-4">
            {children}
          </section>
        </div>

        {activeTab === "overview" ? (
          <aside className="hidden space-y-3 xl:block">
            <section className="rounded-[1.25rem] border border-white/[0.075] bg-white/[0.025] p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.17em] text-[#a99b68]">
                Next step
              </p>

              <h3 className="mt-1.5 text-base font-black text-white">
                {primaryContinueItem
                  ? primaryContinueItem.title
                  : smartSuggestion.title}
              </h3>

              <p className="mt-1.5 text-xs leading-5 text-slate-400">
                {primaryContinueItem
                  ? primaryContinueItem.subtitle
                  : smartSuggestion.text}
              </p>

              <button
                type="button"
                onClick={() => {
                  if (
                    primaryContinueItem
                  ) {
                    primaryContinueItem.onOpen();
                    return;
                  }

                  onChangeTab(
                    smartSuggestion.tab,
                  );
                }}
                className="mt-3 w-full rounded-xl border border-[#b7a35f]/22 bg-[#b7a35f]/[0.075] px-3 py-2.5 text-xs font-black text-[#d7cb94] transition hover:bg-[#b7a35f]/[0.13]"
              >
                {primaryContinueItem
                  ? "Continue learning"
                  : smartSuggestion.actionLabel}{" "}
                →
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangeTab(
                    smartSuggestion.tab,
                  )
                }
                className="mt-2 w-full rounded-xl border border-white/[0.075] bg-white/[0.025] px-3 py-2.5 text-xs font-black text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                {smartSuggestion.title}
              </button>
            </section>

            <section className="rounded-[1.25rem] border border-white/[0.075] bg-white/[0.025] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.17em] text-slate-500">
                    AI learning snapshot
                  </p>

                  <p className="mt-1 text-sm font-black text-white">
                    Room knowledge
                  </p>
                </div>

                <span className="rounded-full border border-white/[0.075] bg-white/[0.035] px-2.5 py-1 text-[10px] font-black text-slate-300">
                  {brainLoading
                    ? "…"
                    : `${masteryPercent}%`}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <CompactStat
                  label="Review"
                  value={
                    brainInsights?.weak_count ||
                    0
                  }
                />

                <CompactStat
                  label="Learning"
                  value={
                    brainInsights?.developing_count ||
                    0
                  }
                />

                <CompactStat
                  label="Strong"
                  value={
                    brainInsights?.mastered_count ||
                    0
                  }
                />
              </div>

              {weakConcepts.length ? (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
                    Review next
                  </p>

                  {weakConcepts.map(
                    (concept) => (
                      <button
                        key={
                          concept.concept_id
                        }
                        type="button"
                        onClick={() =>
                          onChangeTab(
                            "practice",
                          )
                        }
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.065] bg-white/[0.022] px-3 py-2 text-left"
                      >
                        <span className="line-clamp-1 text-[11px] font-bold text-slate-300">
                          {
                            concept.concept_name
                          }
                        </span>

                        <span className="text-[9px] font-black text-slate-500">
                          {Math.round(
                            concept.mastery_score *
                              100,
                          )}
                          %
                        </span>
                      </button>
                    ),
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Practice activity will build
                  your room learning snapshot.
                </p>
              )}
            </section>
          </aside>
        ) : null}
      </section>
    </div>
  );
}
