"use client";

type PDFDocument = {
  id: number;
  original_filename: string;
  file_size: number;
  created_at: string;
};

type PDFListProps = {
  pdfs?: PDFDocument[];
  loading?: boolean;
  deletingId?: number | null;
  summarizingId?: number | null;
  onDelete?: (pdfId: number) => void;
  onSummarize?: (pdfId: number) => void;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PDFList({
  pdfs = [],
  loading = false,
  deletingId = null,
  summarizingId = null,
  onDelete,
  onSummarize,
}: PDFListProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
      <h3 className="text-2xl font-bold text-white">Uploaded PDFs</h3>

      {loading ? (
        <div className="mt-6 rounded-xl bg-white/5 p-5 text-white/70">
          Loading PDFs...
        </div>
      ) : pdfs.length === 0 ? (
        <div className="mt-6 rounded-xl bg-white/5 p-5 text-white/70">
          No PDFs uploaded yet.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {pdfs.map((pdf) => (
            <div key={pdf.id} className="rounded-xl border border-white/10 bg-black p-4">
              <p className="font-semibold text-cyan-300">{pdf.original_filename}</p>

              <p className="mt-2 text-sm text-white/50">
                {formatFileSize(pdf.file_size)} · Uploaded{" "}
                {new Date(pdf.created_at).toLocaleString()}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {onSummarize ? (
                  <button
                    onClick={() => onSummarize(pdf.id)}
                    disabled={summarizingId === pdf.id}
                    className="rounded-xl bg-cyan-400 px-3 py-2 text-sm font-semibold text-black hover:bg-cyan-300 disabled:opacity-60"
                  >
                    {summarizingId === pdf.id ? "Summarizing..." : "AI Summary"}
                  </button>
                ) : null}

                {onDelete ? (
                  <button
                    onClick={() => onDelete(pdf.id)}
                    disabled={deletingId === pdf.id}
                    className="rounded-xl border border-red-500/30 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-60"
                  >
                    {deletingId === pdf.id ? "Deleting..." : "Delete"}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}