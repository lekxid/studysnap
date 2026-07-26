"use client";

/* eslint-disable @next/next/no-img-element -- Dashboard attachments may be authenticated, blob, or data-URL previews and intentionally use native images. */

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  deleteAIAttachment,
  getProtectedFileBlobUrl,
  hideAIAttachmentFromFeed,
  pinAIAttachment,
} from "@/lib/api";

import type {
  DashboardContinueItem,
  DashboardFeedItem,
  DashboardNextStep,
  SmartDashboardResponse,
} from "@/lib/api";

type SmartDashboardCenterProps = {
  data: SmartDashboardResponse | null;
  loading: boolean;
  loadingMore: boolean;
  error: string;
  onRetry: () => void;
  onRefresh: () => void | Promise<void>;
  onLoadMore: () => void;
};

type DashboardNotice = {
  type: "success" | "error";
  message: string;
};

type AttachmentAction =
  | "pin"
  | "unpin"
  | "hide"
  | "delete";

function formatRelativeTime(
  value?: string | null,
) {
  if (!value) {
    return "Recently";
  }

  const timestamp = new Date(
    value,
  ).getTime();

  if (Number.isNaN(timestamp)) {
    return "Recently";
  }

  const difference =
    Date.now() - timestamp;

  if (difference < 0) {
    return "Just now";
  }

  const minutes = Math.max(
    1,
    Math.floor(
      difference / 60_000,
    ),
  );

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(
    minutes / 60,
  );

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(
    hours / 24,
  );

  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(
    value,
  ).toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
    },
  );
}

function getAttachmentUrl(
  item: DashboardFeedItem,
) {
  return typeof (
    item.metadata
      .attachment_url
  ) === "string"
    ? item.metadata
        .attachment_url
    : "";
}

function getAttachmentKind(
  item: DashboardFeedItem,
) {
  return typeof (
    item.metadata
      .attachment_kind
  ) === "string"
    ? item.metadata
        .attachment_kind
    : "";
}

function getAttachmentMessageId(
  item: DashboardFeedItem,
) {
  if (
    item.entity_type !==
      "ai_message_attachment" ||
    typeof item.entity_id !==
      "number"
  ) {
    return null;
  }

  return item.entity_id;
}

function isAttachmentPinned(
  item: DashboardFeedItem,
) {
  return (
    item.metadata
      .is_pinned === true
  );
}

function isAttachmentItem(
  item: DashboardFeedItem,
) {
  return (
    item.event ===
      "ai_attachment_uploaded" &&
    Boolean(
      getAttachmentUrl(item),
    )
  );
}

function getAttachmentIcon(
  kind: string,
) {
  if (kind === "image") {
    return "▧";
  }

  if (kind === "pdf") {
    return "PDF";
  }

  if (
    kind === "presentation"
  ) {
    return "▤";
  }

  if (
    kind === "spreadsheet"
  ) {
    return "▦";
  }

  if (kind === "document") {
    return "▣";
  }

  return "📄";
}

function getAttachmentTypeLabel(
  kind: string,
) {
  if (kind === "image") {
    return "Image";
  }

  if (kind === "pdf") {
    return "PDF";
  }

  if (
    kind === "presentation"
  ) {
    return "Presentation";
  }

  if (
    kind === "spreadsheet"
  ) {
    return "Spreadsheet";
  }

  if (kind === "document") {
    return "Document";
  }

  return "File";
}

function getErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return fallback;
}

async function openProtectedAttachment(
  item: DashboardFeedItem,
) {
  const attachmentUrl =
    getAttachmentUrl(item);

  if (!attachmentUrl) {
    window.location.assign(
      item.action_href,
    );
    return;
  }

  try {
    const objectUrl =
      await getProtectedFileBlobUrl(
        attachmentUrl,
      );

    const openedWindow =
      window.open(
        objectUrl,
        "_blank",
        "noopener,noreferrer",
      );

    if (!openedWindow) {
      window.location.assign(
        objectUrl,
      );
    }

    window.setTimeout(
      () => {
        URL.revokeObjectURL(
          objectUrl,
        );
      },
      60_000,
    );
  } catch {
    window.location.assign(
      item.action_href,
    );
  }
}

