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
  const hasNoteContent =
    content.trim().length > 0;

  return (
    <section className="rounded-[1.6rem] border border-white/[0.1] bg-[linear-gradient(145deg,rgba(15,21,27,0.96),rgba(2,5,8,0.99))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-3xl sm:p-5">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-white">
            Note
          </h2>

          {selectedRoom ? (
            <p className="mt-1 max-w-[15rem] truncate text-xs font-bold text-[#b9a75f] sm:max-w-md">
              {selectedRoom.name}
            </p>
          ) : null}
        </div>

        <span className="shrink-0 rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-slate-400">
          {saveStatus === "saving"
            ? "Saving…"
            : saveStatus === "saved"
              ? "✓ Saved"
              : "Ready"}
        </span>
      </header>

      <div className="mt-4 space-y-3">
        <select
          aria-label="Study room"
          className="w-full rounded-xl border border-white/[0.1] bg-[#030609] px-4 py-3 text-sm text-white outline-none focus:border-[#c9ad50]/40"
          value={selectedRoomId ?? ""}
          onChange={(event) =>
            onRoomChange(
              Number(event.target.value)
            )
          }
          disabled={
            loadingRooms || rooms.length === 0
          }
        >
          {rooms.length === 0 ? (
            <option value="">
              No rooms
            </option>
          ) : (
            rooms.map((room) => (
              <option
                key={room.id}
                value={room.id}
                className="bg-[#030609]"
              >
                {room.name}
              </option>
            ))
          )}
        </select>

        <input
          className="w-full rounded-xl border border-white/[0.1] bg-[#030609] px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-600 focus:border-[#c9ad50]/40"
          placeholder="Title"
          value={title}
          onChange={(event) =>
            onTitleChange(event.target.value)
          }
        />

        <textarea
          className="min-h-[260px] w-full resize-y rounded-[1.1rem] border border-white/[0.1] bg-[#030609] px-4 py-4 text-sm leading-7 text-white outline-none placeholder:text-slate-600 focus:border-[#c9ad50]/40 sm:min-h-[360px]"
          placeholder="Start writing…"
          value={content}
          onChange={(event) =>
            onContentChange(event.target.value)
          }
        />

        <details className="group overflow-hidden rounded-[1.1rem] border border-white/[0.09] bg-white/[0.025]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-black text-slate-200">
              <span className="text-[#d9c575]">
                ✦
              </span>

              AI tools
            </span>

            <span className="text-xs text-slate-500 transition group-open:rotate-180">
              ▾
            </span>
          </summary>

          <div className="border-t border-white/[0.08] p-3">
            <NotesAIToolbar
              hasContent={hasNoteContent}
              onSummarize={onSummarize}
              onExplain={onExplain}
              onLesson={onLesson}
              onFlashcards={onFlashcards}
              onQuiz={onQuiz}
              onAskAI={onAskAI}
            />
          </div>
        </details>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold text-slate-600">
            {wordCount} words ·{" "}
            {characterCount} characters
          </p>

          <button
            type="button"
            onClick={onSave}
            disabled={
              saving || rooms.length === 0
            }
            className="shrink-0 rounded-xl border border-[#edd36d]/30 bg-[linear-gradient(145deg,#d8be58,#aa8730)] px-5 py-2.5 text-sm font-black text-[#050608] shadow-[0_10px_25px_rgba(201,173,80,0.16),inset_0_1px_0_rgba(255,255,255,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}
