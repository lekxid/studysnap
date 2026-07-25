"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  AIConversation,
} from "@/lib/api";

type StudyTrailPanelProps = {
  trails: AIConversation[];
  activeTrailId: number | null;
  loading?: boolean;
  search: string;
  title?: string;
  emptyMessage?: string;
  onSearchChange: (
    value: string
  ) => void;
  onSelect: (
    trail: AIConversation
  ) => void;
  onNew: () => void;
  onRename: (
    trail: AIConversation
  ) => void;
  onDelete: (
    trail: AIConversation
  ) => void;
  onTogglePin: (
    trail: AIConversation
  ) => void;
  onBulkDelete?: (
    trails: AIConversation[]
  ) => void;
};

type TrailGroup = {
  label: string;
  trails: AIConversation[];
};

function getTrailDate(
  trail: AIConversation
) {
  const value =
    trail.updated_at ||
    trail.created_at;

  const date = new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? new Date()
    : date;
}

function startOfDay(
  date: Date
) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

function buildGroups(
  trails: AIConversation[]
): TrailGroup[] {
  const now =
    startOfDay(new Date());

  const yesterday =
    new Date(now);

  yesterday.setDate(
    now.getDate() - 1
  );

  const sevenDaysAgo =
    new Date(now);

  sevenDaysAgo.setDate(
    now.getDate() - 7
  );

  const pinned =
    trails.filter(
      (trail) =>
        trail.is_pinned
    );

  const unpinned =
    trails.filter(
      (trail) =>
        !trail.is_pinned
    );

  const today:
    AIConversation[] = [];

  const yesterdayItems:
    AIConversation[] = [];

  const previousSevenDays:
    AIConversation[] = [];

  const older:
    AIConversation[] = [];

  for (
    const trail of unpinned
  ) {
    const trailDate =
      startOfDay(
        getTrailDate(trail)
      );

    if (
      trailDate.getTime() ===
      now.getTime()
    ) {
      today.push(trail);
    } else if (
      trailDate.getTime() ===
      yesterday.getTime()
    ) {
      yesterdayItems.push(
        trail
      );
    } else if (
      trailDate >=
      sevenDaysAgo
    ) {
      previousSevenDays.push(
        trail
      );
    } else {
      older.push(trail);
    }
  }

  return [
    {
      label: "Pinned",
      trails: pinned,
    },
    {
      label: "Today",
      trails: today,
    },
    {
      label: "Yesterday",
      trails:
        yesterdayItems,
    },
    {
      label:
        "Previous 7 days",
      trails:
        previousSevenDays,
    },
    {
      label: "Older",
      trails: older,
    },
  ].filter(
    (group) =>
      group.trails.length > 0
  );
}

function formatTrailTime(
  trail: AIConversation
) {
  const date =
    getTrailDate(trail);

  return date.toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
    }
  );
}

