"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import { deleteStudyRoom, getStudyRooms, type StudyRoom } from "@/lib/api";
import {
  clearProjectRoomId,
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
  window.localStorage.setItem(PINNED_GROUPS_STORAGE_KEY, JSON.stringify(ids));
}

export default function StudyTogetherPage() {
  const ready = useRequireAuth();
  const router = useRouter();

  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [pinnedGroupIds, setPinnedGroupIds] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openMenuRoomId, setOpenMenuRoomId] = useState<number | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<number | null>(null);

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
      [room.name, room.subject, room.description || ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, rooms]);

  const pinnedGroups = useMemo(
    () => filteredGroups.filter((room) => pinnedGroupIds.includes(room.id)),
    [filteredGroups, pinnedGroupIds],
  );

  const unpinnedGroups = useMemo(
    () => filteredGroups.filter((room) => !pinnedGroupIds.includes(room.id)),
    [filteredGroups, pinnedGroupIds],
  );

  const activeRoomId = getSavedProjectRoomId();

  const continueGroup =
    rooms.find((room) => room.id === activeRoomId) ?? rooms[0] ?? null;

  function openGroup(roomId: number) {
    setOpenMenuRoomId(null);
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

    setOpenMenuRoomId(null);
  }

  async function removeGroup(room: StudyRoom) {
    const confirmed = window.confirm(
      `Delete "${room.name}"? This cannot be undone.`,
    );

    if (!confirmed) {
      setOpenMenuRoomId(null);
      return;
    }

    try {
      setDeletingRoomId(room.id);
      setError("");

      await deleteStudyRoom(room.id);

      setRooms((current) => current.filter((item) => item.id !== room.id));

      setPinnedGroupIds((current) => {
        const next = current.filter((id) => id !== room.id);
        writePinnedGroupIds(next);
        return next;
      });

      if (getSavedProjectRoomId() === room.id) {
        clearProjectRoomId();
      }

      setOpenMenuRoomId(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The study group could not be deleted.",
      );
    } finally {
      setDeletingRoomId(null);
    }
  }

  function renderGroupCard(room: StudyRoom) {
    const isPinned = pinnedGroupIds.includes(room.id);
    const menuIsOpen = openMenuRoomId === room.id;
    const isDeleting = deletingRoomId === room.id;

    return (
      <article
        key={room.id}
        className={`group relative overflow-visible rounded-[24px] border border-white/[0.12] bg-[linear-gradient(145deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:border-[#d8bd60]/30 hover:bg-[linear-gradient(145deg,rgba(255,255,255,0.095),rgba(255,255,255,0.035))] hover:shadow-[0_24px_60px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.11)] ${
          menuIsOpen ? "z-[70]" : "z-0"
        }`}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => openGroup(room.id)}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-[linear-gradient(145deg,#e6cb68,#b99a38)] text-lg font-black text-black shadow-[0_10px_30px_rgba(201,173,80,0.22),inset_0_1px_0_rgba(255,255,255,0.45)] transition group-hover:scale-[1.04]"
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

              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setOpenMenuRoomId((current) =>
                      current === room.id ? null : room.id,
                    )
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.13] bg-white/[0.055] text-lg font-black leading-none text-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition hover:border-white/25 hover:bg-white/[0.1] hover:text-white"
                  aria-label={`More options for ${room.name}`}
                  aria-expanded={menuIsOpen}
                  aria-haspopup="menu"
                >
                  ⋯
                </button>

                {menuIsOpen ? (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-[60] cursor-default bg-transparent"
                      aria-label="Close group menu"
                      onClick={() => setOpenMenuRoomId(null)}
                    />

                    <div
                      role="menu"
                      className="absolute bottom-11 right-0 z-[80] w-44 overflow-hidden rounded-2xl border border-white/[0.14] bg-[linear-gradient(145deg,rgba(34,42,51,0.98),rgba(19,25,32,0.96))] p-1 shadow-[0_24px_70px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.09)] backdrop-blur-3xl sm:bottom-auto sm:top-11 sm:w-48 sm:p-1.5"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openGroup(room.id)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-white transition hover:bg-white/[0.07]"
                      >
                        <span
                          aria-hidden="true"
                          className="w-5 text-center text-white/55"
                        >
                          ↗
                        </span>
                        Open group
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => togglePinnedGroup(room.id)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-white transition hover:bg-white/[0.07]"
                      >
                        <span
                          aria-hidden="true"
                          className="w-5 text-center text-[#c9ad50]"
                        >
                          {isPinned ? "★" : "☆"}
                        </span>
                        {isPinned ? "Unpin group" : "Pin group"}
                      </button>

                      <div className="my-1 border-t border-white/[0.07]" />

                      <button
                        type="button"
                        role="menuitem"
                        disabled={isDeleting}
                        onClick={() => void removeGroup(room)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-red-300 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span aria-hidden="true" className="w-5 text-center">
                          ⌫
                        </span>
                        {isDeleting ? "Deleting..." : "Delete group"}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <p className="mt-2 line-clamp-2 text-sm leading-5 text-white/60">
              {getRoomDescription(room)}
            </p>

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
              <div className="flex min-w-0 items-center gap-2">
                {isPinned ? (
                  <span className="text-xs text-[#c9ad50]" aria-label="Pinned">
                    ★
                  </span>
                ) : null}

                <p className="truncate text-xs text-white/40">
                  Latest conversation
                </p>
              </div>

              <button
                type="button"
                onClick={() => openGroup(room.id)}
                className="shrink-0 rounded-xl border border-white/[0.1] bg-white/[0.065] px-3 py-2 text-xs font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl transition hover:border-[#d8bd60]/35 hover:bg-[#c9ad50] hover:text-black"
              >
                Open →
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
        <section className="relative isolate overflow-hidden rounded-[32px] border border-white/[0.13] bg-[linear-gradient(145deg,rgba(255,255,255,0.075),rgba(255,255,255,0.02))] shadow-[0_28px_80px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-3xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-[#d6bc5e]/[0.11] blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 right-4 h-72 w-72 rounded-full bg-white/[0.055] blur-3xl"
          />

          <div className="relative z-10 grid gap-6 p-6 lg:grid-cols-[1.35fr_0.65fr] lg:p-8">
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
                  className="rounded-2xl border border-white/20 bg-[linear-gradient(145deg,#e4c963,#bfa03d)] px-5 py-3 text-sm font-black text-black shadow-[0_12px_32px_rgba(201,173,80,0.22),inset_0_1px_0_rgba(255,255,255,0.45)] transition hover:-translate-y-0.5 hover:brightness-105"
                >
                  ＋ Start a new group
                </Link>

                {continueGroup ? (
                  <button
                    type="button"
                    onClick={() => openGroup(continueGroup.id)}
                    className="rounded-2xl border border-white/[0.14] bg-white/[0.055] px-5 py-3 text-sm font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-[#d8bd60]/30 hover:bg-white/[0.09]"
                  >
                    Continue {continueGroup.name} →
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/[0.13] bg-white/[0.045] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
                Your study space
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/[0.12] bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.025))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
                  <p className="text-2xl font-black text-white">
                    {rooms.length}
                  </p>
                  <p className="mt-1 text-xs text-white/50">Your groups</p>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                  <p className="text-2xl font-black text-[#c9ad50]">
                    {pinnedGroupIds.length}
                  </p>
                  <p className="mt-1 text-xs text-white/50">Pinned groups</p>
                </div>
              </div>

              <p className="mt-4 text-xs leading-5 text-white/45">
                Messages stay hidden until you choose a group.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/[0.12] bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.018))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-white">Find a group</h2>
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
                className="w-full rounded-2xl border border-white/[0.13] bg-white/[0.045] py-3 pl-11 pr-4 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] outline-none backdrop-blur-2xl transition placeholder:text-white/35 hover:bg-white/[0.06] focus:border-[#d8bd60]/40 focus:bg-white/[0.07] focus:shadow-[0_0_0_4px_rgba(201,173,80,0.08),inset_0_1px_0_rgba(255,255,255,0.09)]"
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

            {unpinnedGroups.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {unpinnedGroups.map(renderGroupCard)}
              </div>
            ) : (
              <div className="rounded-[28px] border border-dashed border-white/[0.16] bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] px-6 py-12 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-2xl">
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
