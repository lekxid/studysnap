"use client";

// STUDYSNAP_LECTURE_AI_TRANSCRIPT_HANDOFF_V1_2_2

import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import AppShell from "@/components/AppShell";
import {
  getSavedProjectRoomId,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";
import useRequireAuth from "@/hooks/useRequireAuth";
import { setPendingAIAttachment } from "@/lib/aiAttachmentHandoff";
import {
  createNote,
  deleteStudyMaterial,
  getLectureMetadata,
  getStudyMaterialBlob,
  getStudyMaterialPreview,
  getStudyMaterials,
  getStudyRooms,
  transcribeLectureMaterial,
  updateLectureMetadata,
  uploadResumableMaterial,
  type LectureBookmark,
  type LectureMetadata,
  type StudyMaterialItem,
  type StudyRoom,
} from "@/lib/api";

type RecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "paused"
  | "saving";

type LectureRecord = {
  material: StudyMaterialItem;
  metadata: LectureMetadata;
};

type TranscriptPanel = {
  materialId: number;
  title: string;
  text: string;
} | null;

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
  }

  return [minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function friendlyDate(value: string | null | undefined) {
  if (!value) return "Recently recorded";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently recorded";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function defaultLectureTitle(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/^lecture[-_]?/i, "Lecture ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function supportedRecordingType() {
  if (typeof MediaRecorder === "undefined") return "";

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  return (
    candidates.find((candidate) =>
      MediaRecorder.isTypeSupported(candidate),
    ) || ""
  );
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function makeBookmarkId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `bookmark-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function LecturesPage() {
  const ready = useRequireAuth();
  const router = useRouter();

  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [lectures, setLectures] = useState<LectureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [recordingTitle, setRecordingTitle] = useState("New lecture");
  const [liveBookmarks, setLiveBookmarks] = useState<LectureBookmark[]>([]);

  const [transcribingId, setTranscribingId] = useState<number | null>(null);
  const [handoffId, setHandoffId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [creatingNoteId, setCreatingNoteId] = useState<number | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<number | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<number, string>>({});
  const [transcriptPanel, setTranscriptPanel] = useState<TranscriptPanel>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const elapsedSecondsRef = useRef(0);
  const bookmarksRef = useRef<LectureBookmark[]>([]);
  const audioUrlsRef = useRef<Record<number, string>>({});
  const audioElementsRef = useRef<Record<number, HTMLAudioElement | null>>({});

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  const isRecording =
    recorderState === "recording" || recorderState === "paused";

  useEffect(() => {
    audioUrlsRef.current = audioUrls;
  }, [audioUrls]);

  useEffect(() => {
    bookmarksRef.current = liveBookmarks;
  }, [liveBookmarks]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }

      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());

      Object.values(audioUrlsRef.current).forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  useEffect(() => {
    if (!isRecording) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isRecording]);

  async function loadLectures(roomId: number) {
    const response = await getStudyMaterials(roomId);
    const lectureMaterials = response.materials.filter(
      (material) =>
        material.material_type === "audio" || material.material_type === "video",
    );

    const records = await Promise.all(
      lectureMaterials.map(async (material) => {
        try {
          const metadata = await getLectureMetadata(material.id);
          return { material, metadata };
        } catch {
          return {
            material,
            metadata: {
              material_id: material.id,
              title:
                defaultLectureTitle(material.original_filename) ||
                "Recorded lecture",
              duration_seconds: 0,
              recorded_at: material.created_at,
              consent_confirmed: false,
              bookmarks: [],
            },
          } satisfies LectureRecord;
        }
      }),
    );

    setLectures(records);
  }

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function initialize() {
      try {
        setLoading(true);
        setError("");

        const roomList = await getStudyRooms();

        if (cancelled) return;

        setRooms(roomList);

        const queryRoomId = Number(
          new URLSearchParams(window.location.search).get("roomId"),
        );
        const savedRoomId = getSavedProjectRoomId();
        const preferredRoomId =
          Number.isFinite(queryRoomId) && queryRoomId > 0
            ? queryRoomId
            : savedRoomId;

        const nextRoom =
          roomList.find((room) => room.id === preferredRoomId) ??
          roomList[0] ??
          null;

        setSelectedRoomId(nextRoom?.id ?? null);

        if (nextRoom) {
          saveProjectRoomId(nextRoom.id);
          await loadLectures(nextRoom.id);
        } else {
          setLectures([]);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Lecture Library could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [ready]);

  async function handleRoomChange(roomId: number) {
    if (isRecording || recorderState === "saving") return;

    try {
      setSelectedRoomId(roomId);
      saveProjectRoomId(roomId);
      setLoading(true);
      setError("");
      setNotice("");
      await loadLectures(roomId);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Lectures could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveRecording(mimeType: string) {
    const roomId = selectedRoomId;
    const durationSeconds = elapsedSecondsRef.current;
    const bookmarks = bookmarksRef.current;

    if (!roomId) {
      setError("Choose a study room before saving the lecture.");
      setRecorderState("idle");
      return;
    }

    const recording = new Blob(recordingChunksRef.current, {
      type: mimeType || "audio/webm",
    });

    recordingChunksRef.current = [];

    if (recording.size === 0) {
      setError("The browser did not capture any audio. Try recording again.");
      setRecorderState("idle");
      return;
    }

    const extension = extensionForMimeType(recording.type);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = new File(
      [recording],
      `lecture-${timestamp}-${durationSeconds}s.${extension}`,
      { type: recording.type || "audio/webm" },
    );

    try {
      setUploadProgress(0);
      setError("");
      setNotice("Saving your recording securely…");

      const uploaded = await uploadResumableMaterial({
        file,
        studyRoomId: roomId,
        onProgress: setUploadProgress,
      });

      await updateLectureMetadata(uploaded.id, {
        title: recordingTitle.trim() || "Recorded lecture",
        duration_seconds: durationSeconds,
        recorded_at: new Date().toISOString(),
        consent_confirmed: consentConfirmed,
        bookmarks,
      });

      setNotice("Recording saved.");
      await loadLectures(roomId);

      if (autoTranscribe) {
        setTranscribingId(uploaded.id);
        setNotice("Recording saved. Creating the transcript…");

        try {
          await transcribeLectureMaterial(uploaded.id);
          setNotice("Lecture saved and transcribed.");
          await loadLectures(roomId);
        } catch (transcriptionError) {
          setNotice("");
          setError(
            transcriptionError instanceof Error
              ? transcriptionError.message
              : "The recording was saved, but transcription did not finish.",
          );
        } finally {
          setTranscribingId(null);
        }
      }
    } catch (saveError) {
      setNotice("");
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The lecture recording could not be saved.",
      );
    } finally {
      setRecorderState("idle");
      setUploadProgress(0);
      setElapsedSeconds(0);
      elapsedSecondsRef.current = 0;
      setLiveBookmarks([]);
      bookmarksRef.current = [];
      setRecordingTitle("New lecture");
    }
  }

  async function startRecording() {
    if (!selectedRoomId) {
      setError("Create or choose a study room before recording a lecture.");
      return;
    }

    if (!consentConfirmed) {
      setError("Confirm that you have permission to record this lecture.");
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "This browser cannot record audio here. Use a current browser over HTTPS or localhost.",
      );
      return;
    }

    try {
      setRecorderState("requesting");
      setError("");
      setNotice("");
      setUploadProgress(0);
      setElapsedSeconds(0);
      elapsedSecondsRef.current = 0;
      setLiveBookmarks([]);
      bookmarksRef.current = [];
      recordingChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeType = supportedRecordingType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener(
        "stop",
        () => {
          void saveRecording(recorder.mimeType);
        },
        { once: true },
      );

      recorder.addEventListener("error", () => {
        setError("The browser stopped recording unexpectedly.");
        setRecorderState("idle");
      });

      recorder.start(1000);
      setRecorderState("recording");

      timerRef.current = window.setInterval(() => {
        if (mediaRecorderRef.current?.state !== "recording") return;

        elapsedSecondsRef.current += 1;
        setElapsedSeconds(elapsedSecondsRef.current);
      }, 1000);
    } catch (recordError) {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setRecorderState("idle");
      setError(
        recordError instanceof Error
          ? recordError.message
          : "Microphone access was not granted.",
      );
    }
  }

  function pauseOrResumeRecording() {
    const recorder = mediaRecorderRef.current;

    if (!recorder) return;

    if (recorder.state === "recording") {
      recorder.pause();
      setRecorderState("paused");
      return;
    }

    if (recorder.state === "paused") {
      recorder.resume();
      setRecorderState("recording");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === "inactive") return;

    setRecorderState("saving");

    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    recorder.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  }

  function addBookmark() {
    const nextBookmark: LectureBookmark = {
      id: makeBookmarkId(),
      offset_seconds: elapsedSecondsRef.current,
      label: `Bookmark ${liveBookmarks.length + 1}`,
    };

    setLiveBookmarks((current) => [...current, nextBookmark]);
  }

  async function loadAudio(material: StudyMaterialItem) {
    const existing = audioUrlsRef.current[material.id];

    if (existing) return existing;

    try {
      setLoadingAudioId(material.id);
      setError("");
      const blob = await getStudyMaterialBlob(material.id);
      const url = URL.createObjectURL(blob);

      setAudioUrls((current) => ({
        ...current,
        [material.id]: url,
      }));

      return url;
    } catch (audioError) {
      setError(
        audioError instanceof Error
          ? audioError.message
          : "The lecture audio could not be loaded.",
      );
      return null;
    } finally {
      setLoadingAudioId(null);
    }
  }

  async function jumpToBookmark(record: LectureRecord, offsetSeconds: number) {
    const url = await loadAudio(record.material);

    if (!url) return;

    window.setTimeout(() => {
      const audio = audioElementsRef.current[record.material.id];

      if (!audio) return;

      audio.currentTime = offsetSeconds;
      void audio.play().catch(() => undefined);
    }, 0);
  }

  async function handleTranscribe(record: LectureRecord) {
    try {
      setTranscribingId(record.material.id);
      setError("");
      setNotice("Creating a timestamp-ready transcript…");
      await transcribeLectureMaterial(record.material.id);
      setNotice("Transcript ready.");

      if (selectedRoomId) {
        await loadLectures(selectedRoomId);
      }
    } catch (transcriptionError) {
      setNotice("");
      setError(
        transcriptionError instanceof Error
          ? transcriptionError.message
          : "Transcription did not finish.",
      );
    } finally {
      setTranscribingId(null);
    }
  }

  async function openTranscript(record: LectureRecord) {
    try {
      setError("");
      const preview = await getStudyMaterialPreview(record.material.id);
      setTranscriptPanel({
        materialId: record.material.id,
        title: record.metadata.title,
        text: preview.text,
      });
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "The transcript could not be opened.",
      );
    }
  }

  async function askStudyAI(record: LectureRecord) {
    if (handoffId !== null) return;

    try {
      setHandoffId(record.material.id);
      setError("");
      setNotice(
        record.material.preview_available
          ? "Opening the lecture transcript in Study AI…"
          : "Transcribing the lecture before opening Study AI…",
      );

      let transcript = "";

      if (record.material.preview_available) {
        const preview = await getStudyMaterialPreview(record.material.id);
        transcript = preview.text.trim();
      } else {
        const result = await transcribeLectureMaterial(record.material.id);
        transcript = result.transcript.trim();
      }

      if (!transcript) {
        throw new Error(
          "Study AI needs a transcript before it can work with this lecture.",
        );
      }

      const safeTitle =
        record.metadata.title
          .trim()
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase() || "lecture";

      const lectureContext = [
        `Lecture: ${record.metadata.title || "Recorded lecture"}`,
        `Recorded: ${record.metadata.recorded_at || "Not recorded"}`,
        `Duration: ${formatDuration(record.metadata.duration_seconds)}`,
        "",
        "Transcript:",
        transcript,
      ].join("\n");

      const transcriptFile = new File(
        [lectureContext],
        `${safeTitle}-transcript.txt`,
        { type: "text/plain" },
      );

      setPendingAIAttachment(transcriptFile);
      saveProjectRoomId(record.material.study_room_id);
      router.push(`/general-ai?roomId=${record.material.study_room_id}`);
    } catch (handoffError) {
      setNotice("");
      setError(
        handoffError instanceof Error
          ? handoffError.message
          : "The lecture transcript could not be sent to Study AI.",
      );
    } finally {
      setHandoffId(null);
    }
  }

  async function saveTranscriptAsNote(record: LectureRecord) {
    try {
      setCreatingNoteId(record.material.id);
      setError("");
      const preview = await getStudyMaterialPreview(record.material.id);

      await createNote(
        record.material.study_room_id,
        `${record.metadata.title} — Transcript`,
        preview.text,
      );

      setNotice("Transcript saved to Notes.");
    } catch (noteError) {
      setError(
        noteError instanceof Error
          ? noteError.message
          : "The transcript could not be saved as a note.",
      );
    } finally {
      setCreatingNoteId(null);
    }
  }

  async function removeLecture(record: LectureRecord) {
    const confirmed = window.confirm(
      `Delete “${record.metadata.title}”? This removes the recording and transcript.`,
    );

    if (!confirmed) return;

    try {
      setDeletingId(record.material.id);
      setError("");
      await deleteStudyMaterial(record.material.id);

      const url = audioUrlsRef.current[record.material.id];

      if (url) {
        URL.revokeObjectURL(url);
        setAudioUrls((current) => {
          const next = { ...current };
          delete next[record.material.id];
          return next;
        });
      }

      setLectures((current) =>
        current.filter((item) => item.material.id !== record.material.id),
      );
      setNotice("Lecture deleted.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The lecture could not be deleted.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (!ready) {
    return null;
  }

  return (
    <AppShell
      title="Lecture Library"
      subtitle="Record classes, keep the audio, create transcripts, and continue with Study AI."
    >
      <div className="space-y-5">
        <section className="overflow-hidden rounded-[1.8rem] border border-[#d6b84a]/20 bg-[radial-gradient(circle_at_top_right,rgba(214,184,74,0.12),transparent_34%),linear-gradient(145deg,rgba(16,18,20,0.98),rgba(5,7,9,0.99))] shadow-[0_26px_80px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-[#d6b84a]/25 bg-[#d6b84a]/10 text-xl text-[#e3c75d]">
                  ◉
                </span>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#cdbb75]">
                    Lecture Capture
                  </p>
                  <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">
                    {isRecording || recorderState === "saving"
                      ? "Recording in progress"
                      : "Ready for your next class"}
                  </h2>
                </div>
              </div>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">
                Record only when your instructor and everyone involved permits it.
                StudySnap keeps the original audio and never labels a lecture
                transcribed until real transcript text exists.
              </p>

              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.08] bg-black/30 p-4">
                <input
                  type="checkbox"
                  checked={consentConfirmed}
                  disabled={isRecording || recorderState === "saving"}
                  onChange={(event) => setConsentConfirmed(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-[#d6b84a]"
                />
                <span>
                  <span className="block text-sm font-black text-white">
                    I have permission to record this lecture
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    Recording rules vary by school, instructor, location, and
                    situation. Ask before recording.
                  </span>
                </span>
              </label>
            </div>

            <div className="rounded-[1.5rem] border border-white/[0.08] bg-black/35 p-4 sm:p-5">
              <label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Study room
              </label>
              <select
                value={selectedRoomId ?? ""}
                disabled={isRecording || recorderState === "saving"}
                onChange={(event) => void handleRoomChange(Number(event.target.value))}
                className="mt-2 w-full rounded-xl border border-white/[0.1] bg-[#080a0d] px-3 py-3 text-sm font-bold text-white outline-none focus:border-[#d6b84a]/45"
              >
                {rooms.length === 0 ? (
                  <option value="">No study rooms yet</option>
                ) : null}
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>

              <label className="mt-4 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Lecture title
              </label>
              <input
                value={recordingTitle}
                disabled={isRecording || recorderState === "saving"}
                onChange={(event) => setRecordingTitle(event.target.value)}
                placeholder="e.g. Week 4 — Vital signs"
                className="mt-2 w-full rounded-xl border border-white/[0.1] bg-[#080a0d] px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-600 focus:border-[#d6b84a]/45"
              />

              <label className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3">
                <span>
                  <span className="block text-xs font-black text-white">
                    Auto-transcribe
                  </span>
                  <span className="mt-0.5 block text-[10px] text-slate-500">
                    Starts after upload
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={autoTranscribe}
                  disabled={isRecording || recorderState === "saving"}
                  onChange={(event) => setAutoTranscribe(event.target.checked)}
                  className="h-4 w-4 accent-[#d6b84a]"
                />
              </label>
            </div>
          </div>

          <div
            className={`border-t px-5 py-5 sm:px-7 ${
              isRecording || recorderState === "saving"
                ? "border-red-500/20 bg-red-950/20"
                : "border-white/[0.07] bg-black/20"
            }`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full ${
                    recorderState === "recording"
                      ? "animate-pulse bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.8)]"
                      : recorderState === "paused"
                        ? "bg-amber-400"
                        : recorderState === "saving"
                          ? "animate-pulse bg-cyan-400"
                          : "bg-slate-700"
                  }`}
                />
                <div>
                  <p className="text-sm font-black text-white">
                    {recorderState === "requesting"
                      ? "Waiting for microphone permission…"
                      : recorderState === "recording"
                        ? "Recording — speak normally"
                        : recorderState === "paused"
                          ? "Recording paused"
                          : recorderState === "saving"
                            ? `Saving recording… ${uploadProgress}%`
                            : "Microphone is off"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {isRecording || recorderState === "saving"
                      ? formatDuration(elapsedSeconds)
                      : selectedRoom
                        ? `Saving to ${selectedRoom.name}`
                        : "Choose a room to begin"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isRecording ? (
                  <>
                    <button
                      type="button"
                      onClick={addBookmark}
                      className="rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/[0.09]"
                    >
                      + Bookmark
                    </button>
                    <button
                      type="button"
                      onClick={pauseOrResumeRecording}
                      className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-2.5 text-sm font-black text-amber-100 transition hover:bg-amber-400/15"
                    >
                      {recorderState === "paused" ? "Resume" : "Pause"}
                    </button>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white shadow-[0_14px_35px_rgba(220,38,38,0.24)] transition hover:bg-red-500"
                    >
                      Stop & save
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startRecording()}
                    disabled={
                      recorderState !== "idle" ||
                      !selectedRoomId ||
                      !consentConfirmed
                    }
                    className="rounded-xl bg-[#d6b84a] px-5 py-3 text-sm font-black text-[#11100a] shadow-[0_16px_38px_rgba(214,184,74,0.2)] transition hover:bg-[#e3c85f] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {recorderState === "requesting"
                      ? "Opening microphone…"
                      : recorderState === "saving"
                        ? "Saving…"
                        : "Record lecture"}
                  </button>
                )}
              </div>
            </div>

            {liveBookmarks.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {liveBookmarks.map((bookmark) => (
                  <span
                    key={bookmark.id}
                    className="rounded-full border border-white/[0.08] bg-black/35 px-3 py-1.5 text-[11px] font-bold text-slate-300"
                  >
                    {bookmark.label} · {formatDuration(bookmark.offset_seconds)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
            {notice}
          </div>
        ) : null}

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Saved recordings
              </p>
              <h2 className="mt-1 text-xl font-black text-white">
                {selectedRoom?.name || "Lecture Library"}
              </h2>
            </div>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-xs font-black text-slate-400">
              {lectures.length} {lectures.length === 1 ? "lecture" : "lectures"}
            </span>
          </div>

          {loading ? (
            <div className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.025] p-6 text-sm font-bold text-slate-400">
              Loading Lecture Library…
            </div>
          ) : rooms.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-white/[0.12] bg-white/[0.02] p-8 text-center">
              <h3 className="text-lg font-black text-white">Create a study room first</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                Every lecture stays connected to a subject, its notes, practice,
                planner, and Study AI history.
              </p>
              <button
                type="button"
                onClick={() => router.push("/study-rooms")}
                className="mt-5 rounded-xl bg-[#d6b84a] px-5 py-3 text-sm font-black text-[#11100a]"
              >
                Open Study Rooms
              </button>
            </div>
          ) : lectures.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-white/[0.12] bg-white/[0.02] p-8 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.035] text-2xl text-[#d6b84a]">
                ◉
              </span>
              <h3 className="mt-4 text-lg font-black text-white">No lectures recorded yet</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                Confirm permission, give the lecture a useful title, and press
                Record lecture. StudySnap will keep the original audio even if
                transcription needs to be retried.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {lectures.map((record) => {
                const transcribed = record.material.preview_available;
                const audioUrl = audioUrls[record.material.id];

                return (
                  <article
                    key={record.material.id}
                    className="rounded-[1.5rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(13,16,19,0.96),rgba(5,7,9,0.99))] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-violet-400/15 bg-violet-500/10 text-xl text-violet-300">
                          ◉
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-black text-white sm:text-lg">
                            {record.metadata.title}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-slate-500">
                            <span>{friendlyDate(record.metadata.recorded_at || record.material.created_at)}</span>
                            <span>{formatDuration(record.metadata.duration_seconds)}</span>
                            <span>{Math.max(1, Math.round(record.material.file_size / 1024 / 1024))} MB</span>
                            {record.metadata.bookmarks.length > 0 ? (
                              <span>{record.metadata.bookmarks.length} bookmarks</span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                                transcribed
                                  ? "bg-emerald-400/10 text-emerald-300"
                                  : record.material.intelligence_status === "failed"
                                    ? "bg-red-400/10 text-red-300"
                                    : "bg-amber-400/10 text-amber-200"
                              }`}
                            >
                              {transcribed
                                ? "Transcribed"
                                : record.material.intelligence_status === "failed"
                                  ? "Transcript retry needed"
                                  : "Audio saved"}
                            </span>
                            <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                              Private
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {transcribed ? (
                          <button
                            type="button"
                            onClick={() => void openTranscript(record)}
                            className="rounded-xl border border-white/[0.09] bg-white/[0.04] px-3.5 py-2 text-xs font-black text-white transition hover:bg-white/[0.08]"
                          >
                            Transcript
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={transcribingId === record.material.id}
                            onClick={() => void handleTranscribe(record)}
                            className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-400/15 disabled:opacity-50"
                          >
                            {transcribingId === record.material.id
                              ? "Transcribing…"
                              : "Transcribe"}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={handoffId !== null}
                          onClick={() => void askStudyAI(record)}
                          title="Study AI receives the lecture transcript, never an unsupported audio attachment."
                          className="rounded-xl bg-[#d6b84a] px-3.5 py-2 text-xs font-black text-[#11100a] transition hover:bg-[#e3c85f] disabled:cursor-wait disabled:opacity-60"
                        >
                          {handoffId === record.material.id
                            ? record.material.preview_available
                              ? "Opening Study AI…"
                              : "Transcribing…"
                            : "Ask Study AI"}
                        </button>
                        {transcribed ? (
                          <button
                            type="button"
                            disabled={creatingNoteId === record.material.id}
                            onClick={() => void saveTranscriptAsNote(record)}
                            className="rounded-xl border border-white/[0.09] bg-white/[0.04] px-3.5 py-2 text-xs font-black text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
                          >
                            {creatingNoteId === record.material.id
                              ? "Saving…"
                              : "Save as note"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={deletingId === record.material.id}
                          onClick={() => void removeLecture(record)}
                          className="rounded-xl border border-red-500/15 bg-red-500/[0.06] px-3.5 py-2 text-xs font-black text-red-200 transition hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {deletingId === record.material.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/30 p-3">
                      {audioUrl ? (
                        <audio
                          ref={(element) => {
                            audioElementsRef.current[record.material.id] = element;
                          }}
                          controls
                          preload="metadata"
                          src={audioUrl}
                          className="h-10 w-full"
                        />
                      ) : (
                        <button
                          type="button"
                          disabled={loadingAudioId === record.material.id}
                          onClick={() => void loadAudio(record.material)}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm font-black text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-50"
                        >
                          <span aria-hidden="true">▶</span>
                          {loadingAudioId === record.material.id
                            ? "Loading recording…"
                            : "Load recording"}
                        </button>
                      )}
                    </div>

                    {record.metadata.bookmarks.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {record.metadata.bookmarks.map((bookmark) => (
                          <button
                            key={bookmark.id}
                            type="button"
                            onClick={() =>
                              void jumpToBookmark(record, bookmark.offset_seconds)
                            }
                            className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
                          >
                            {bookmark.label} · {formatDuration(bookmark.offset_seconds)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {transcriptPanel ? (
        <div className="fixed inset-0 z-[120] grid place-items-end bg-black/75 p-0 backdrop-blur-sm sm:place-items-center sm:p-5">
          <button
            type="button"
            aria-label="Close transcript"
            onClick={() => setTranscriptPanel(null)}
            className="absolute inset-0"
          />
          <section className="relative z-10 flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[1.8rem] border border-white/[0.1] bg-[#080b0e] shadow-[0_35px_120px_rgba(0,0,0,0.65)] sm:rounded-[1.8rem]">
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
                  Transcript
                </p>
                <h2 className="mt-1 truncate text-lg font-black text-white">
                  {transcriptPanel.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setTranscriptPanel(null)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.09] bg-white/[0.04] text-lg text-slate-300"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5 sm:px-6">
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">
                {transcriptPanel.text}
              </p>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
