import { NoteItem, StudyRoom } from "./types";

type Props = {
  notes: NoteItem[];
  selectedRoom?: StudyRoom;
};

export default function NotesStats({
  notes,
  selectedRoom,
}: Props) {
  const totalWords = notes.reduce((count, note) => {
    return (
      count +
      (note.content.trim()
        ? note.content.trim().split(/\s+/).length
        : 0)
    );
  }, 0);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="text-xs uppercase tracking-widest text-white/50">
          Notes
        </p>
        <h3 className="mt-2 text-3xl font-bold text-cyan-300">
          {notes.length}
        </h3>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="text-xs uppercase tracking-widest text-white/50">
          Total Words
        </p>
        <h3 className="mt-2 text-3xl font-bold text-cyan-300">
          {totalWords}
        </h3>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="text-xs uppercase tracking-widest text-white/50">
          Current Room
        </p>

        <h3 className="mt-2 text-lg font-semibold text-white">
          {selectedRoom?.name ?? "No room selected"}
        </h3>
      </div>
    </div>
  );
}
