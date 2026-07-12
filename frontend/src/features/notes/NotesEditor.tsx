import NotesAIToolbar from "./NotesAIToolbar";
import { StudyRoom } from "./types";

type Props = {
  rooms: StudyRoom[];
  selectedRoomId: number | null;
  selectedRoom?: StudyRoom;
  title: string;
  content: string;
  wordCount: number;
  characterCount: number;
  loadingRooms: boolean;
  saving: boolean;
  saveStatus: "idle" | "saving" | "saved";
  error: string;
  onRoomChange: (roomId: number) => void;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSave: () => void;
  onSummarize: () => void;
  onExplain: () => void;
  onLesson: () => void;
  onFlashcards: () => void;
  onQuiz: () => void;
  onAskAI: () => void;
};

export default function NotesEditor({
  rooms,
  selectedRoomId,
  selectedRoom,
  title,
  content,
  wordCount,
  characterCount,
  loadingRooms,
  saving,
  saveStatus,
  error,
  onRoomChange,
  onTitleChange,
  onContentChange,
  onSave,
  onSummarize,
  onExplain,
  onLesson,
  onFlashcards,
  onQuiz,
  onAskAI,
}: Props) {
  const hasNoteContent = content.trim().length > 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0a1022] p-6 shadow-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
            Study Notes
          </p>
          <h3 className="mt-2 text-2xl font-bold text-white">
            Write a study note
          </h3>
          <p className="mt-2 text-sm text-white/60">
            Write naturally. StudySnap keeps this note connected to your room and AI Tutor.
          </p>
        </div>

        <div className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm text-white/70">
          {saveStatus === "saving"
            ? "Saving..."
            : saveStatus === "saved"
              ? "✓ Saved"
              : "Database ready"}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <NotesAIToolbar
          hasContent={hasNoteContent}
          onSummarize={onSummarize}
          onExplain={onExplain}
          onLesson={onLesson}
          onFlashcards={onFlashcards}
          onQuiz={onQuiz}
          onAskAI={onAskAI}
        />

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-white/70">
            Study Room
          </span>
          <select
            className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none transition focus:border-yellow-300"
            value={selectedRoomId ?? ""}
            onChange={(e) => onRoomChange(Number(e.target.value))}
            disabled={loadingRooms || rooms.length === 0}
          >
            {rooms.length === 0 ? (
              <option value="">No study rooms found</option>
            ) : (
              rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name} — {room.subject}
                </option>
              ))
            )}
          </select>
        </label>

        <input
          className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-yellow-300"
          placeholder="Note title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
        />

        <textarea
          className="min-h-[380px] w-full resize-y rounded-xl border border-white/20 bg-black px-4 py-4 text-white outline-none transition placeholder:text-white/30 focus:border-yellow-300"
          placeholder="Start with class notes, key ideas, or anything you want to remember..."
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/60">
          <div>
            {wordCount} words · {characterCount} characters
          </div>

          {selectedRoom ? (
            <div>
              Saving into:{" "}
              <span className="font-semibold text-yellow-200">
                {selectedRoom.name}
              </span>
            </div>
          ) : null}
        </div>

        <button
          onClick={onSave}
          disabled={saving || rooms.length === 0}
          className="w-full rounded-xl bg-yellow-300 px-4 py-3 font-black text-slate-950 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving Note..." : "Save Note"}
        </button>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}
