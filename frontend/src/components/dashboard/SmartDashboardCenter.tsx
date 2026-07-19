"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getProtectedFileBlobUrl,
  hideAIAttachmentFromFeed,
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
  onLoadMore: () => void;
};


function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "Recently";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "Recently";
  }

  const difference = Date.now() - timestamp;

  if (difference < 0) {
    return "Just now";
  }

  const minutes = Math.max(
    1,
    Math.floor(difference / 60_000),
  );

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(value).toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
    },
  );
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
    <div className="rounded-xl border border-dashed border-white/[0.07] bg-[#12181e] px-4 py-6 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-[#c9ad50]/[0.18] bg-[#c9ad50]/10 text-xl">
        {icon}
      </span>

      <p className="mt-3 text-sm font-black text-[#f0ead3]">
        {title}
      </p>

      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">
        {description}
      </p>

      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-4 inline-flex rounded-lg border border-[#c9ad50]/[0.18] bg-[#c9ad50]/10 px-3 py-2 text-xs font-black text-[#dfce8c] transition hover:bg-[#c9ad50]/[0.14]"
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
      aria-label="Loading smart dashboard"
      aria-busy="true"
    >
      {[0, 1, 2].map((item) => (
        <section
          key={item}
          className="animate-pulse rounded-2xl border border-white/[0.07] bg-[#12181e] p-4 sm:p-5"
        >
          <div className="h-3 w-28 rounded bg-white/[0.07]" />
          <div className="mt-3 h-6 w-2/3 rounded bg-white/[0.07]" />
          <div className="mt-2 h-3 w-full rounded bg-white/[0.05]" />
          <div className="mt-2 h-3 w-4/5 rounded bg-white/[0.05]" />
          <div className="mt-4 h-9 w-28 rounded-lg bg-white/[0.07]" />
        </section>
      ))}
    </div>
  );
}


