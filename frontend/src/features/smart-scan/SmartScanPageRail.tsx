"use client";

import type { SmartScanPage } from "@/lib/api";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];

  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  const value = bytes / Math.pow(1024, index);

  return `${value.toFixed(
    index === 0 || value >= 10 ? 0 : 1,
  )} ${units[index]}`;
}

function statusLabel(page: SmartScanPage) {
  if (page.ocr_error) return "Needs review";
  if (page.extracted_text.trim()) return "Read";

  const status = page.ocr_status.trim().toLowerCase();

  if (status === "processing") return "Reading";
  if (status === "failed") return "Failed";

  return "Waiting";
}

function statusTone(page: SmartScanPage) {
  if (page.ocr_error) {
    return "border-red-300/20 bg-red-400/10 text-red-100";
  }

  if (page.extracted_text.trim()) {
    return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  }

  if (page.ocr_status.toLowerCase() === "processing") {
    return "border-[#c9ad50]/25 bg-[#c9ad50]/10 text-[#e4d89c]";
  }

  return "border-white/10 bg-white/[0.04] text-slate-400";
}

export default function SmartScanPageRail({
  pages,
  selectedPageId,
  busyPageId,
  onSelect,
  onRotate,
  onMove,
  onDelete,
}: {
  pages: SmartScanPage[];
  selectedPageId: number | null;
  busyPageId: number | null;
  onSelect: (pageId: number) => void;
  onRotate: (page: SmartScanPage) => void;
  onMove: (
    pageId: number,
    direction: -1 | 1,
  ) => void;
  onDelete: (page: SmartScanPage) => void;
}) {
  if (!pages.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.025] p-5 text-center">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-xl">
          ▧
        </div>

        <p className="mt-3 text-sm font-black text-white">
          No pages yet
        </p>

        <p className="mt-1 text-xs leading-5 text-slate-500">
          Add clear photos in the correct order.
        </p>
      </div>
    );
  }

  return (
    <div className="studysnap-scroll max-h-[48rem] space-y-2 overflow-y-auto pr-1">
      {pages.map((page, index) => {
        const selected = selectedPageId === page.id;
        const busy = busyPageId === page.id;

        return (
          <article
            key={page.id}
            className={`rounded-xl border p-2.5 transition ${
              selected
                ? "border-[#c9ad50]/35 bg-[#c9ad50]/[0.08]"
                : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.12] hover:bg-white/[0.045]"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(page.id)}
              className="flex w-full min-w-0 items-start gap-3 text-left"
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border text-xs font-black ${
                  selected
                    ? "border-[#c9ad50]/25 bg-[#c9ad50]/10 text-[#e2d28d]"
                    : "border-white/[0.07] bg-black/20 text-slate-400"
                }`}
              >
                {page.page_number}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-black text-white">
                  {page.original_filename}
                </span>

                <span className="mt-1 block text-[10px] text-slate-500">
                  {formatBytes(page.file_size)}
                  {" · "}
                  {page.width}×{page.height}
                </span>
              </span>
            </button>

            <div className="mt-2 flex items-center justify-between gap-2">
              <span
                className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${statusTone(
                  page,
                )}`}
              >
                {statusLabel(page)}
              </span>

              {typeof page.ocr_confidence === "number" ? (
                <span className="text-[9px] font-bold text-slate-500">
                  {page.ocr_confidence}%
                </span>
              ) : null}
            </div>

            <div className="mt-2 grid grid-cols-4 gap-1">
              <button
                type="button"
                disabled={busy || index === 0}
                onClick={() => onMove(page.id, -1)}
                aria-label={`Move page ${page.page_number} up`}
                title="Move up"
                className="grid h-8 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-xs text-slate-300 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-30"
              >
                ↑
              </button>

              <button
                type="button"
                disabled={
                  busy || index === pages.length - 1
                }
                onClick={() => onMove(page.id, 1)}
                aria-label={`Move page ${page.page_number} down`}
                title="Move down"
                className="grid h-8 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-xs text-slate-300 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-30"
              >
                ↓
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => onRotate(page)}
                aria-label={`Rotate page ${page.page_number}`}
                title="Rotate"
                className="grid h-8 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-xs text-slate-300 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-30"
              >
                ↻
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => onDelete(page)}
                aria-label={`Delete page ${page.page_number}`}
                title="Delete"
                className="grid h-8 place-items-center rounded-lg border border-red-300/10 bg-red-400/[0.04] text-xs text-red-200 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ×
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
