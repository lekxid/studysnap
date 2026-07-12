"use client";

import type { AIConversation } from "@/lib/api";

type StudyTrailPanelProps = {
  trails: AIConversation[];
  activeTrailId: number | null;
  loading?: boolean;
  search: string;
  title?: string;
  emptyMessage?: string;
  onSearchChange: (value: string) => void;
  onSelect: (trail: AIConversation) => void;
  onNew: () => void;
  onRename: (trail: AIConversation) => void;
  onDelete: (trail: AIConversation) => void;
  onTogglePin: (trail: AIConversation) => void;
};

type TrailGroup = {
  label: string;
  trails: AIConversation[];
};

const surfaceLabels: Record<string, string> = {
  general_ai: "General",
  room_ai: "Room",
  pdf_ai: "PDF",
  notes_ai: "Note",
  quiz_ai: "Quiz",
  concept_cards_ai: "Cards",
  brain: "Brain",
  planner_ai: "Planner",
  smart_organizer: "Organizer",
  voice_ai: "Voice",
};

function getTrailDate(trail: AIConversation) {
  const value = trail.updated_at || trail.created_at;
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? new Date()
    : date;
}

function startOfDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

function buildGroups(
  trails: AIConversation[]
): TrailGroup[] {
  const now = startOfDay(new Date());
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const pinned = trails.filter(
    (trail) => trail.is_pinned
  );

  const unpinned = trails.filter(
    (trail) => !trail.is_pinned
  );

  const today: AIConversation[] = [];
  const yesterdayItems: AIConversation[] = [];
  const previousSevenDays: AIConversation[] = [];
  const older: AIConversation[] = [];

  for (const trail of unpinned) {
    const trailDate = startOfDay(getTrailDate(trail));

    if (trailDate.getTime() === now.getTime()) {
      today.push(trail);
    } else if (
      trailDate.getTime() === yesterday.getTime()
    ) {
      yesterdayItems.push(trail);
    } else if (trailDate >= sevenDaysAgo) {
      previousSevenDays.push(trail);
    } else {
      older.push(trail);
    }
  }

  return [
    { label: "Pinned", trails: pinned },
    { label: "Today", trails: today },
    {
      label: "Yesterday",
      trails: yesterdayItems,
    },
    {
      label: "Previous 7 days",
      trails: previousSevenDays,
    },
    { label: "Older", trails: older },
  ].filter((group) => group.trails.length > 0);
}

function formatTrailTime(trail: AIConversation) {
  const date = getTrailDate(trail);

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function StudyTrailPanel({
  trails,
  activeTrailId,
  loading = false,
  search,
  title = "Study Trail",
  emptyMessage = "Start your first learning trail.",
  onSearchChange,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onTogglePin,
}: StudyTrailPanelProps) {
  const cleanSearch = search.trim().toLowerCase();

  const filteredTrails = cleanSearch
    ? trails.filter((trail) =>
        trail.title.toLowerCase().includes(cleanSearch)
      )
    : trails;

  const groups = buildGroups(filteredTrails);

  return (
    <aside className="rounded-[1.6rem] border border-white/10 bg-[#08111d]/92 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
      <div className="rounded-[1.25rem] border border-yellow-300/15 bg-[linear-gradient(145deg,rgba(250,204,21,0.12),rgba(255,255,255,0.025))] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-yellow-300">
              Learning history
            </p>
            <h3 className="mt-1 text-lg font-black text-white">
              {title}
            </h3>
          </div>

          <button
            type="button"
            onClick={onNew}
            className="grid h-10 w-10 place-items-center rounded-xl bg-yellow-300 text-xl font-black text-slate-950 transition hover:bg-yellow-200"
            title="Start a new trail"
          >
            ＋
          </button>
        </div>

        <input
          value={search}
          onChange={(event) =>
            onSearchChange(event.target.value)
          }
          placeholder="Search your trails..."
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/35"
        />
      </div>

      <div className="mt-3 max-h-[66vh] overflow-y-auto pr-1">
        {loading ? (
          <p className="px-3 py-5 text-sm font-semibold text-slate-400">
            Loading your Study Trails...
          </p>
        ) : groups.length === 0 ? (
          <div className="rounded-[1.2rem] border border-dashed border-white/10 bg-white/[0.025] px-4 py-6 text-center">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-full border border-yellow-300/20 bg-yellow-300/10 text-lg">
              ✦
            </div>
            <p className="mt-3 text-sm font-black text-white">
              No trails yet
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {emptyMessage}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.label}>
                <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  {group.label}
                </p>

                <div className="relative space-y-2 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-px before:bg-white/10">
                  {group.trails.map((trail) => {
                    const active =
                      trail.id === activeTrailId;

                    return (
                      <article
                        key={trail.id}
                        className={`group relative rounded-[1.15rem] border transition ${
                          active
                            ? "border-yellow-300/35 bg-yellow-300/10"
                            : "border-transparent bg-white/[0.025] hover:border-white/10 hover:bg-white/[0.05]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(trail)}
                          className="flex w-full gap-3 px-3 py-3 text-left"
                        >
                          <span
                            className={`relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${
                              active
                                ? "bg-yellow-300 ring-yellow-300/10"
                                : "bg-slate-600 ring-[#08111d]"
                            }`}
                          />

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black text-white">
                              {trail.title}
                            </span>

                            <span className="mt-1 flex items-center gap-2 text-[10px] font-bold text-slate-500">
                              <span className="rounded-full border border-white/10 px-2 py-0.5 uppercase tracking-wide">
                                {surfaceLabels[trail.surface] ||
                                  trail.surface}
                              </span>

                              <span>
                                {formatTrailTime(trail)}
                              </span>
                            </span>
                          </span>
                        </button>

                        <div className="grid grid-cols-3 gap-1 border-t border-white/[0.06] px-2 py-2">
                          <button
                            type="button"
                            onClick={() =>
                              onTogglePin(trail)
                            }
                            className="rounded-lg px-2 py-1.5 text-[10px] font-black text-slate-400 transition hover:bg-yellow-300/10 hover:text-yellow-100"
                            title={
                              trail.is_pinned
                                ? "Unpin trail"
                                : "Pin trail"
                            }
                          >
                            {trail.is_pinned
                                ? "★ Unpin"
                                : "☆ Pin"}
                          </button>

                          <button
                            type="button"
                            onClick={() => onRename(trail)}
                            className="rounded-lg px-2 py-1.5 text-[10px] font-black text-slate-400 transition hover:bg-white/10 hover:text-white"
                            title="Rename trail"
                          >
                            ✎ Rename
                          </button>

                          <button
                            type="button"
                            onClick={() => onDelete(trail)}
                            className="rounded-lg px-2 py-1.5 text-[10px] font-black text-slate-400 transition hover:bg-red-500/10 hover:text-red-200"
                            title="Delete trail"
                          >
                            × Delete
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <p className="mt-3 px-2 text-[10px] leading-5 text-slate-600">
        Trails remember conversations. Learning memory remains separate and controlled in Settings.
      </p>
    </aside>
  );
}
