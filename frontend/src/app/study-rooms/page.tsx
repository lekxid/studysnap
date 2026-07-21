"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AppShell from "@/components/AppShell";
import {
  createStudyRoom,
  deleteStudyRoom,
  getStudyRooms,
  updateStudyRoom,
} from "@/lib/api";
import useRequireAuth from "@/hooks/useRequireAuth";
import {
  clearProjectRoomId,
  getSavedProjectRoomId,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";

type StudyRoom = {
  id: number;
  name: string;
  subject: string;
  description?: string | null;
  owner_id?: number;
};

function getRoomDescription(room: StudyRoom | null) {
  if (!room) return "No room selected yet.";
  return (
    room.description?.trim() || "Open this topic workspace and start learning."
  );
}

export default function StudyRoomsPage() {
  const ready = useRequireAuth();
  const router = useRouter();

  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [openRoomMenuId, setOpenRoomMenuId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const [newName, setNewName] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [editName, setEditName] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadRooms() {
    try {
      setLoading(true);
      setError("");

      const data = await getStudyRooms();
      const roomList: StudyRoom[] = Array.isArray(data) ? data : [];

      setRooms(roomList);

      const savedRoomId = getSavedProjectRoomId();
      const savedRoomExists =
        savedRoomId !== null &&
        roomList.some((room) => room.id === savedRoomId);

      const nextSelectedId =
        savedRoomExists && savedRoomId !== null
          ? savedRoomId
          : roomList[0]?.id || null;

      setSelectedRoomId(nextSelectedId);

      if (nextSelectedId !== null) {
        saveProjectRoomId(nextSelectedId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rooms.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    loadRooms();
  }, [ready]);

  const selectedRoom = useMemo(() => {
    return rooms.find((room) => room.id === selectedRoomId) || null;
  }, [rooms, selectedRoomId]);

  useEffect(() => {
    if (!selectedRoom) {
      setEditName("");
      setEditSubject("");
      setEditDescription("");
      return;
    }

    setEditName(selectedRoom.name || "");
    setEditSubject(selectedRoom.subject || "");
    setEditDescription(selectedRoom.description || "");
  }, [selectedRoom]);

  const filteredRooms = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return rooms;

    return rooms.filter((room) => {
      return [room.name, room.subject, room.description || ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rooms, query]);

  function selectRoom(roomId: number) {
    setOpenRoomMenuId(null);
    setSelectedRoomId(roomId);
    saveProjectRoomId(roomId);
    setMessage("Room selected.");
    window.setTimeout(() => setMessage(""), 1200);
  }

  function openRoom(roomId: number) {
    setOpenRoomMenuId(null);
    saveProjectRoomId(roomId);
    router.push(`/study-rooms/${roomId}`);
  }

  function startRenameRoom(room: StudyRoom) {
    setOpenRoomMenuId(null);
    setSelectedRoomId(room.id);
    saveProjectRoomId(room.id);

    setEditName(room.name || "");
    setEditSubject(room.subject || "");
    setEditDescription(room.description || "");

    window.setTimeout(() => {
      const settingsPanel = document.getElementById("room-settings");

      if (settingsPanel instanceof HTMLDetailsElement) {
        settingsPanel.open = true;
      }

      settingsPanel?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      const nameInput = document.getElementById("room-settings-name");

      if (nameInput instanceof HTMLInputElement) {
        nameInput.focus();
        nameInput.select();
      }
    }, 80);
  }

  async function handleCreateRoom() {
    if (!newName.trim()) {
      setError("Enter a room name.");
      return;
    }

    if (!newSubject.trim()) {
      setError("Enter a subject.");
      return;
    }

    try {
      setSavingNew(true);
      setError("");
      setMessage("");

      const created = (await createStudyRoom(
        newName.trim(),
        newSubject.trim(),
        newDescription.trim() || undefined,
      )) as StudyRoom;

      setRooms((current) => [created, ...current]);
      setSelectedRoomId(created.id);
      saveProjectRoomId(created.id);

      setNewName("");
      setNewSubject("");
      setNewDescription("");
      setMessage("Room created and selected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room.");
    } finally {
      setSavingNew(false);
    }
  }

  async function handleUpdateRoom() {
    if (!selectedRoom) return;

    if (!editName.trim()) {
      setError("Room name cannot be empty.");
      return;
    }

    if (!editSubject.trim()) {
      setError("Subject cannot be empty.");
      return;
    }

    try {
      setSavingEdit(true);
      setError("");
      setMessage("");

      const updated = (await updateStudyRoom(
        selectedRoom.id,
        editName.trim(),
        editSubject.trim(),
        editDescription.trim() || undefined,
      )) as StudyRoom;

      setRooms((current) =>
        current.map((room) => (room.id === updated.id ? updated : room)),
      );

      setSelectedRoomId(updated.id);
      saveProjectRoomId(updated.id);
      setMessage("Room updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update room.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteRoom(room: StudyRoom) {
    const confirmed = window.confirm(
      `Delete "${room.name}"? This cannot be undone.`,
    );

    if (!confirmed) return;

    setOpenRoomMenuId(null);

    try {
      setDeleting(true);
      setError("");
      setMessage("");

      await deleteStudyRoom(room.id);

      const nextRooms = rooms.filter((item) => item.id !== room.id);

      const deletedCurrentRoom = selectedRoomId === room.id;

      const nextSelectedId = deletedCurrentRoom
        ? (nextRooms[0]?.id ?? null)
        : selectedRoomId;

      setRooms(nextRooms);
      setSelectedRoomId(nextSelectedId);

      if (deletedCurrentRoom) {
        if (nextSelectedId !== null) {
          saveProjectRoomId(nextSelectedId);
        } else {
          clearProjectRoomId();
        }
      }

      setMessage(`"${room.name}" deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete room.");
    } finally {
      setDeleting(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0b0f14] p-6 text-white">
        Checking authentication...
      </div>
    );
  }

  return (
    <AppShell title="Rooms">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        {error || message ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
              error
                ? "border-red-400/20 bg-red-500/10 text-red-200"
                : "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
            }`}
          >
            {error || message}
          </div>
        ) : null}

        <section className="rounded-[1.6rem] border border-white/[0.1] bg-[linear-gradient(145deg,rgba(16,22,28,0.94),rgba(3,6,9,0.98))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-3xl sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-white">Study rooms</h2>

              <p className="mt-1 text-xs font-bold text-slate-500">
                {rooms.length} room{rooms.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/study-rooms/organize"
                title="Smart Organizer"
                aria-label="Open Smart Organizer"
                className="grid h-10 w-10 place-items-center rounded-[14px] border border-[#c9ad50]/25 bg-[#c9ad50]/10 text-lg text-[#dfce83] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                ✦
              </Link>

              <button
                type="button"
                onClick={loadRooms}
                disabled={loading}
                title="Refresh rooms"
                aria-label="Refresh rooms"
                className="grid h-10 w-10 place-items-center rounded-[14px] border border-white/[0.1] bg-white/[0.045] text-base text-slate-300 disabled:opacity-50"
              >
                {loading ? "…" : "↻"}
              </button>
            </div>
          </div>

          <div className="relative mt-4">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
            >
              ⌕
            </span>

            <input
              className="w-full rounded-[1.1rem] border border-white/[0.1] bg-[#030609]/85 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[#c9ad50]/35"
              placeholder="Search rooms"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </section>

        {filteredRooms.length === 0 ? (
          <section className="rounded-[1.5rem] border border-dashed border-white/[0.12] bg-white/[0.025] px-5 py-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.1] bg-white/[0.04] text-xl">
              ▦
            </div>

            <h3 className="mt-4 text-base font-black text-white">
              {rooms.length === 0 ? "No rooms yet" : "No matching rooms"}
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              {rooms.length === 0
                ? "Open New room below to create one."
                : "Try another search."}
            </p>
          </section>
        ) : (
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredRooms.map((room) => {
              const active = room.id === selectedRoomId;

              return (
                <article
                  key={room.id}
                  className={`group cursor-pointer focus-within:z-30 relative rounded-[1.4rem] border p-3 shadow-[0_16px_44px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:shadow-[0_22px_58px_rgba(0,0,0,0.38)] ${
                    active
                      ? "border-[#c9ad50]/35 bg-[#c9ad50]/[0.07]"
                      : "border-white/[0.1] bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))]"
                  }`}
                >
                  <button
                    type="button"
                    data-room-card-link
                    onClick={() => openRoom(room.id)}
                    aria-label={`Open ${room.name}`}
                    className="absolute inset-0 z-0 rounded-[1.4rem] outline-none transition focus-visible:ring-2 focus-visible:ring-[#c9ad50]/75 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    <span className="sr-only">Open {room.name}</span>
                  </button>
                  <div className="pointer-events-none relative z-10 flex items-start gap-3">
                    <div
                      aria-hidden="true"
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-[#c9ad50]/25 bg-[#c9ad50]/10 text-base font-black text-[#e0ce80]"
                    >
                      {room.name.trim().charAt(0).toUpperCase() || "S"}
                    </div>

                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-black text-white">
                          {room.name}
                        </h3>

                        {active ? (
                          <span
                            aria-label="Selected room"
                            className="text-xs text-[#dcca78]"
                          >
                            ✓
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1 truncate text-xs font-bold text-slate-500">
                        {room.subject || "Study room"}
                      </p>

                      <p className="mt-2 line-clamp-1 text-xs text-slate-400">
                        {getRoomDescription(room)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setOpenRoomMenuId(
                          openRoomMenuId === room.id ? null : room.id,
                        )
                      }
                      aria-label={`Room options for ${room.name}`}
                      aria-haspopup="menu"
                      aria-expanded={openRoomMenuId === room.id}
                      aria-controls={`room-options-${room.id}`}
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-lg font-black transition ${
                        openRoomMenuId === room.id
                          ? "border-[#c9ad50]/35 bg-[#c9ad50]/15 text-[#e3d285]"
                          : "border-white/[0.1] bg-white/[0.045] text-slate-400 active:bg-white/[0.09]"
                      }`}
                    >
                      ⋯
                    </button>
                  </div>

                  {openRoomMenuId === room.id ? (
                    <div
                      id={`room-options-${room.id}`}
                      role="menu"
                      aria-label={`Options for ${room.name}`}
                      className="pointer-events-auto absolute right-3 top-14 z-40 w-52 overflow-hidden rounded-2xl border border-white/[0.12] bg-[#080c10]/95 p-2 shadow-[0_24px_70px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-3xl"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openRoom(room.id)}
                        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-black text-slate-100 transition hover:bg-white/[0.08]"
                      >
                        <span
                          aria-hidden="true"
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.055] text-sm"
                        >
                          ↗
                        </span>
                        Open room
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        disabled={active}
                        onClick={() => selectRoom(room.id)}
                        className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-black transition ${
                          active
                            ? "cursor-default text-[#dfcf8b]"
                            : "text-slate-100 hover:bg-white/[0.08]"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm ${
                            active ? "bg-[#c9ad50]/15" : "bg-white/[0.055]"
                          }`}
                        >
                          ✓
                        </span>

                        {active ? "Current room" : "Set as current"}
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => startRenameRoom(room)}
                        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-black text-slate-100 transition hover:bg-white/[0.08]"
                      >
                        <span
                          aria-hidden="true"
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.055] text-sm"
                        >
                          ✎
                        </span>
                        Rename
                      </button>

                      <div className="mt-1 border-t border-white/[0.08] pt-1">
                        <button
                          type="button"
                          role="menuitem"
                          disabled={deleting}
                          onClick={() => void handleDeleteRoom(room)}
                          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-black text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span
                            aria-hidden="true"
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-red-500/10 text-sm"
                          >
                            ⌫
                          </span>

                          {deleting ? "Deleting…" : "Delete room"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        )}

        <section className="grid gap-3 lg:grid-cols-3">
          <details className="group overflow-hidden rounded-[1.4rem] border border-white/[0.1] bg-[linear-gradient(145deg,rgba(15,21,27,0.92),rgba(3,6,9,0.97))] shadow-[0_18px_50px_rgba(0,0,0,0.3)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4">
              <span className="flex items-center gap-3 text-sm font-black text-white">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-[#c9ad50]/25 bg-[#c9ad50]/10 text-[#ddca78]">
                  ＋
                </span>
                New room
              </span>

              <span className="text-xs text-slate-500 transition group-open:rotate-180">
                ▾
              </span>
            </summary>

            <div className="grid gap-3 border-t border-white/[0.08] p-4">
              <input
                className="rounded-xl border border-white/[0.1] bg-black/40 px-4 py-3 text-sm text-white outline-none"
                placeholder="Room name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />

              <input
                className="rounded-xl border border-white/[0.1] bg-black/40 px-4 py-3 text-sm text-white outline-none"
                placeholder="Subject"
                value={newSubject}
                onChange={(event) => setNewSubject(event.target.value)}
              />

              <textarea
                className="min-h-[80px] rounded-xl border border-white/[0.1] bg-black/40 px-4 py-3 text-sm text-white outline-none"
                placeholder="Description (optional)"
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
              />

              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={savingNew}
                className="rounded-xl bg-[#c9ad50] px-4 py-3 text-sm font-black text-black disabled:opacity-50"
              >
                {savingNew ? "Creating…" : "Create"}
              </button>
            </div>
          </details>

          <details
            id="room-settings"
            className="group overflow-hidden rounded-[1.4rem] border border-white/[0.1] bg-[linear-gradient(145deg,rgba(15,21,27,0.92),rgba(3,6,9,0.97))] shadow-[0_18px_50px_rgba(0,0,0,0.3)]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4">
              <span className="flex min-w-0 items-center gap-3 text-sm font-black text-white">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.1] bg-white/[0.045] text-slate-300">
                  ⚙
                </span>

                <span className="truncate">Room settings</span>
              </span>

              <span className="text-xs text-slate-500 transition group-open:rotate-180">
                ▾
              </span>
            </summary>

            <div className="border-t border-white/[0.08] p-4">
              {!selectedRoom ? (
                <p className="text-sm text-slate-500">Select a room first.</p>
              ) : (
                <div className="grid gap-3">
                  <p className="truncate text-sm font-black text-[#dfce83]">
                    {selectedRoom.name}
                  </p>

                  <input
                    id="room-settings-name"
                    className="rounded-xl border border-white/[0.1] bg-black/40 px-4 py-3 text-sm text-white outline-none"
                    placeholder="Room name"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                  />

                  <input
                    className="rounded-xl border border-white/[0.1] bg-black/40 px-4 py-3 text-sm text-white outline-none"
                    placeholder="Subject"
                    value={editSubject}
                    onChange={(event) => setEditSubject(event.target.value)}
                  />

                  <textarea
                    className="min-h-[80px] rounded-xl border border-white/[0.1] bg-black/40 px-4 py-3 text-sm text-white outline-none"
                    placeholder="Description"
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                  />

                  <button
                    type="button"
                    onClick={handleUpdateRoom}
                    disabled={savingEdit}
                    className="w-full rounded-xl bg-[#c9ad50] px-3 py-3 text-xs font-black text-black transition hover:bg-[#d3b95e] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingEdit ? "Saving…" : "Save changes"}
                  </button>
                </div>
              )}
            </div>
          </details>

          <Link
            href="/study-rooms/organize"
            className="flex items-center justify-between gap-3 rounded-[1.4rem] border border-white/[0.1] bg-[linear-gradient(145deg,rgba(15,21,27,0.92),rgba(3,6,9,0.97))] px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.3)]"
          >
            <span className="flex items-center gap-3 text-sm font-black text-white">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-[#c9ad50]/25 bg-[#c9ad50]/10 text-[#ddca78]">
                ✦
              </span>
              Smart Organizer
            </span>

            <span className="text-slate-500">›</span>
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