function EmptySection({
  icon,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon: string;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.07] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] px-4 py-6 text-center shadow-[0_20px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-[#c9ad50]/[0.18] bg-[#9f8948]/10 text-xl">
        {icon}
      </span>

      <p className="mt-3 text-sm font-black text-[#f0ead3]">
        {title}
      </p>

      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">
        {description}
      </p>

      {actionHref &&
      actionLabel ? (
        <Link
          href={actionHref}
          className="mt-4 inline-flex rounded-lg border border-[#c9ad50]/[0.18] bg-[#9f8948]/10 px-3 py-2 text-xs font-black text-[#dfce8c] transition hover:bg-[#9f8948]/[0.14]"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function LoadingDashboardFeed() {
  return (
    <div
      className="space-y-4"
      aria-label={
        "Loading smart dashboard"
      }
      aria-busy="true"
    >
      {[0, 1, 2].map(
        (item) => (
          <section
            key={item}
            className="animate-pulse rounded-2xl border border-white/[0.07] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl sm:p-5"
          >
            <div className="h-3 w-28 rounded bg-white/[0.07]" />
            <div className="mt-3 h-6 w-2/3 rounded bg-white/[0.07]" />
            <div className="mt-2 h-3 w-full rounded bg-white/[0.035]" />
            <div className="mt-2 h-3 w-4/5 rounded bg-white/[0.035]" />
            <div className="mt-4 h-9 w-28 rounded-lg bg-white/[0.07]" />
          </section>
        ),
      )}
    </div>
  );
}

function NextStepCard({
  item,
}: {
  item: DashboardNextStep;
}) {
  return (
    <section className="studysnap-glass-panel overflow-hidden rounded-2xl border border-[#c9ad50]/[0.24] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] shadow-[0_18px_55px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl">
      <div className="h-1 bg-gradient-to-r from-[#c9ad50] via-[#c8ad4c] to-transparent" />

      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[#c9ad50]/[0.24] bg-[#9f8948]/10 text-2xl">
            {item.icon}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                Best next step
              </p>

              <span className="rounded-full border border-white/[0.07] bg-[#9f8948]/[0.06] px-2 py-1 text-[9px] font-black text-[#dfce8c]/70">
                {item.reason}
              </span>
            </div>

            <h2 className="mt-2 text-xl font-black text-[#f0ead3]">
              {item.title}
            </h2>

            <p className="mt-1 text-sm leading-6 text-slate-400">
              {item.description}
            </p>
          </div>

          <Link
            href={
              item.action_href
            }
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#9f8948] px-4 py-2.5 text-sm font-black text-black transition hover:bg-[#d5bb63]"
          >
            {item.action_label}
            <span className="ml-2">
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function ContinueRow({
  item,
}: {
  item: DashboardContinueItem;
}) {
  const hasRealProgress =
    typeof (
      item.progress_percent
    ) === "number";

  return (
    <Link
      href={item.action_href}
      className="group grid gap-3 rounded-xl border border-white/[0.07] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] p-3 shadow-[0_20px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl transition hover:border-[#c9ad50]/[0.28] hover:bg-[#9f8948]/[0.04] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#c9ad50]/[0.18] bg-[#9f8948]/10 text-lg">
          {item.icon}
        </span>

        <div className="min-w-0">
          <p className="truncate text-sm font-black text-[#f0ead3]">
            {item.title}
          </p>

          <p className="mt-1 truncate text-xs text-slate-500">
            {item.description}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-600">
            {item.room_name ? (
              <span>
                {item.room_name}
              </span>
            ) : null}

            <span>
              {formatRelativeTime(
                item.last_active_at,
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {hasRealProgress ? (
          <>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#9f8948]"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(
                      100,
                      item.progress_percent ||
                        0,
                    ),
                  )}%`,
                }}
              />
            </div>

            <span className="w-9 text-right text-[10px] font-black text-slate-300">
              {
                item.progress_percent
              }
              %
            </span>
          </>
        ) : null}

        <span className="rounded-lg border border-white/[0.07] px-3 py-1.5 text-[10px] font-black text-slate-300 transition group-hover:border-[#c9ad50]/[0.28] group-hover:text-[#dfce8c]">
          {item.action_label}
        </span>
      </div>
    </Link>
  );
}

function ContinueLearningSection({
  data,
}: {
  data: SmartDashboardResponse;
}) {
  const [
    expanded,
    setExpanded,
  ] = useState(false);

  const emptyState =
    data.empty_states
      .continue_learning;

  const visibleItems =
    expanded
      ? data.continue_learning
      : data.continue_learning.slice(
          0,
          3,
        );

  const hasMore =
    data.continue_learning
      .length > 3;

  return (
    <section className="studysnap-glass-panel rounded-2xl border border-white/[0.07] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl sm:p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-300">
          <span>📖</span>
          Continue Learning
        </h2>

        <p className="mt-1 text-xs text-slate-500">
          Resume your most
          recent meaningful
          work.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {visibleItems.length ? (
          visibleItems.map(
            (item) => (
              <ContinueRow
                key={item.id}
                item={item}
              />
            ),
          )
        ) : (
          <EmptySection
            icon="📖"
            title={
              emptyState.title
            }
            description={
              emptyState.description
            }
            actionHref="/study-rooms"
            actionLabel="Open Study Rooms"
          />
        )}
      </div>

      {hasMore ? (
        <div className="mt-4 border-t border-white/[0.07] pt-4 text-center">
          <button
            type="button"
            onClick={() =>
              setExpanded(
                (current) =>
                  !current,
              )
            }
            className="rounded-xl border border-white/[0.075] bg-white/[0.035] px-4 py-2.5 text-xs font-black text-slate-200 transition hover:border-white/[0.13] hover:text-[#dfce8c]"
          >
            {expanded
              ? "Show less"
              : `View all (${data.continue_learning.length})`}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ProtectedFeedImage({
  path,
  alt,
  compact = false,
}: {
  path: string;
  alt: string;
  compact?: boolean;
}) {
  const [
    source,
    setSource,
  ] = useState("");

  const [
    failed,
    setFailed,
  ] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = "";

    queueMicrotask(() => {
      setSource("");
      setFailed(false);
    });

    void getProtectedFileBlobUrl(
      path,
    )
      .then((url) => {
        objectUrl = url;

        if (active) {
          setSource(url);
        } else {
          URL.revokeObjectURL(
            url,
          );
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });

    return () => {
      active = false;

      if (objectUrl) {
        URL.revokeObjectURL(
          objectUrl,
        );
      }
    };
  }, [path]);

  if (failed) {
    return (
      <div
        className={`grid place-items-center rounded-xl bg-black/25 text-xs font-bold text-slate-500 ${
          compact
            ? "min-h-28"
            : "min-h-40"
        }`}
      >
        Image unavailable
      </div>
    );
  }

  if (!source) {
    return (
      <div
        className={`grid animate-pulse place-items-center rounded-xl bg-white/[0.035] text-xs font-bold text-slate-600 ${
          compact
            ? "min-h-28"
            : "min-h-48"
        }`}
      >
        Loading…
      </div>
    );
  }

  return (
    <img
      src={source}
      alt={alt}
      className={`w-full rounded-xl object-contain ${
        compact
          ? "h-32"
          : "max-h-[520px]"
      }`}
    />
  );
}

function AttachmentActionMenu({
  item,
  onRefresh,
  onRemove,
  onNotice,
}: {
  item: DashboardFeedItem;
  onRefresh:
    () => void | Promise<void>;
  onRemove: (
    itemId: string,
  ) => void;
  onNotice: (
    notice: DashboardNotice,
  ) => void;
}) {
  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    busyAction,
    setBusyAction,
  ] =
    useState<AttachmentAction | null>(
      null,
    );

  const menuRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const messageId =
    getAttachmentMessageId(
      item,
    );

  const pinned =
    isAttachmentPinned(item);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeFromOutside(
      event: PointerEvent,
    ) {
      if (
        !menuRef.current
          ?.contains(
            event.target as Node,
          )
      ) {
        setOpen(false);
      }
    }

    function closeFromEscape(
      event: KeyboardEvent,
    ) {
      if (
        event.key === "Escape"
      ) {
        setOpen(false);
      }
    }

    document.addEventListener(
      "pointerdown",
      closeFromOutside,
    );

    document.addEventListener(
      "keydown",
      closeFromEscape,
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        closeFromOutside,
      );

      document.removeEventListener(
        "keydown",
        closeFromEscape,
      );
    };
  }, [open]);

  async function runAction(
    action: AttachmentAction,
  ) {
    if (
      messageId === null ||
      busyAction !== null
    ) {
      return;
    }

    if (
      action === "delete"
    ) {
      const confirmed =
        window.confirm(
          `Delete "${item.title}"?\n\nThe file will be removed, but the chat conversation will remain available. This cannot be undone.`,
        );

      if (!confirmed) {
        setOpen(false);
        return;
      }
    }

    setBusyAction(action);
    setOpen(false);

    try {
      if (
        action === "pin" ||
        action === "unpin"
      ) {
        const nextPinned =
          action === "pin";

        await pinAIAttachment(
          messageId,
          nextPinned,
        );

        onRemove(item.id);

        onNotice({
          type: "success",
          message: nextPinned
            ? "Material pinned to your dashboard."
            : "Material removed from Pinned Materials.",
        });
      }

      if (action === "hide") {
        await hideAIAttachmentFromFeed(
          messageId,
        );

        onRemove(item.id);

        onNotice({
          type: "success",
          message:
            "Material hidden from your dashboard feed.",
        });
      }

      if (
        action === "delete"
      ) {
        await deleteAIAttachment(
          messageId,
        );

        onRemove(item.id);

        onNotice({
          type: "success",
          message:
            "File deleted. The chat conversation was preserved.",
        });
      }

      await onRefresh();
    } catch (error) {
      onNotice({
        type: "error",
        message: getErrorMessage(
          error,
          "The material could not be updated.",
        ),
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div
      ref={menuRef}
      className="relative shrink-0"
    >
      <button
        type="button"
        aria-label={`More actions for ${item.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() =>
          setOpen(
            (current) =>
              !current,
          )
        }
        disabled={
          busyAction !== null
        }
        className="grid h-9 w-9 place-items-center rounded-xl border border-transparent text-sm font-black tracking-widest text-slate-500 transition hover:border-white/[0.08] hover:bg-white/[0.06] hover:text-white disabled:cursor-wait disabled:opacity-50"
      >
        {busyAction
          ? "…"
          : "•••"}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-10 z-40 w-48 rounded-xl border border-white/[0.10] bg-[#11161b]/[0.98] p-1.5 shadow-[0_22px_60px_rgba(0,0,0,0.62)] backdrop-blur-2xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void openProtectedAttachment(
                item,
              );
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-black text-slate-200 transition hover:bg-white/[0.07] hover:text-white"
          >
            <span
              aria-hidden="true"
              className="w-4 text-center text-slate-500"
            >
              ↗
            </span>
            Open
          </button>

          {messageId !== null ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  void runAction(
                    pinned
                      ? "unpin"
                      : "pin",
                  )
                }
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-black text-slate-200 transition hover:bg-white/[0.07] hover:text-white"
              >
                <span
                  aria-hidden="true"
                  className="w-4 text-center text-[#b9a763]"
                >
                  {pinned
                    ? "−"
                    : "S"}
                </span>

                {pinned
                  ? "Unpin"
                  : "Pin to dashboard"}
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  void runAction(
                    "hide",
                  )
                }
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-black text-slate-200 transition hover:bg-white/[0.07] hover:text-white"
              >
                <span
                  aria-hidden="true"
                  className="w-4 text-center text-slate-500"
                >
                  ◌
                </span>
                Hide from feed
              </button>

              <div className="my-1 border-t border-white/[0.07]" />

              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  void runAction(
                    "delete",
                  )
                }
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-black text-red-200 transition hover:bg-red-500/10 hover:text-red-100"
              >
                <span
                  aria-hidden="true"
                  className="w-4 text-center"
                >
                  ×
                </span>
                Delete file
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PinnedMaterialCard({
  item,
  onRefresh,
  onRemove,
  onNotice,
}: {
  item: DashboardFeedItem;
  onRefresh:
    () => void | Promise<void>;
  onRemove: (
    itemId: string,
  ) => void;
  onNotice: (
    notice: DashboardNotice,
  ) => void;
}) {
  const attachmentUrl =
    getAttachmentUrl(item);

  const attachmentKind =
    getAttachmentKind(item);

  const image =
    attachmentKind ===
    "image";

  return (
    <article className="relative min-w-0 rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(16,21,26,0.96),rgba(5,8,11,0.92))] p-3 shadow-[0_18px_45px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-white/[0.09]">
      <div className="absolute right-2 top-2 z-20">
        <AttachmentActionMenu
          item={item}
          onRefresh={
            onRefresh
          }
          onRemove={onRemove}
          onNotice={onNotice}
        />
      </div>

      <button
        type="button"
        onClick={() =>
          void openProtectedAttachment(
            item,
          )
        }
        className="block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9ad50]/60"
      >
        {image ? (
          <div className="overflow-hidden rounded-xl bg-black/20">
            <ProtectedFeedImage
              path={
                attachmentUrl
              }
              alt={item.title}
              compact
            />
          </div>
        ) : (
          <div className="grid h-32 place-items-center rounded-xl border border-white/[0.055] bg-white/[0.025]">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.075] bg-white/[0.045] text-sm font-black text-slate-300">
              {getAttachmentIcon(
                attachmentKind,
              )}
            </span>
          </div>
        )}

        <div className="px-1 pb-1 pt-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[#c9ad50]/[0.18] bg-[#9f8948]/[0.08] px-2 py-1 text-[9px] font-black text-[#d8c57d]">
              Pinned
            </span>

            <span className="truncate text-[10px] font-bold text-slate-600">
              {getAttachmentTypeLabel(
                attachmentKind,
              )}
            </span>
          </div>

          <h3 className="mt-2 truncate pr-8 text-sm font-black text-white">
            {item.title}
          </h3>

          <p className="mt-1 truncate text-[10px] font-bold text-slate-600">
            {item.room_name
              ? `${item.room_name} · `
              : ""}
            {formatRelativeTime(
              item.timestamp,
            )}
          </p>
        </div>
      </button>
    </article>
  );
}

function PinnedMaterialsSection({
  data,
  onRefresh,
  onNotice,
}: {
  data: SmartDashboardResponse;
  onRefresh:
    () => void | Promise<void>;
  onNotice: (
    notice: DashboardNotice,
  ) => void;
}) {
  const [
    dismissedItemIds,
    setDismissedItemIds,
  ] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    queueMicrotask(() => {
      setDismissedItemIds(
        new Set(),
      );
    });
  }, [data.generated_at]);

  const pinnedItems = (
    data.pinned_feed || []
  ).filter(
    (item) =>
      !dismissedItemIds.has(
        item.id,
      ),
  );

  function removeItem(
    itemId: string,
  ) {
    setDismissedItemIds(
      (current) => {
        const next =
          new Set(current);

        next.add(itemId);
        return next;
      },
    );
  }

  if (pinnedItems.length === 0) {
    return null;
  }

  return (
    <section className="studysnap-glass-panel rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="text-[#b9a763]"
            >
              S
            </span>

            <h2 className="text-lg font-black text-white">
              Pinned Materials
            </h2>
          </div>

          <p className="mt-1 text-xs text-slate-500">
            Keep up to three
            important study
            files within reach.
          </p>
        </div>

        <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[10px] font-black text-slate-400">
          {pinnedItems.length}
          /3
        </span>
      </div>

      <div
        aria-label="Pinned materials"
        className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 scroll-smooth"
      >
        {pinnedItems.map((item) => (
          <div
            key={item.id}
            className="w-[min(82vw,20rem)] shrink-0 snap-start sm:w-80 lg:w-[22rem]"
          >
            <PinnedMaterialCard
              item={item}
              onRefresh={onRefresh}
              onRemove={removeItem}
              onNotice={onNotice}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function FeedItem({
  item,
  onRefresh,
  onRemove,
  onNotice,
}: {
  item: DashboardFeedItem;
  onRefresh:
    () => void | Promise<void>;
  onRemove: (
    itemId: string,
  ) => void;
  onNotice: (
    notice: DashboardNotice,
  ) => void;
}) {
  const groupedCount =
    typeof (
      item.metadata
        .grouped_count
    ) === "number"
      ? item.metadata
          .grouped_count
      : 1;

  const attachmentKind =
    getAttachmentKind(item);

  const attachmentUrl =
    getAttachmentUrl(item);

  const attachment =
    isAttachmentItem(item);

  const image =
    attachment &&
    attachmentKind ===
      "image";

  if (image) {
    return (
      <article className="border-b border-white/[0.065] p-3 last:border-b-0 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <Link
            href={
              item.action_href
            }
            className="min-w-0 truncate text-sm font-black text-white transition hover:text-[#dfce8c]"
          >
            {item.title}
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[10px] font-bold text-slate-600">
              {formatRelativeTime(
                item.timestamp,
              )}
            </span>

            <AttachmentActionMenu
              item={item}
              onRefresh={
                onRefresh
              }
              onRemove={
                onRemove
              }
              onNotice={
                onNotice
              }
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            void openProtectedAttachment(
              item,
            )
          }
          className="block w-full overflow-hidden rounded-xl bg-black/20 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9ad50]/60"
        >
          <ProtectedFeedImage
            path={attachmentUrl}
            alt={item.title}
          />
        </button>

        {item.room_name ? (
          <p className="mt-2 truncate text-[10px] font-bold text-slate-600">
            {item.room_name}
          </p>
        ) : null}
      </article>
    );
  }

  if (attachment) {
    return (
      <article className="flex items-center gap-2 border-b border-white/[0.065] px-3 py-3 last:border-b-0 sm:px-4">
        <button
          type="button"
          onClick={() =>
            void openProtectedAttachment(
              item,
            )
          }
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9ad50]/60"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-xs font-black text-slate-300">
            {getAttachmentIcon(
              attachmentKind,
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-white">
              {item.title}
            </p>

            <p className="mt-0.5 truncate text-[10px] font-bold text-slate-600">
              {item.room_name
                ? `${item.room_name} · `
                : ""}
              {getAttachmentTypeLabel(
                attachmentKind,
              )}
              {" · "}
              {formatRelativeTime(
                item.timestamp,
              )}
            </p>
          </div>

          <span
            aria-hidden="true"
            className="pr-1 text-sm text-slate-600"
          >
            ›
          </span>
        </button>

        <AttachmentActionMenu
          item={item}
          onRefresh={
            onRefresh
          }
          onRemove={onRemove}
          onNotice={onNotice}
        />
      </article>
    );
  }

  return (
    <article className="border-b border-white/[0.065] px-3 py-4 last:border-b-0 sm:px-4">
      <Link
        href={item.action_href}
        className="flex items-start gap-3"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-lg">
          {item.icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 text-sm font-black leading-5 text-white">
              {item.title}
            </h3>

            <span className="shrink-0 text-[10px] font-bold text-slate-600">
              {formatRelativeTime(
                item.timestamp,
              )}
            </span>
          </div>

          {item.description ? (
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {item.description}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-600">
            {item.actor_name ? (
              <span>
                {item.actor_name}
              </span>
            ) : null}

            {item.room_name ? (
              <span>
                {item.room_name}
              </span>
            ) : null}

            {groupedCount > 1 ? (
              <span>
                {groupedCount} updates
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </article>
  );
}

function LearningFeedSection({
  data,
  loadingMore,
  onLoadMore,
  onRefresh,
  onNotice,
}: {
  data: SmartDashboardResponse;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRefresh:
    () => void | Promise<void>;
  onNotice: (
    notice: DashboardNotice,
  ) => void;
}) {
  const [
    expanded,
    setExpanded,
  ] = useState(false);

  const emptyState =
    data.empty_states.feed;

  const [
    hiddenItemIds,
    setHiddenItemIds,
  ] = useState<Set<string>>(
    () => new Set(),
  );

  const pinnedIds =
    useMemo(
      () =>
        new Set(
          (
            data.pinned_feed ||
            []
          ).map(
            (item) =>
              item.id,
          ),
        ),
      [data.pinned_feed],
    );

  const availableItems =
    data.feed.filter(
      (item) =>
        !hiddenItemIds.has(
          item.id,
        ) &&
        !pinnedIds.has(
          item.id,
        ),
    );

  const visibleItems =
    expanded
      ? availableItems
      : availableItems.slice(
          0,
          3,
        );

  function removeFeedItem(
    itemId: string,
  ) {
    setHiddenItemIds(
      (current) => {
        const next =
          new Set(current);

        next.add(itemId);
        return next;
      },
    );
  }

  const hasMoreActivity =
    availableItems.length >
      3 ||
    Boolean(
      data.has_more &&
        data.next_cursor,
    );

  function handleViewAll() {
    setExpanded(true);

    if (
      data.has_more &&
      data.next_cursor &&
      !loadingMore
    ) {
      onLoadMore();
    }
  }

  const allVisibleFilesPinned =
    !availableItems.length &&
    Boolean(
      (
        data.pinned_feed || []
      ).length,
    );

  return (
    <section className="studysnap-glass-panel overflow-visible rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] shadow-[0_20px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] p-4 sm:p-5">
        <div>
          <h2 className="text-lg font-black text-white">
            Learning Feed
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Recent uploads and
            meaningful learning
            activity.
          </p>
        </div>
      </div>

      {availableItems.length ? (
        <div>
          {visibleItems.map(
            (item) => (
              <FeedItem
                key={item.id}
                item={item}
                onRefresh={
                  onRefresh
                }
                onRemove={
                  removeFeedItem
                }
                onNotice={
                  onNotice
                }
              />
            ),
          )}
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <EmptySection
            icon={
              allVisibleFilesPinned
                ? "S"
                : "S"
            }
            title={
              allVisibleFilesPinned
                ? "Your current materials are pinned"
                : emptyState.title
            }
            description={
              allVisibleFilesPinned
                ? "Pinned files stay organized above while new activity appears here."
                : emptyState.description
            }
            actionHref={
              allVisibleFilesPinned
                ? undefined
                : "/study-rooms/organize"
            }
            actionLabel={
              allVisibleFilesPinned
                ? undefined
                : "Upload material"
            }
          />
        </div>
      )}

      {availableItems.length ? (
        <div className="border-t border-white/[0.07] p-4 text-center">
          {!expanded &&
          hasMoreActivity ? (
            <button
              type="button"
              onClick={
                handleViewAll
              }
              disabled={
                loadingMore
              }
              className="rounded-xl border border-white/[0.075] bg-white/[0.035] px-4 py-2.5 text-xs font-black text-slate-200 transition hover:border-white/[0.13] hover:text-[#dfce8c] disabled:cursor-wait disabled:opacity-50"
            >
              {loadingMore
                ? "Loading activity..."
                : "View all activity"}
            </button>
          ) : expanded ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setExpanded(
                    false,
                  )
                }
                className="rounded-xl border border-white/[0.075] bg-white/[0.025] px-4 py-2.5 text-xs font-black text-slate-300 transition hover:text-white"
              >
                Show less
              </button>

              {data.has_more &&
              data.next_cursor ? (
                <button
                  type="button"
                  onClick={
                    onLoadMore
                  }
                  disabled={
                    loadingMore
                  }
                  className="rounded-xl border border-white/[0.075] bg-white/[0.035] px-4 py-2.5 text-xs font-black text-slate-200 transition hover:border-white/[0.13] hover:text-[#dfce8c] disabled:cursor-wait disabled:opacity-50"
                >
                  {loadingMore
                    ? "Loading older activity..."
                    : "Load older activity"}
                </button>
              ) : (
                <span className="px-2 text-xs font-bold text-slate-500">
                  You’re all caught
                  up
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs font-bold text-slate-500">
              You’re all caught up
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function isNotificationOnlyNextStep(
  reason: unknown,
) {
  const normalized =
    typeof reason === "string"
      ? reason
          .trim()
          .toLowerCase()
      : "";

  return (
    normalized.includes(
      "unread group",
    ) ||
    normalized.includes(
      "new material not reviewed",
    ) ||
    normalized.includes(
      "group activity",
    ) ||
    normalized.includes(
      "notification",
    )
  );
}

export default function SmartDashboardCenter({
  data,
  loading,
  loadingMore,
  error,
  onRetry,
  onRefresh,
  onLoadMore,
}: SmartDashboardCenterProps) {
  const [
    notice,
    setNotice,
  ] =
    useState<DashboardNotice | null>(
      null,
    );

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout =
      window.setTimeout(
        () => {
          setNotice(null);
        },
        4_500,
      );

    return () => {
      window.clearTimeout(
        timeout,
      );
    };
  }, [notice]);

  if (loading && !data) {
    return (
      <LoadingDashboardFeed />
    );
  }

  if (!data) {
    return (
      <section className="studysnap-glass-panel rounded-2xl border border-red-400/15 bg-red-400/[0.04] p-5 text-center">
        <p className="text-sm font-black text-[#f0ead3]">
          StudySnap could not
          load your learning
          feed
        </p>

        <p className="mt-1 text-xs leading-5 text-slate-400">
          {error ||
            "Your dashboard data is temporarily unavailable."}
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-[#9f8948] px-4 py-2 text-xs font-black text-black transition hover:bg-[#d5bb63]"
        >
          Try again
        </button>
      </section>
    );
  }

  const showBestNextStep =
    Boolean(data.next_step) &&
    !isNotificationOnlyNextStep(
      data.next_step
        ?.reason,
    );

  return (
    <div className="space-y-5">
      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.18)] ${
            notice.type ===
            "success"
              ? "border-emerald-300/15 bg-emerald-300/[0.05]"
              : "border-red-300/15 bg-red-400/[0.05]"
          }`}
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              aria-hidden="true"
              className={`mt-0.5 text-xs ${
                notice.type ===
                "success"
                  ? "text-emerald-300"
                  : "text-red-300"
              }`}
            >
              {notice.type ===
              "success"
                ? "✓"
                : "!"}
            </span>

            <p className="text-xs leading-5 text-slate-300">
              {notice.message}
            </p>
          </div>

          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() =>
              setNotice(null)
            }
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
          >
            ×
          </button>
        </div>
      ) : null}

      {error ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-[#c9ad50]/15 bg-[#9f8948]/[0.05] px-3 py-2.5"
        >
          <p className="text-xs text-slate-300">
            {error} Showing the
            latest saved
            dashboard data.
          </p>

          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 text-[10px] font-black text-slate-300"
          >
            Refresh
          </button>
        </div>
      ) : null}

      {showBestNextStep ? (
        <NextStepCard
          item={data.next_step}
        />
      ) : null}

      <PinnedMaterialsSection
        data={data}
        onRefresh={onRefresh}
        onNotice={setNotice}
      />

      <ContinueLearningSection
        data={data}
      />

      <LearningFeedSection
        data={data}
        loadingMore={
          loadingMore
        }
        onLoadMore={
          onLoadMore
        }
        onRefresh={onRefresh}
        onNotice={setNotice}
      />
    </div>
  );
}
