"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import {
  createStudyRoom,
  deleteStudyRoom,
  getStudyRooms,
  updateStudyRoom,
} from "@/lib/api";

type StudyRoom = {
  id: number;
  name: string;
  subject: string;
  description?: string | null;
};

export default function StudyRoomsPage() {
  const ready = useRequireAuth();
  const router = useRouter();

  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  async function loadRooms() {
    try {
      const data = await getStudyRooms();
      setRooms(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load study rooms";
      setError(message);
    }
  }

  useEffect(() => {
    if (!ready) return;
    loadRooms();
  }, [ready]);

  async function handleCreate() {
    if (!name.trim()) {
      setError("Please enter a study room name.");
      return;
    }

    if (!subject.trim()) {
      setError("Please enter a subject.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await createStudyRoom(name, subject, description);
      setName("");
      setSubject("");
      setDescription("");
      await loadRooms();
      setSuccess("Study room created successfully.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create study room";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      setError("");
      setSuccess("");
      await deleteStudyRoom(id);
      await loadRooms();
      setSuccess("Study room deleted successfully.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to delete study room";
      setError(message);
    }
  }

  function startEdit(room: StudyRoom) {
    setEditingRoomId(room.id);
    setEditName(room.name);
    setEditSubject(room.subject);
    setEditDescription(room.description || "");
    setError("");
    setSuccess("");
  }

  function cancelEdit() {
    setEditingRoomId(null);
    setEditName("");
    setEditSubject("");
    setEditDescription("");
  }

  async function handleSaveEdit() {
    if (!editingRoomId) return;

    if (!editName.trim()) {
      setError("Please enter a room name.");
      return;
    }

    if (!editSubject.trim()) {
      setError("Please enter a subject.");
      return;
    }

    try {
      setSavingEdit(true);
      setError("");
      setSuccess("");
      await updateStudyRoom(editingRoomId, editName, editSubject, editDescription);
      await loadRooms();
      cancelEdit();
      setSuccess("Study room updated successfully.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update study room";
      setError(message);
    } finally {
      setSavingEdit(false);
    }
  }

  if (!ready) {
    return <div className="min-h-screen bg-black text-white p-6">Checking authentication...</div>;
  }

  return (
    <AppShell title="Study Rooms" subtitle="Create and organize your real study projects">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-xl font-semibold text-cyan-300">Create Study Room</h3>

          <div className="mt-4 space-y-4">
            <input
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30"
              placeholder="Room name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />

            <textarea
              className="min-h-[120px] w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-black disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Room"}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-xl font-semibold text-cyan-300">Your Study Rooms</h3>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-green-300">
              {success}
            </div>
          ) : null}

          {rooms.length === 0 ? (
            <div className="mt-6 rounded-xl bg-white/5 p-6 text-white/70">
              No study rooms yet. Create your first one now.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="rounded-2xl border border-white/10 bg-black p-5"
                >
                  {editingRoomId === room.id ? (
                    <div className="space-y-3">
                      <input
                        className="w-full rounded-xl border border-white/20 bg-[#0a1022] px-4 py-3 text-white outline-none"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Room name"
                      />

                      <input
                        className="w-full rounded-xl border border-white/20 bg-[#0a1022] px-4 py-3 text-white outline-none"
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        placeholder="Subject"
                      />

                      <textarea
                        className="min-h-[100px] w-full rounded-xl border border-white/20 bg-[#0a1022] px-4 py-3 text-white outline-none"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Description"
                      />

                      <div className="flex gap-3">
                        <button
                          onClick={handleSaveEdit}
                          disabled={savingEdit}
                          className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                        >
                          {savingEdit ? "Saving..." : "Save"}
                        </button>

                        <button
                          onClick={cancelEdit}
                          className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4 className="text-lg font-semibold text-cyan-300">{room.name}</h4>
                      <p className="mt-2 text-sm text-yellow-300">{room.subject}</p>
                      <p className="mt-3 min-h-[48px] text-sm text-white/70">
                        {room.description || "No description yet."}
                      </p>

                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          onClick={() => router.push(`/study-rooms/${room.id}`)}
                          className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-black"
                        >
                          Open
                        </button>

                        <button
                          onClick={() => startEdit(room)}
                          className="rounded-xl border border-yellow-400/30 px-4 py-2 text-sm font-semibold text-yellow-300"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => handleDelete(room.id)}
                          className="rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