function NextStepCard({
  item,
}: {
  item: DashboardNextStep;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#c9ad50]/[0.24] bg-[#12181e] shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
      <div className="h-1 bg-gradient-to-r from-[#c9ad50] via-[#c8ad4c] to-transparent" />

      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[#c9ad50]/[0.24] bg-[#c9ad50]/10 text-2xl">
            {item.icon}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c9ad50]">
                Best next step
              </p>

              <span className="rounded-full border border-white/[0.07] bg-[#c9ad50]/[0.06] px-2 py-1 text-[9px] font-black text-[#dfce8c]/70">
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
            href={item.action_href}
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#c9ad50] px-4 py-2.5 text-sm font-black text-black transition hover:bg-[#d5bb63]"
          >
            {item.action_label}
            <span className="ml-2">→</span>
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
    typeof item.progress_percent === "number";

  return (
    <Link
      href={item.action_href}
      className="group grid gap-3 rounded-xl border border-white/[0.07] bg-[#12181e] p-3 transition hover:border-[#c9ad50]/[0.28] hover:bg-[#c9ad50]/[0.04] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#c9ad50]/[0.18] bg-[#c9ad50]/10 text-lg">
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
              <span>{item.room_name}</span>
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
                className="h-full rounded-full bg-[#c9ad50]"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(
                      100,
                      item.progress_percent || 0,
                    ),
                  )}%`,
                }}
              />
            </div>

            <span className="w-9 text-right text-[10px] font-black text-[#c9ad50]">
              {item.progress_percent}%
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
    const [expanded, setExpanded] =
      useState(false);

    const emptyState =
      data.empty_states.continue_learning;

    const visibleItems = expanded
      ? data.continue_learning
      : data.continue_learning.slice(0, 3);

    const hasMore =
      data.continue_learning.length > 3;

    return (
      <section className="rounded-2xl border border-white/[0.07] bg-[#12181e] p-4 sm:p-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-[#c9ad50]">
            <span>📖</span>
            Continue Learning
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Resume your most recent meaningful work.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {visibleItems.length ? (
            visibleItems.map((item) => (
              <ContinueRow
                key={item.id}
                item={item}
              />
            ))
          ) : (
            <EmptySection
              icon="📖"
              title={emptyState.title}
              description={emptyState.description}
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
                setExpanded((current) => !current)
              }
              className="rounded-xl border border-white/[0.075] bg-white/[0.035] px-4 py-2.5 text-xs font-black text-slate-200 transition hover:border-[#c9ad50]/[0.18] hover:text-[#dfce8c]"
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
}: {
  path: string;
  alt: string;
}) {
  const [source, setSource] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = "";

    void getProtectedFileBlobUrl(path)
      .then((url) => {
        objectUrl = url;

        if (active) {
          setSource(url);
        } else {
          URL.revokeObjectURL(url);
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
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [path]);

  if (failed) {
    return (
      <div className="grid min-h-40 place-items-center rounded-xl bg-black/25 text-sm font-bold text-slate-500">
        Image unavailable
      </div>
    );
  }

  if (!source) {
    return (
      <div className="grid min-h-48 animate-pulse place-items-center rounded-xl bg-white/[0.035] text-xs font-bold text-slate-600">
        Loading…
      </div>
    );
  }

  return (
    <img
      src={source}
      alt={alt}
      className="max-h-[520px] w-full rounded-xl object-contain"
    />
  );
}


function FeedItem({
  item,
  onHide,
}: {
  item: DashboardFeedItem;
  onHide: (itemId: string) => void;
}) {
  const groupedCount =
    typeof item.metadata.grouped_count === "number"
      ? item.metadata.grouped_count
      : 1;

  const attachmentKind =
    typeof item.metadata.attachment_kind === "string"
      ? item.metadata.attachment_kind
      : "";

  const attachmentUrl =
    typeof item.metadata.attachment_url === "string"
      ? item.metadata.attachment_url
      : "";

  const isAttachment =
    item.event === "ai_attachment_uploaded" &&
    Boolean(attachmentUrl);

  const isImage =
    isAttachment &&
    attachmentKind === "image";

  const messageId =
    item.entity_type === "ai_message_attachment" &&
    typeof item.entity_id === "number"
      ? item.entity_id
      : null;

  async function openProtectedFile() {
    if (!attachmentUrl) return;

    try {
      const url =
        await getProtectedFileBlobUrl(
          attachmentUrl
        );

      window.open(
        url,
        "_blank",
        "noopener,noreferrer"
      );

      window.setTimeout(
        () => URL.revokeObjectURL(url),
        60_000
      );
    } catch {
      window.location.assign(
        item.action_href
      );
    }
  }

  async function hideImage() {
    if (messageId === null) return;

    await hideAIAttachmentFromFeed(
      messageId
    );

    onHide(item.id);
  }

  if (isImage) {
    return (
      <article className="border-b border-white/[0.065] p-3 last:border-b-0 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <Link
            href={item.action_href}
            className="min-w-0 truncate text-sm font-black text-white hover:text-[#dfce8c]"
          >
            {item.title}
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[10px] font-bold text-slate-600">
              {formatRelativeTime(item.timestamp)}
            </span>

            <details className="relative">
              <summary
                aria-label="Image options"
                title="Image options"
                className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-lg text-sm font-black text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
              >
                •••
              </summary>

              <div className="absolute right-0 top-9 z-20 min-w-28 rounded-xl border border-white/10 bg-[#171d23] p-1.5 shadow-2xl">
                <button
                  type="button"
                  onClick={() =>
                    void hideImage()
                  }
                  className="w-full rounded-lg px-3 py-2 text-left text-xs font-black text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
                >
                  Hide
                </button>
              </div>
            </details>
          </div>
        </div>

        <Link
          href={item.action_href}
          className="block overflow-hidden rounded-xl bg-black/20"
        >
          <ProtectedFeedImage
            path={attachmentUrl}
            alt={item.title}
          />
        </Link>

        {item.room_name ? (
          <p className="mt-2 truncate text-[10px] font-bold text-slate-600">
            {item.room_name}
          </p>
        ) : null}
      </article>
    );
  }

  if (isAttachment) {
    return (
      <button
        type="button"
        onClick={() =>
          void openProtectedFile()
        }
        className="flex w-full items-center gap-3 border-b border-white/[0.065] px-3 py-3 text-left transition last:border-b-0 hover:bg-white/[0.025] sm:px-4"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-lg">
          📄
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white">
            {item.title}
          </p>

          <p className="mt-0.5 truncate text-[10px] font-bold text-slate-600">
            {item.room_name
              ? `${item.room_name} · `
              : ""}
            {formatRelativeTime(item.timestamp)}
          </p>
        </div>

        <span className="text-sm text-slate-600">
          ›
        </span>
      </button>
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
              {formatRelativeTime(item.timestamp)}
            </span>
          </div>

          {item.description ? (
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {item.description}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-600">
            {item.actor_name ? (
              <span>{item.actor_name}</span>
            ) : null}

            {item.room_name ? (
              <span>{item.room_name}</span>
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
}: {
  data: SmartDashboardResponse;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const [expanded, setExpanded] =
    useState(false);

  const emptyState =
    data.empty_states.feed;

  const [hiddenItemIds, setHiddenItemIds] =
    useState<Set<string>>(
      () => new Set()
    );

  const availableItems = data.feed.filter(
    (item) => !hiddenItemIds.has(item.id)
  );

  const visibleItems = expanded
    ? availableItems
    : availableItems.slice(0, 3);

  function hideFeedItem(itemId: string) {
    setHiddenItemIds((current) => {
      const next = new Set(current);
      next.add(itemId);
      return next;
    });
  }

  const hasMoreActivity =
    availableItems.length > 3 ||
    Boolean(
      data.has_more &&
      data.next_cursor
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

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[#12181e]">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] p-4 sm:p-5">
        <div>
          <h2 className="text-lg font-black text-white">
            Learning Feed
          </h2>

        </div>

      </div>

      {data.feed.length ? (
        <div>
          {visibleItems.map((item) => (
            <FeedItem
              key={item.id}
              item={item}
              onHide={hideFeedItem}
            />
          ))}
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <EmptySection
            icon="✨"
            title={emptyState.title}
            description={emptyState.description}
            actionHref="/study-rooms/organize"
            actionLabel="Upload material"
          />
        </div>
      )}

      {data.feed.length ? (
        <div className="border-t border-white/[0.07] p-4 text-center">
          {!expanded && hasMoreActivity ? (
            <button
              type="button"
              onClick={handleViewAll}
              disabled={loadingMore}
              className="rounded-xl border border-white/[0.075] bg-white/[0.035] px-4 py-2.5 text-xs font-black text-slate-200 transition hover:border-[#c9ad50]/[0.18] hover:text-[#dfce8c] disabled:cursor-wait disabled:opacity-50"
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
                  setExpanded(false)
                }
                className="rounded-xl border border-white/[0.075] bg-white/[0.025] px-4 py-2.5 text-xs font-black text-slate-300 transition hover:text-white"
              >
                Show less
              </button>

              {data.has_more &&
              data.next_cursor ? (
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="rounded-xl border border-white/[0.075] bg-white/[0.035] px-4 py-2.5 text-xs font-black text-slate-200 transition hover:border-[#c9ad50]/[0.18] hover:text-[#dfce8c] disabled:cursor-wait disabled:opacity-50"
                >
                  {loadingMore
                    ? "Loading older activity..."
                    : "Load older activity"}
                </button>
              ) : (
                <span className="px-2 text-xs font-bold text-slate-500">
                  You’re all caught up
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
  reason: unknown
) {
  const normalized =
    typeof reason === "string"
      ? reason.trim().toLowerCase()
      : "";

  return (
    normalized.includes(
      "unread group"
    ) ||
    normalized.includes(
      "new material not reviewed"
    ) ||
    normalized.includes(
      "group activity"
    ) ||
    normalized.includes(
      "notification"
    )
  );
}


export default function SmartDashboardCenter({
  data,
  loading,
  loadingMore,
  error,
  onRetry,
  onLoadMore,
}: SmartDashboardCenterProps) {
  if (loading && !data) {
    return <LoadingDashboardFeed />;
  }

  if (!data) {
    return (
      <section className="rounded-2xl border border-red-400/15 bg-red-400/[0.04] p-5 text-center">
        <p className="text-sm font-black text-[#f0ead3]">
          StudySnap could not load your learning feed
        </p>

        <p className="mt-1 text-xs leading-5 text-slate-400">
          {error ||
            "Your dashboard data is temporarily unavailable."}
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-[#c9ad50]0 px-4 py-2 text-xs font-black text-black"
        >
          Try again
        </button>
      </section>
    );
  }

  const showBestNextStep =
    Boolean(data.next_step) &&
    !isNotificationOnlyNextStep(
      data.next_step?.reason
    );

  return (
    <div className="space-y-5">
      {error ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2.5"
        >
          <p className="text-xs text-amber-100">
            {error} Showing the latest saved dashboard data.
          </p>

          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 text-[10px] font-black text-[#c9ad50]"
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

      <ContinueLearningSection data={data} />

      <LearningFeedSection
        data={data}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
      />
    </div>
  );
}
