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
  return room.description?.trim() || "Open this topic workspace and start learning.";
}

export default function StudyRoomsPage() {
  const ready = useRequireAuth();
  const router = useRouter();

  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
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
        savedRoomId !== null && roomList.some((room) => room.id === savedRoomId);

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
    setSelectedRoomId(roomId);
    saveProjectRoomId(roomId);
    setMessage("Room selected.");
    window.setTimeout(() => setMessage(""), 1200);
  }

  function openRoom(roomId: number) {
    saveProjectRoomId(roomId);
    router.push(`/study-rooms/${roomId}`);
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
        newDescription.trim() || undefined
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
        editDescription.trim() || undefined
      )) as StudyRoom;

      setRooms((current) =>
        current.map((room) => (room.id === updated.id ? updated : room))
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

  async function handleDeleteRoom() {
    if (!selectedRoom) return;

    const confirmed = window.confirm(
      `Delete "${selectedRoom.name}"? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      setError("");
      setMessage("");

      await deleteStudyRoom(selectedRoom.id);

      const nextRooms = rooms.filter((room) => room.id !== selectedRoom.id);
      const nextSelectedId = nextRooms[0]?.id || null;

      setRooms(nextRooms);
      setSelectedRoomId(nextSelectedId);

      if (nextSelectedId !== null) {
        saveProjectRoomId(nextSelectedId);
      }

      setMessage("Room deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete room.");
    } finally {
      setDeleting(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-black p-6 text-white">
        Checking authentication...
      </div>
    );
  }

  return (
    <AppShell
      title="Study Rooms"
      subtitle="Choose a topic, search your rooms, change subjects, and open the workspace you want to study."
    >
      <div className="content-grid">
        <section className="hero-grid">
          <div className="gold-card rounded-[2rem] p-6 sm:p-8">
            <div className="gold-chip mb-4">Room hub</div>

            <h3 className="panel-title text-white text-balance">
              Pick a topic and start learning from everything inside it.
            </h3>

            <p className="panel-muted mt-4 max-w-2xl">
              Rooms act like study folders. Each topic can hold PDFs, notes,
              flashcards, quizzes, planner sessions, and AI learning history.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-4">
              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Rooms</p>
                <p className="mt-3 text-2xl font-black text-cyan-300">
                  {rooms.length}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Selected</p>
                <p className="mt-3 line-clamp-1 text-lg font-black text-amber-300">
                  {selectedRoom?.name || "None"}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Subject</p>
                <p className="mt-3 line-clamp-1 text-lg font-black text-violet-300">
                  {selectedRoom?.subject || "Not set"}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Organizer</p>
                <p className="mt-3 text-lg font-black text-emerald-300">
                  Ready
                </p>
              </div>
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Smart upload</div>
            <h3 className="panel-title text-white">Auto-organize materials</h3>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Upload many files, screenshots, PDFs, or long notes and let
              StudySnap create rooms by topic.
            </p>

            <Link
              href="/study-rooms/organize"
              className="premium-button mt-5 inline-flex w-full justify-center rounded-[1.2rem] px-5 py-3 text-sm font-black"
            >
              Open Smart Organizer
            </Link>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Choose room</div>
            <h3 className="panel-title text-white">Search or select topic</h3>

            <div className="mt-5 grid gap-4">
              <input
                className="rounded-[1.2rem] px-4 py-3.5"
                placeholder="Search rooms like Linux, Cardiology, Physics..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />

              <select
                className="w-full rounded-[1.2rem] border border-white/10 bg-slate-950/70 px-4 py-3.5 text-white outline-none"
                value={selectedRoomId ?? ""}
                onChange={(event) => selectRoom(Number(event.target.value))}
                disabled={rooms.length === 0}
              >
                {rooms.length === 0 ? (
                  <option value="">No rooms yet</option>
                ) : (
                  rooms.map((room) => (
                    <option
                      key={room.id}
                      value={room.id}
                      className="bg-slate-950 text-white"
                    >
                      {room.name} — {room.subject}
                    </option>
                  ))
                )}
              </select>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Selected room
                </p>

                <h4 className="mt-3 text-2xl font-black text-white">
                  {selectedRoom?.name || "No room selected"}
                </h4>

                <p className="mt-2 text-sm font-bold text-amber-200">
                  {selectedRoom?.subject || "Choose or create a subject"}
                </p>

                <p className="mt-3 text-sm leading-7 text-slate-400">
                  {getRoomDescription(selectedRoom)}
                </p>

                <button
                  type="button"
                  onClick={() => selectedRoom && openRoom(selectedRoom.id)}
                  disabled={!selectedRoom}
                  className="premium-button mt-5 w-full rounded-[1.2rem] px-5 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Open workspace
                </button>
              </div>
            </div>
          </div>

          <div className="content-grid">
            <div className="premium-card gold-border rounded-[2rem] p-6">
              <div className="gold-chip mb-4">Edit selected room</div>
              <h3 className="panel-title text-white">Change name or subject</h3>
              <p className="panel-muted mt-3">
                This fixes the issue where you could not change the dashboard
                subject. Update the selected room here.
              </p>

              {!selectedRoom ? (
                <div className="empty-state mt-5">
                  Select a room first.
                </div>
              ) : (
                <div className="mt-5 grid gap-4">
                  <input
                    className="rounded-[1.2rem] px-4 py-3.5"
                    placeholder="Room name"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                  />

                  <input
                    className="rounded-[1.2rem] px-4 py-3.5"
                    placeholder="Subject, example: Linux"
                    value={editSubject}
                    onChange={(event) => setEditSubject(event.target.value)}
                  />

                  <textarea
                    className="min-h-[110px] rounded-[1.2rem] border border-white/10 bg-slate-950/70 px-4 py-3.5 text-white outline-none placeholder:text-slate-500"
                    placeholder="Description"
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleUpdateRoom}
                      disabled={savingEdit}
                      className="premium-button rounded-[1.2rem] px-4 py-3.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingEdit ? "Saving..." : "Save changes"}
                    </button>

                    <button
                      type="button"
                      onClick={handleDeleteRoom}
                      disabled={deleting}
                      className="rounded-[1.2rem] border border-red-300/20 bg-red-500/10 px-4 py-3.5 text-sm font-black text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deleting ? "Deleting..." : "Delete room"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="gold-card rounded-[2rem] p-6">
              <div className="gold-chip mb-4">Create room</div>
              <h3 className="panel-title text-white">New topic workspace</h3>

              <div className="mt-5 grid gap-4">
                <input
                  className="rounded-[1.2rem] px-4 py-3.5"
                  placeholder="Room name, example: Cardiology"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />

                <input
                  className="rounded-[1.2rem] px-4 py-3.5"
                  placeholder="Subject, example: Heart Health"
                  value={newSubject}
                  onChange={(event) => setNewSubject(event.target.value)}
                />

                <textarea
                  className="min-h-[100px] rounded-[1.2rem] border border-white/10 bg-slate-950/70 px-4 py-3.5 text-white outline-none placeholder:text-slate-500"
                  placeholder="Short description"
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                />

                <button
                  type="button"
                  onClick={handleCreateRoom}
                  disabled={savingNew}
                  className="premium-button rounded-[1.2rem] px-4 py-3.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingNew ? "Creating..." : "Create room"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {(error || message) ? (
          <section
            className={`rounded-[1.5rem] border p-4 text-sm font-bold ${
              error
                ? "border-red-400/20 bg-red-500/10 text-red-200"
                : "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
            }`}
          >
            {error || message}
          </section>
        ) : null}

        <section className="premium-card gold-border rounded-[2rem] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="gold-chip mb-4">All rooms</div>
              <h3 className="panel-title text-white">Compact room list</h3>
              <p className="panel-muted mt-3">
                No more giant grid. Search, choose, and open what you need.
              </p>
            </div>

            <button
              type="button"
              onClick={loadRooms}
              disabled={loading}
              className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white transition hover:bg-white/[0.08]"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {filteredRooms.length === 0 ? (
            <div className="empty-state mt-6">
              {rooms.length === 0
                ? "No rooms yet. Create your first topic workspace."
                : "No rooms match your search."}
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {filteredRooms.map((room) => {
                const active = room.id === selectedRoomId;

                return (
                  <div
                    key={room.id}
                    className={`rounded-[1.35rem] border p-4 transition ${
                      active
                        ? "border-yellow-300/35 bg-yellow-300/10"
                        : "border-white/10 bg-white/[0.03] hover:border-yellow-300/25 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <button
                        type="button"
                        onClick={() => selectRoom(room.id)}
                        className="min-w-0 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-yellow-300/20 bg-yellow-300/10 px-3 py-1 text-xs font-black text-yellow-100">
                            {room.subject || "No subject"}
                          </span>

                          {active ? (
                            <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-100">
                              Selected
                            </span>
                          ) : null}
                        </div>

                        <h4 className="mt-3 text-lg font-black text-white">
                          {room.name}
                        </h4>

                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
                          {room.description || "Open project workspace."}
                        </p>
                      </button>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => selectRoom(room.id)}
                          className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-white"
                        >
                          Select
                        </button>

                        <button
                          type="button"
                          onClick={() => openRoom(room.id)}
                          className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-4 py-2 text-sm font-black text-yellow-100"
                        >
                          Open →
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
