"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { universalSearch, type UniversalSearchResult } from "@/lib/api";

type CommandItem = {
  kind: "command";
  label: string;
  description: string;
  href: string;
  icon: string;
  keywords: string[];
};

type SearchItem = UniversalSearchResult & {
  kind: "search";
};

type CommandBarItem = CommandItem | SearchItem;

const commands: CommandItem[] = [
  {
    kind: "command",
    label: "Open Projects",
    description: "Go to your project workspace dashboard",
    href: "/study-rooms",
    icon: "📁",
    keywords: ["projects", "study rooms", "rooms", "workspace"],
  },
  {
    kind: "command",
    label: "Open AI Tutor",
    description: "Ask StudySnap AI a study question",
    href: "/ai-tutor",
    icon: "✦",
    keywords: ["ai", "tutor", "chat", "ask"],
  },
  {
    kind: "command",
    label: "Open Notes",
    description: "Create, search, and study notes",
    href: "/notes",
    icon: "▣",
    keywords: ["notes", "write", "summaries"],
  },
  {
    kind: "command",
    label: "Open Flashcards",
    description: "Review and create flashcards",
    href: "/flashcards",
    icon: "◫",
    keywords: ["flashcards", "cards", "review"],
  },
  {
    kind: "command",
    label: "Open Quizzes",
    description: "Practice with quizzes",
    href: "/quizzes",
    icon: "✎",
    keywords: ["quiz", "quizzes", "test", "practice"],
  },
  {
    kind: "command",
    label: "Open Planner",
    description: "Plan study sessions and tasks",
    href: "/planner",
    icon: "◷",
    keywords: ["planner", "calendar", "tasks", "schedule"],
  },
];

const searchIcons: Record<UniversalSearchResult["type"], string> = {
  project: "📁",
  note: "📝",
  pdf: "📄",
  flashcard: "🧠",
};

export default function CommandBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [liveResults, setLiveResults] = useState<UniversalSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const filteredCommands = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) {
      return commands;
    }

    return commands.filter((command) => {
      const haystack = [
        command.label,
        command.description,
        command.href,
        ...command.keywords,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [query]);

  useEffect(() => {
    const search = query.trim();

    if (search.length < 2) {
      setLiveResults([]);
      setSearching(false);
      setSearchError("");
      return;
    }

    let cancelled = false;

    setSearching(true);
    setSearchError("");

    const timer = window.setTimeout(async () => {
      try {
        const data = await universalSearch(search, 8);

        if (!cancelled) {
          setLiveResults(data.results || []);
        }
      } catch (error) {
        if (!cancelled) {
          setLiveResults([]);
          setSearchError(
            error instanceof Error ? error.message : "Search failed",
          );
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const displayItems: CommandBarItem[] = useMemo(() => {
    const searchResults: SearchItem[] = liveResults.map((result) => ({
      ...result,
      kind: "search",
    }));

    if (searchResults.length > 0) {
      return searchResults;
    }

    return filteredCommands;
  }, [filteredCommands, liveResults]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, open]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isCommandK =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";

      if (isCommandK) {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }

      if (!open) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) =>
          Math.min(current + 1, displayItems.length - 1),
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === "Enter" && displayItems[selectedIndex]) {
        event.preventDefault();
        runItem(displayItems[selectedIndex]);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [displayItems, open, selectedIndex]);

  function getItemTitle(item: CommandBarItem) {
    return item.kind === "command" ? item.label : item.title;
  }

  function getItemSubtitle(item: CommandBarItem) {
    return item.kind === "command" ? item.description : item.subtitle;
  }

  function getItemIcon(item: CommandBarItem) {
    return item.kind === "command" ? item.icon : searchIcons[item.type];
  }

  function runItem(item: CommandBarItem) {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
    router.push(item.href);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="premium-button-secondary hidden items-center gap-3 rounded-[1rem] px-4 py-2.5 text-sm font-semibold text-slate-200 sm:inline-flex"
        type="button"
        aria-label="Open command bar"
      >
        <span className="text-cyan-300">⌕</span>
        <span>Search</span>
        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[0.68rem] text-slate-400">
          Ctrl K
        </span>
      </button>

      <button
        onClick={() => setOpen(true)}
        className="premium-button-secondary inline-flex h-11 w-11 items-center justify-center rounded-2xl sm:hidden"
        type="button"
        aria-label="Open command bar"
      >
        ⌕
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] bg-black/70 px-4 py-20 backdrop-blur-xl">
          <button
            className="absolute inset-0 h-full w-full cursor-default"
            type="button"
            aria-label="Close command bar"
            onClick={() => setOpen(false)}
          />

          <div className="premium-card-strong relative mx-auto max-w-2xl overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <div className="flex items-center gap-3 rounded-[1.3rem] border border-white/10 bg-black/35 px-4 py-3">
                <span className="text-lg text-cyan-300">⌕</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoFocus
                  placeholder="Search projects, notes, PDFs, flashcards..."
                  className="w-full bg-transparent text-sm font-medium text-white outline-none placeholder:text-slate-500"
                />
                <span className="hidden rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[0.68rem] text-slate-400 sm:inline-flex">
                  Esc
                </span>
              </div>

              {searching ? (
                <p className="mt-3 text-xs text-slate-400">
                  Searching StudySnap Brain...
                </p>
              ) : null}

              {searchError ? (
                <p className="mt-3 text-xs text-red-300">{searchError}</p>
              ) : null}
            </div>

            <div className="max-h-[26rem] overflow-y-auto p-3">
              {displayItems.length > 0 ? (
                <div className="space-y-2">
                  {displayItems.map((item, index) => {
                    const selected = index === selectedIndex;

                    return (
                      <button
                        key={`${item.kind}-${item.href}-${index}`}
                        onClick={() => runItem(item)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`group flex w-full items-center gap-4 rounded-[1.4rem] px-4 py-4 text-left transition ${
                          selected
                            ? "bg-white/[0.08] ring-1 ring-amber-300/30"
                            : "hover:bg-white/[0.06]"
                        }`}
                        type="button"
                      >
                        <span
                          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg ${
                            selected
                              ? "bg-amber-400/15 text-amber-200"
                              : "bg-white/5 text-cyan-300 group-hover:bg-amber-400/10"
                          }`}
                        >
                          {getItemIcon(item)}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-white">
                            {getItemTitle(item)}
                          </span>
                          <span className="mt-1 block truncate text-xs leading-5 text-slate-400">
                            {getItemSubtitle(item)}
                          </span>
                        </span>

                        <span
                          className={`text-xs ${
                            selected ? "text-amber-200" : "text-slate-500"
                          }`}
                        >
                          ↵
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-bold text-white">
                    No result found
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    Try searching a project, note, PDF, flashcard, or command.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
