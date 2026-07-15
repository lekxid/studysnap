"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import { getStudyRooms, type StudyRoom } from "@/lib/api";
import {
  getSavedProjectRoomId,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";

const PINNED_GROUPS_STORAGE_KEY = "studysnap:pinned-study-groups";

function getRoomInitial(room: StudyRoom) {
  return room.name.trim().charAt(0).toUpperCase() || "S";
}

function getRoomDescription(room: StudyRoom) {
  return (
    room.description?.trim() ||
    `Study ${room.subject || "together"} with your classmates.`
  );
}

function readPinnedGroupIds(): number[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const saved = window.localStorage.getItem(PINNED_GROUPS_STORAGE_KEY);

    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  } catch {
    return [];
  }
}

function writePinnedGroupIds(ids: number[]) {
  window.localStorage.setItem(
    PINNED_GROUPS_STORAGE_KEY,
    JSON.stringify(ids),
  );
}

export default function StudyTogetherPage() {
  const ready = useRequireAuth();
  const router = useRouter();

  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [pinnedGroupIds, setPinnedGroupIds] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) {
      return;
    }

    setPinnedGroupIds(readPinnedGroupIds());

    async function loadGroups() {
      try {
        setLoading(true);
        setError("");

        const response = await getStudyRooms();
        setRooms(Array.isArray(response) ? response : []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Study groups could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadGroups();
  }, [ready]);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return rooms;
    }

    return rooms.filter((room) =>
      [
        room.name,
        room.subject,
        room.description || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, rooms]);

  const pinnedGroups = useMemo(
    () =>
      filteredGroups.filter((room) =>
        pinnedGroupIds.includes(room.id),
      ),
    [filteredGroups, pinnedGroupIds],
  );

  const unpinnedGroups = useMemo(
    () =>
      filteredGroups.filter(
        (room) => !pinnedGroupIds.includes(room.id),
      ),
    [filteredGroups, pinnedGroupIds],
  );

  const activeRoomId = getSavedProjectRoomId();

  const continueGroup =
    rooms.find((room) => room.id === activeRoomId) ??
    rooms[0] ??
    null;

  function openGroup(roomId: number) {
    saveProjectRoomId(roomId);
    router.push(`/study-rooms/${roomId}?tab=together`);
  }

  function togglePinnedGroup(roomId: number) {
    setPinnedGroupIds((current) => {
      const next = current.includes(roomId)
        ? current.filter((id) => id !== roomId)
        : [roomId, ...current];

      writePinnedGroupIds(next);
      return next;
    });
  }

  function renderGroupCard(room: StudyRoom) {
    const isPinned = pinnedGroupIds.includes(room.id);

    return (
      <article
        key={room.id}
        className="group rounded-2xl border border-white/10 bg-[#12181e] p-4 transition hover:border-[#c9ad50]/[0.18] hover:bg-[#151c23]"
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => openGroup(room.id)}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#c9ad50] text-lg font-black text-black transition group-hover:scale-[1.03]"
            aria-label={`Open ${room.name}`}
          >
            {getRoomInitial(room)}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => openGroup(room.id)}
                  className="block max-w-full truncate text-left text-base font-black text-white hover:text-[#cec18d]"
                >
                  {room.name}
                </button>

                <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">
                  {room.subject || "Study group"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => togglePinnedGroup(room.id)}
                className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold transition ${
                  isPinned
                    ? "border-[#c9ad50]/[0.18] bg-[#c9ad50]/[0.08] text-[#cec18d]"
                    : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white"
                }`}
                aria-label={
                  isPinned
                    ? `Unpin ${room.name}`
                    : `Pin ${room.name}`
                }
              >
                {isPinned ? "★ Pinned" : "☆ Pin"}
              </button>
            </div>

            <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/65">
              {getRoomDescription(room)}
            </p>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
              <div className="min-w-0">
                <p className="truncate text-xs text-white/45">
                  Open the group to view the latest conversation
                </p>
              </div>

              <button
                type="button"
                onClick={() => openGroup(room.id)}
                className="shrink-0 rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-black text-white transition hover:bg-[#c9ad50] hover:text-black"
              >
                Open group →
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0b0f14] p-6 text-white">
        Checking authentication...
      </div>
    );
  }

  return (
    <AppShell
      title="Study Together"
      subtitle="Start a study group or continue learning with classmates."
    >
      <div className="mx-auto w-full max-w-7xl space-y-6 pb-12">
        <section className="overflow-hidden rounded-[28px] border border-white/[0.07] bg-[#12181e]">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.35fr_0.65fr] lg:p-8">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#c9ad50]">
                Study Together
              </p>

              <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Learn better with your group.
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-6 text-white/65 sm:text-base">
                Start a new study group, continue a conversation, share
                materials and invite StudySnap AI only when your group needs
                help.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/study-rooms"
                  className="rounded-2xl bg-[#c9ad50] px-5 py-3 text-sm font-black text-black transition hover:bg-[#d5bb63]"
                >
                  ＋ Start a new group
                </Link>

                {continueGroup ? (
                  <button
                    type="button"
                    onClick={() => openGroup(continueGroup.id)}
                    className="rounded-2xl border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-black text-white transition hover:border-[#c9ad50]/[0.18] hover:bg-white/[0.08]"
                  >
                    Continue {continueGroup.name} →
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
                Your study space
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                  <p className="text-2xl font-black text-white">
                    {rooms.length}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    Your groups
                  </p>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                  <p className="text-2xl font-black text-[#c9ad50]">
                    {pinnedGroupIds.length}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    Pinned groups
                  </p>
                </div>
              </div>

              <p className="mt-4 text-xs leading-5 text-white/45">
                Messages stay hidden until you choose a group.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-white/10 bg-[#12181e] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-white">
                Find a group
              </h2>
              <p className="mt-1 text-xs text-white/45">
                Search by group name, subject or description.
              </p>
            </div>

            <div className="relative w-full sm:max-w-md">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35">
                ⌕
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your study groups..."
                className="w-full rounded-2xl border border-white/10 bg-[#151c23] py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#c9ad50]/[0.18]"
              />
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {loading ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-48 animate-pulse rounded-2xl border border-white/[0.07] bg-white/[0.03]"
              />
            ))}
          </section>
        ) : null}

        {!loading && pinnedGroups.length > 0 ? (
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#c9ad50]">
                  Pinned
                </p>
                <h2 className="mt-1 text-xl font-black text-white">
                  Pinned groups
                </h2>
              </div>

              <span className="text-xs text-white/40">
                {pinnedGroups.length} pinned
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pinnedGroups.map(renderGroupCard)}
            </div>
          </section>
        ) : null}

        {!loading ? (
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                  Continue studying
                </p>
                <h2 className="mt-1 text-xl font-black text-white">
                  Your groups
                </h2>
              </div>

              <span className="text-xs text-white/40">
                {filteredGroups.length} group
                {filteredGroups.length === 1 ? "" : "s"}
              </span>
            </div>

            {filteredGroups.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {unpinnedGroups.map(renderGroupCard)}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/12 bg-[#12181e] px-6 py-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#c9ad50] text-2xl text-black">
                  👥
                </div>

                <h3 className="mt-5 text-lg font-black text-white">
                  {query
                    ? "No matching groups"
                    : "Start your first study group"}
                </h3>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/50">
                  {query
                    ? "Try another group name or subject."
                    : "Create a Study Room, invite classmates and begin a shared conversation."}
                </p>

                {!query ? (
                  <Link
                    href="/study-rooms"
                    className="mt-5 inline-flex rounded-2xl bg-[#c9ad50] px-5 py-3 text-sm font-black text-black"
                  >
                    ＋ Create a group
                  </Link>
                ) : null}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