export default function StudyTrailPanel({
  trails,
  activeTrailId,
  loading = false,
  search,
  title = "Chats",
  emptyMessage =
    "Start your first chat.",
  onSearchChange,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onTogglePin,
  onBulkDelete,
}: StudyTrailPanelProps) {
  const panelRef =
    useRef<HTMLElement | null>(
      null
    );

  const [
    openMenuId,
    setOpenMenuId,
  ] = useState<
    number | null
  >(null);

  const [
    selecting,
    setSelecting,
  ] = useState(false);

  const [
    selectedIds,
    setSelectedIds,
  ] = useState<Set<number>>(
    () => new Set()
  );

  // MOBILE_DELETE_CONTROLS_V1

  function exitSelection() {
    setSelecting(false);

    setSelectedIds(
      new Set()
    );

    setOpenMenuId(null);
  }

  function toggleSelected(
    trailId: number
  ) {
    setSelectedIds(
      (current) => {
        const next =
          new Set(current);

        if (
          next.has(trailId)
        ) {
          next.delete(trailId);
        } else {
          next.add(trailId);
        }

        return next;
      }
    );
  }

  useEffect(() => {
    function handlePointerDown(
      event: PointerEvent
    ) {
      if (
        panelRef.current &&
        !panelRef.current.contains(
          event.target as Node
        )
      ) {
        setOpenMenuId(null);
      }
    }

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.key !== "Escape"
      ) {
        return;
      }

      setOpenMenuId(null);

      if (selecting) {
        exitSelection();
      }
    }

    document.addEventListener(
      "pointerdown",
      handlePointerDown
    );

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown
      );

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [selecting]);

  useEffect(() => {
    const validIds =
      new Set(
        trails.map(
          (trail) =>
            trail.id
        )
      );

    queueMicrotask(() => {
      setSelectedIds(
        (current) => {
          const next =
            new Set(
              [...current].filter(
                (id) =>
                  validIds.has(id)
              )
            );

          if (
            next.size ===
            current.size
          ) {
            return current;
          }

          return next;
        }
      );
    });
  }, [trails]);

  const cleanSearch =
    search
      .trim()
      .toLowerCase();

  const filteredTrails =
    cleanSearch
      ? trails.filter(
          (trail) =>
            trail.title
              .toLowerCase()
              .includes(
                cleanSearch
              )
        )
      : trails;

  const groups =
    buildGroups(
      filteredTrails
    );

  const selectedTrails =
    trails.filter(
      (trail) =>
        selectedIds.has(
          trail.id
        )
    );

  const allFilteredSelected =
    filteredTrails.length > 0 &&
    filteredTrails.every(
      (trail) =>
        selectedIds.has(
          trail.id
        )
    );

  function toggleSelectAll() {
    setSelectedIds(
      (current) => {
        const next =
          new Set(current);

        if (
          allFilteredSelected
        ) {
          for (
            const trail
            of filteredTrails
          ) {
            next.delete(
              trail.id
            );
          }
        } else {
          for (
            const trail
            of filteredTrails
          ) {
            next.add(
              trail.id
            );
          }
        }

        return next;
      }
    );
  }

  return (
    <aside
      ref={panelRef}
      className="studysnap-chat-history studysnap-scroll h-full rounded-2xl border border-white/[0.08] bg-[#0d131a] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.32)]"
    >
      <div className="flex min-h-11 items-center gap-2 px-2">
        <h3 className="min-w-0 flex-1 truncate text-base font-black text-white">
          {selecting
            ? "Select chats"
            : title}
        </h3>

        <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] font-black text-slate-500">
          {selecting
            ? selectedIds.size
            : filteredTrails.length}
        </span>

        {!selecting &&
        onBulkDelete &&
        trails.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setOpenMenuId(
                null
              );

              setSelecting(
                true
              );
            }}
            className="min-h-11 touch-manipulation rounded-xl border border-white/10 bg-white/[0.035] px-3 text-[11px] font-black text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            Select
          </button>
        ) : null}

        {!selecting ? (
          <button
            type="button"
            onClick={() => {
              exitSelection();
              onNew();
            }}
            aria-label="New chat"
            title="New chat"
            className="grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-xl bg-[#c9ad50] text-xl font-black text-[#111317] transition hover:bg-[#d5bb63]"
          >
            ＋
          </button>
        ) : null}
      </div>

      <div className="relative mt-2">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-600">
          ⌕
        </span>

        <input
          value={search}
          onChange={(
            event
          ) =>
            onSearchChange(
              event.target.value
            )
          }
          placeholder="Search chats"
          aria-label="Search chats"
          className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.035] pl-9 pr-9 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-[#c9ad50]/30"
        />

        {search ? (
          <button
            type="button"
            onClick={() =>
              onSearchChange("")
            }
            aria-label="Clear search"
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-white/[0.07] hover:text-white"
          >
            ×
          </button>
        ) : null}
      </div>

      {selecting ? (
        <div className="mt-2 rounded-xl border border-[#c9ad50]/15 bg-[#c9ad50]/[0.055] p-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={
                toggleSelectAll
              }
              disabled={
                filteredTrails.length ===
                0
              }
              className="min-h-11 touch-manipulation rounded-lg border border-white/10 px-3 text-[11px] font-black text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-40"
            >
              {allFilteredSelected
                ? "Clear all"
                : "Select all"}
            </button>

            <span className="min-w-0 flex-1 text-[11px] font-bold text-slate-400">
              {selectedIds.size}{" "}
              selected
            </span>

            <button
              type="button"
              disabled={
                selectedTrails.length ===
                0
              }
              onClick={() =>
                onBulkDelete?.(
                  selectedTrails
                )
              }
              className="min-h-11 touch-manipulation rounded-lg border border-red-300/15 bg-red-400/10 px-3 text-[11px] font-black text-red-100 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete
            </button>

            <button
              type="button"
              onClick={
                exitSelection
              }
              className="min-h-11 touch-manipulation rounded-lg border border-white/10 px-3 text-[11px] font-black text-slate-300 transition hover:bg-white/[0.08]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="studysnap-scroll mt-3 max-h-[calc(100dvh-14rem)] overflow-y-auto pr-0.5 xl:max-h-[calc(100dvh-13rem)]">
        {loading ? (
          <p className="px-3 py-5 text-sm font-semibold text-slate-500">
            Loading…
          </p>
        ) : groups.length ===
          0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center">
            <p className="text-xl">
              ✦
            </p>

            <p className="mt-2 text-sm font-black text-white">
              No chats
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {emptyMessage}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(
              (group) => (
                <section
                  key={
                    group.label
                  }
                >
                  <p className="mb-1.5 px-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">
                    {group.label}
                  </p>

                  <div className="space-y-1">
                    {group.trails.map(
                      (trail) => {
                        const active =
                          trail.id ===
                          activeTrailId;

                        const selected =
                          selectedIds.has(
                            trail.id
                          );

                        const menuOpen =
                          openMenuId ===
                          trail.id;

                        return (
                          <article
                            key={
                              trail.id
                            }
                            className={`overflow-visible rounded-xl border transition ${
                              selected
                                ? "border-[#c9ad50]/40 bg-[#c9ad50]/[0.12]"
                                : active
                                  ? "border-[#c9ad50]/30 bg-[#c9ad50]/[0.09]"
                                  : "border-transparent bg-white/[0.025] hover:bg-white/[0.05]"
                            }`}
                          >
                            <div className="flex min-w-0 items-center">
                              <button
                                type="button"
                                aria-pressed={
                                  selecting
                                    ? selected
                                    : undefined
                                }
                                onClick={() => {
                                  setOpenMenuId(
                                    null
                                  );

                                  if (
                                    selecting
                                  ) {
                                    toggleSelected(
                                      trail.id
                                    );

                                    return;
                                  }

                                  onSelect(
                                    trail
                                  );
                                }}
                                className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2.5 text-left"
                              >
                                {selecting ? (
                                  <span
                                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] font-black ${
                                      selected
                                        ? "border-[#c9ad50] bg-[#c9ad50] text-[#111317]"
                                        : "border-white/15 bg-white/[0.03] text-transparent"
                                    }`}
                                  >
                                    ✓
                                  </span>
                                ) : (
                                  <span
                                    className={`h-2 w-2 shrink-0 rounded-full ${
                                      active
                                        ? "bg-[#c9ad50]"
                                        : "bg-slate-700"
                                    }`}
                                  />
                                )}

                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-bold text-slate-100">
                                    {
                                      trail.title
                                    }
                                  </span>

                                  <span className="mt-0.5 block text-[10px] font-semibold text-slate-600">
                                    {formatTrailTime(
                                      trail
                                    )}
                                  </span>
                                </span>

                                {trail.is_pinned ? (
                                  <span
                                    className="shrink-0 text-xs text-[#c9ad50]"
                                    title="Pinned"
                                  >
                                    ★
                                  </span>
                                ) : null}
                              </button>

                              {!selecting ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenMenuId(
                                      menuOpen
                                        ? null
                                        : trail.id
                                    )
                                  }
                                  aria-label={`Actions for ${trail.title}`}
                                  aria-expanded={
                                    menuOpen
                                  }
                                  className="mr-1 grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-xl text-sm font-black tracking-[0.1em] text-slate-300 transition hover:bg-white/[0.09] hover:text-white active:bg-white/[0.12]"
                                >
                                  •••
                                </button>
                              ) : null}
                            </div>

                            {!selecting &&
                            menuOpen ? (
                              <div className="grid grid-cols-3 gap-2 border-t border-white/[0.06] px-2 py-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(
                                      null
                                    );

                                    onTogglePin(
                                      trail
                                    );
                                  }}
                                  aria-label={
                                    trail.is_pinned
                                      ? "Unpin chat"
                                      : "Pin chat"
                                  }
                                  title={
                                    trail.is_pinned
                                      ? "Unpin"
                                      : "Pin"
                                  }
                                  className="grid h-11 w-full touch-manipulation place-items-center rounded-xl border border-white/[0.06] text-base text-slate-300 transition hover:bg-[#c9ad50]/10 hover:text-[#e4d89c] active:bg-[#c9ad50]/15"
                                >
                                  {trail.is_pinned
                                    ? "★"
                                    : "☆"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(
                                      null
                                    );

                                    onRename(
                                      trail
                                    );
                                  }}
                                  aria-label="Rename chat"
                                  title="Rename"
                                  className="grid h-11 w-full touch-manipulation place-items-center rounded-xl border border-white/[0.06] text-sm text-slate-300 transition hover:bg-white/[0.09] hover:text-white active:bg-white/[0.12]"
                                >
                                  ✎
                                </button>

                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();

                                    setOpenMenuId(
                                      null
                                    );

                                    onDelete(
                                      trail
                                    );
                                  }}
                                  aria-label="Delete chat"
                                  title="Delete"
                                  className="grid h-11 w-full touch-manipulation place-items-center rounded-xl border border-red-300/15 bg-red-400/[0.06] text-sm text-red-200 transition hover:bg-red-500/15 active:bg-red-500/20"
                                >
                                  🗑
                                </button>
                              </div>
                            ) : null}
                          </article>
                        );
                      }
                    )}
                  </div>
                </section>
              )
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
