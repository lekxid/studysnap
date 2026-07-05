import { NoteItem, StudyRoom } from "./types";

type Props = {
  selectedRoom?: StudyRoom;
  query: string;
  filteredNotes: NoteItem[];
  loadingNotes: boolean;
  deletingId: number | null;
  onQueryChange: (value: string) => void;
  onDeleteNote: (noteId: number) => void;
};

export default function NotesLibrary({
  selectedRoom,
  query,
  filteredNotes,
  loadingNotes,
  deletingId,
  onQueryChange,
  onDeleteNote,
}: Props) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0a1022] p-6 shadow-2xl">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
          Library
        </p>
        <h3 className="mt-2 text-2xl font-bold text-white">Room Notes</h3>
        <p className="mt-2 text-sm text-white/60">
          {selectedRoom
            ? `Showing notes for ${selectedRoom.name}.`
            : "Select a room to view notes."}
        </p>
      </div>

      <input
        className="mt-6 w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300"
        placeholder="Search inside notes..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />

      {loadingNotes ? (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6 text-white/70">
          Loading notes...
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6 text-white/70">
          No notes found for this room yet.
        </div>
      ) : (
        <div className="mt-6 max-h-[650px] space-y-4 overflow-y-auto pr-1">
          {filteredNotes.map((note) => (
            <article
              key={note.id}
              className="rounded-2xl border border-white/10 bg-black p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-lg font-semibold text-cyan-300">
                    {note.title}
                  </h4>
                  {note.created_at ? (
                    <p className="mt-1 text-xs text-white/40">
                      Created {new Date(note.created_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>

                <button
                  onClick={() => onDeleteNote(note.id)}
                  disabled={deletingId === note.id}
                  className="rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingId === note.id ? "Deleting..." : "Delete"}
                </button>
              </div>

              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/75">
                {note.content}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
