import { NoteItem, StudyRoom } from "./types";

type Props = {
  selectedRoom?: StudyRoom;
  query: string;
  filteredNotes: NoteItem[];
  loadingNotes: boolean;
  deletingId: number | null;
  downloadingId: number | null;
  onQueryChange: (value: string) => void;
  onDeleteNote: (noteId: number) => void;
  onDownloadNote: (noteId: number) => void;
  onSelectNote: (note: NoteItem) => void;
};

function getNotePreview(content: string) {
  const cleaned = content.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return "No content yet.";
  }

  return cleaned.length > 180 ? cleaned.slice(0, 180) + "..." : cleaned;
}

function getWordCount(content: string) {
  const cleaned = content.trim();

  if (!cleaned) {
    return 0;
  }

  return cleaned.split(/\s+/).length;
}

export default function NotesLibrary({
  selectedRoom,
  query,
  filteredNotes,
  loadingNotes,
  deletingId,
  downloadingId,
  onQueryChange,
  onDeleteNote,
  onDownloadNote,
  onSelectNote,
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
        <div className="mt-6 max-h-[650px] space-y-3 overflow-y-auto pr-1">
          {filteredNotes.map((note) => {
            const wordCount = getWordCount(note.content);
            const preview = getNotePreview(note.content);

            return (
              <article
                key={note.id}
                onClick={() => onSelectNote(note)}
                className="cursor-pointer rounded-2xl border border-white/10 bg-black/40 p-4 transition hover:border-cyan-300/60 hover:bg-white/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate text-base font-semibold text-cyan-300">
                      {note.title}
                    </h4>

                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/40">
                      {note.created_at ? (
                        <span>
                          Created {new Date(note.created_at).toLocaleString()}
                        </span>
                      ) : null}

                      <span>{wordCount} words</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onDownloadNote(note.id);
                      }}
                      disabled={downloadingId === note.id}
                      className="rounded-xl border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {downloadingId === note.id ? "Downloading..." : "PDF"}
                    </button>

                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteNote(note.id);
                      }}
                      disabled={deletingId === note.id}
                      className="rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingId === note.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>

                <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/70">
                  {preview}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
