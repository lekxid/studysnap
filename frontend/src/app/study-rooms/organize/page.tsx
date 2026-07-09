"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import { getToken } from "@/lib/api";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  "http://192.168.133.130:8000";

type PreviewFile = {
  file_index: number;
  filename: string;
  size: number;
  content_type: string;
  material_type: string;
  topic: string;
  confidence: number;
  reason: string;
  suggested_room_id: number | null;
  suggested_room_name: string | null;
};

type PreviewGroup = {
  topic: string;
  confidence: number;
  suggested_room_id: number | null;
  suggested_room_name: string | null;
  files: PreviewFile[];
};

type PreviewResponse = {
  groups: PreviewGroup[];
  files: PreviewFile[];
  existing_rooms: {
    id: number;
    name: string;
    subject: string;
    description?: string | null;
  }[];
};

type OrganizeResponse = {
  organized_count: number;
  rooms: {
    id: number;
    name: string;
    subject: string;
  }[];
  items: {
    filename: string;
    material_type: string;
    topic: string;
    saved_as: string;
    saved_id: number;
    room: {
      id: number;
      name: string;
      subject: string;
    };
  }[];
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function parseResponse(response: Response) {
  const raw = await response.text();

  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return { message: raw || "Unexpected server response." };
  }
}

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export default function SmartOrganizerPage() {
  const ready = useRequireAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [noteTitle, setNoteTitle] = useState("Pasted Study Note");
  const [longNote, setLongNote] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<OrganizeResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const totalMaterials = files.length + (longNote.trim() ? 1 : 0);

  const totalTopics = useMemo(() => preview?.groups.length || 0, [preview]);

  const canPreview = totalMaterials > 0;

  function appendFiles(selected: File[]) {
    setFiles((current) => {
      const existing = new Set(current.map(fileKey));
      const next = [...current];

      for (const file of selected) {
        const key = fileKey(file);

        if (!existing.has(key)) {
          next.push(file);
          existing.add(key);
        }
      }

      return next;
    });

    setPreview(null);
    setResult(null);
    setMessage("");
    setError("");

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setPreview(null);
    setResult(null);
  }

  function resetAll() {
    setFiles([]);
    setLongNote("");
    setNoteTitle("Pasted Study Note");
    setPreview(null);
    setResult(null);
    setMessage("");
    setError("");

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function buildFormData(includeAssignments: boolean) {
    const formData = new FormData();

    files.forEach((file) => {
      formData.append("files", file);
    });

    if (longNote.trim()) {
      formData.append("note_text", longNote.trim());
      formData.append("note_title", noteTitle.trim() || "Pasted Study Note");
    }

    if (includeAssignments && preview) {
      const assignments: Record<string, string> = {};

      preview.files.forEach((file) => {
        assignments[String(file.file_index)] = file.topic;
      });

      formData.append("assignments_json", JSON.stringify(assignments));
    }

    return formData;
  }

  async function previewOrganization() {
    if (!canPreview) {
      setError("Choose files or paste a long note first.");
      return;
    }

    const token = getToken();

    if (!token) {
      setError("Not authenticated. Please log in again.");
      return;
    }

    try {
      setPreviewing(true);
      setError("");
      setMessage("");
      setResult(null);

      const response = await fetch(`${API_BASE}/api/smart-organizer/preview`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: buildFormData(false),
      });

      const data = await parseResponse(response);

      if (!response.ok) {
        throw new Error(data?.detail || data?.message || "Preview failed.");
      }

      setPreview(data as PreviewResponse);
      setMessage("StudySnap detected your topics. Review them before organizing.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setPreviewing(false);
    }
  }

  async function organizeMaterials() {
    if (!preview) {
      setError("Preview the materials first.");
      return;
    }

    const token = getToken();

    if (!token) {
      setError("Not authenticated. Please log in again.");
      return;
    }

    try {
      setOrganizing(true);
      setError("");
      setMessage("");

      const response = await fetch(`${API_BASE}/api/smart-organizer/organize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: buildFormData(true),
      });

      const data = await parseResponse(response);

      if (!response.ok) {
        throw new Error(data?.detail || data?.message || "Organization failed.");
      }

      const organized = data as OrganizeResponse;
      setResult(organized);
      setMessage(
        `Done. StudySnap organized ${organized.organized_count} material${organized.organized_count === 1 ? "" : "s"} into ${organized.rooms.length} room${organized.rooms.length === 1 ? "" : "s"}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Organization failed.");
    } finally {
      setOrganizing(false);
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
      title="Smart Organizer"
      subtitle="Upload files, screenshots, PDFs, or long notes and let StudySnap organize them into rooms."
    >
      <div className="content-grid">
        <section className="hero-grid">
          <div className="gold-card rounded-[2rem] p-6 sm:p-8">
            <div className="gold-chip mb-4">AI Smart Room Organizer</div>

            <h3 className="panel-title text-white text-balance">
              Add many study materials. StudySnap sorts them by topic.
            </h3>

            <p className="panel-muted mt-4 max-w-2xl">
              Add PDFs, screenshots, images, text files, or paste a long note.
              StudySnap detects topics, creates missing rooms, and saves each
              material where it belongs.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Materials</p>
                <p className="mt-3 text-2xl font-black text-cyan-300">
                  {totalMaterials}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Detected topics</p>
                <p className="mt-3 text-2xl font-black text-amber-300">
                  {totalTopics}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Status</p>
                <p className="mt-3 text-lg font-black text-emerald-300">
                  {result ? "Organized" : preview ? "Ready" : "Waiting"}
                </p>
              </div>
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Supported now</div>
            <h3 className="panel-title text-white">Material types</h3>

            <div className="mt-5 grid gap-3">
              {[
                "PDFs are saved as room PDFs.",
                "Long pasted notes and text files are saved as room notes.",
                "Images/screenshots are stored as room materials with a note record.",
                "Word, PowerPoint, and other files are stored by topic for now.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4 text-sm font-bold text-slate-200"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Upload batch</div>
            <h3 className="panel-title text-white">Choose files</h3>
            <p className="panel-muted mt-3">
              You can select many files at once, or choose files multiple times
              and StudySnap will keep adding them to the batch.
            </p>

            <div className="mt-5 rounded-[1.5rem] border border-dashed border-white/15 bg-black/25 p-5">
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="application/pdf,image/*,.txt,.md,.csv,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                className="w-full rounded-[1.2rem] border border-white/10 bg-slate-950/70 px-4 py-3.5 text-white"
                onChange={(event) => {
                  appendFiles(Array.from(event.target.files || []));
                }}
              />

              {files.length > 0 ? (
                <div className="mt-4 grid gap-2">
                  {files.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300"
                    >
                      <div>
                        <span className="font-black text-white">
                          {index + 1}. {file.name}
                        </span>{" "}
                        <span className="text-slate-500">
                          · {formatFileSize(file.size)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="rounded-lg border border-red-300/20 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-100"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state mt-4">
                  No files selected yet.
                </div>
              )}

              <div className="mt-6 grid gap-3">
                <input
                  className="rounded-[1.2rem] px-4 py-3.5"
                  placeholder="Long note title"
                  value={noteTitle}
                  onChange={(event) => {
                    setNoteTitle(event.target.value);
                    setPreview(null);
                    setResult(null);
                  }}
                />

                <textarea
                  className="min-h-[170px] rounded-[1.2rem] border border-white/10 bg-slate-950/70 px-4 py-3.5 text-white outline-none placeholder:text-slate-500"
                  placeholder="Paste a really long note here..."
                  value={longNote}
                  onChange={(event) => {
                    setLongNote(event.target.value);
                    setPreview(null);
                    setResult(null);
                  }}
                />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={previewOrganization}
                  disabled={previewing || organizing || !canPreview}
                  className="premium-button rounded-[1.2rem] px-4 py-3.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {previewing ? "Detecting topics..." : "Preview organization"}
                </button>

                <button
                  type="button"
                  onClick={resetAll}
                  disabled={previewing || organizing}
                  className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm font-black text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reset
                </button>
              </div>

              {error ? (
                <div className="mt-4 rounded-[1.2rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
                  {error}
                </div>
              ) : null}

              {message ? (
                <div className="mt-4 rounded-[1.2rem] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
                  {message}
                </div>
              ) : null}
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="gold-chip mb-4">Detected rooms</div>
                <h3 className="panel-title text-white">Organization preview</h3>
                <p className="panel-muted mt-3">
                  Review what StudySnap found before creating rooms.
                </p>
              </div>

              {preview ? (
                <button
                  type="button"
                  onClick={organizeMaterials}
                  disabled={organizing}
                  className="premium-button rounded-[1.2rem] px-5 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {organizing ? "Organizing..." : "Yes, organize"}
                </button>
              ) : null}
            </div>

            {!preview ? (
              <div className="empty-state mt-6">
                Preview will appear here after topic detection.
              </div>
            ) : (
              <div className="mt-6 grid gap-4">
                {preview.groups.map((group) => (
                  <div
                    key={group.topic}
                    className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-lg font-black text-white">
                          {group.topic}
                        </h4>
                        <p className="mt-1 text-sm text-slate-400">
                          {group.suggested_room_name
                            ? `Existing room: ${group.suggested_room_name}`
                            : "New room will be created"}
                        </p>
                      </div>

                      <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-100">
                        {group.confidence}% confidence
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2">
                      {group.files.map((file) => (
                        <div
                          key={`${file.file_index}-${file.filename}`}
                          className="rounded-[1rem] border border-white/8 bg-black/20 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-black text-white">
                              {file.filename}
                            </p>
                            <p className="text-xs font-bold text-cyan-200">
                              {file.material_type} · {formatFileSize(file.size)}
                            </p>
                          </div>

                          <p className="mt-1 text-xs leading-5 text-slate-400">
                            {file.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {result ? (
              <div className="mt-6 rounded-[1.5rem] border border-emerald-300/20 bg-emerald-400/10 p-5">
                <p className="text-sm font-black text-emerald-100">
                  Organized materials
                </p>

                <div className="mt-3 grid gap-2">
                  {result.items.map((item, index) => (
                    <div
                      key={`${item.filename}-${index}`}
                      className="rounded-[1rem] bg-black/20 px-4 py-3 text-sm text-slate-200"
                    >
                      <span className="font-black text-white">
                        {item.filename}
                      </span>{" "}
                      → {item.room.name} as {item.saved_as}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="gold-card rounded-[2rem] p-6">
          <div className="gold-chip mb-4">Next intelligence upgrade</div>
          <h3 className="panel-title text-white">
            Next: show all material types inside each Room.
          </h3>
          <p className="panel-muted mt-4 max-w-4xl">
            PDFs and text notes already connect to room learning. Images and
            other files are now stored as room materials, and the next step is
            adding a Materials panel inside every room with weak-topic and
            not-opened-in-a-while tracking.
          </p>

          <Link
            href="/study-rooms"
            className="premium-button mt-6 inline-flex rounded-[1.2rem] px-5 py-3 text-sm font-black"
          >
            View study rooms
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
