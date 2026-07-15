"use client";

import Link from "next/link";

import type {
  DashboardAttentionItem,
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
    <div className="rounded-xl border border-dashed border-yellow-400/20 bg-black px-4 py-6 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-yellow-400/25 bg-yellow-400/10 text-xl">
        {icon}
      </span>

      <p className="mt-3 text-sm font-black text-yellow-100">
        {title}
      </p>

      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">
        {description}
      </p>

      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-4 inline-flex rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-xs font-black text-yellow-200 transition hover:bg-yellow-300/15"
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
          className="animate-pulse rounded-2xl border border-white/[0.08] bg-[#090d13] p-4 sm:p-5"
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
    <section className="overflow-hidden rounded-2xl border border-yellow-400/35 bg-black shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
      <div className="h-1 bg-gradient-to-r from-yellow-400 via-yellow-300 to-transparent" />

      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-yellow-400/35 bg-yellow-400/10 text-2xl">
            {item.icon}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-400">
                Best next step
              </p>

              <span className="rounded-full border border-yellow-400/20 bg-yellow-400/[0.06] px-2 py-1 text-[9px] font-black text-yellow-200/70">
                {item.reason}
              </span>
            </div>

            <h2 className="mt-2 text-xl font-black text-yellow-100">
              {item.title}
            </h2>

            <p className="mt-1 text-sm leading-6 text-slate-400">
              {item.description}
            </p>
          </div>

          <Link
            href={item.action_href}
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-black text-black transition hover:bg-yellow-300"
          >
            {item.action_label}
            <span className="ml-2">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}


function AttentionRow({
  item,
}: {
  item: DashboardAttentionItem;
}) {
  return (
    <Link
      href={item.action_href}
      className="group flex items-start gap-3 rounded-xl border border-yellow-400/15 bg-black p-3 transition hover:border-yellow-400/40 hover:bg-yellow-400/[0.04]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-yellow-400/25 bg-yellow-400/10 text-lg">
        {item.icon}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-black text-yellow-100">
            {item.title}
          </p>

          <span className="rounded-full border border-yellow-400/15 bg-yellow-400/[0.05] px-2 py-1 text-[9px] font-black text-yellow-200/60">
            {item.reason}
          </span>
        </div>

        <p className="mt-1 line-clamp-2 text-xs leading-5 text-yellow-100/45">
          {item.description}
        </p>
      </div>

      <span className="shrink-0 rounded-lg border border-yellow-400/30 bg-yellow-400/10 px-2.5 py-1.5 text-[10px] font-black text-yellow-200 transition group-hover:bg-yellow-400 group-hover:text-black">
        {item.action_label}
      </span>
    </Link>
  );
}


function NeedsAttentionSection({
  data,
}: {
  data: SmartDashboardResponse;
}) {
  const emptyState =
    data.empty_states.needs_attention;

  return (
    <section className="rounded-2xl border border-yellow-400/20 bg-black p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-yellow-300">
            <span>⚠️</span>
            Needs Attention
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Important unfinished work and learning signals.
          </p>
        </div>

        {data.needs_attention.length ? (
          <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-2.5 py-1 text-[10px] font-black text-yellow-200">
            {data.needs_attention.length}
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {data.needs_attention.length ? (
          data.needs_attention.map((item) => (
            <AttentionRow
              key={item.id}
              item={item}
            />
          ))
        ) : (
          <EmptySection
            icon="✓"
            title={emptyState.title}
            description={emptyState.description}
          />
        )}
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
      className="group grid gap-3 rounded-xl border border-yellow-400/15 bg-black p-3 transition hover:border-yellow-400/40 hover:bg-yellow-400/[0.04] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-yellow-400/25 bg-yellow-400/10 text-lg">
          {item.icon}
        </span>

        <div className="min-w-0">
          <p className="truncate text-sm font-black text-yellow-100">
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
                className="h-full rounded-full bg-yellow-400"
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

            <span className="w-9 text-right text-[10px] font-black text-yellow-300">
              {item.progress_percent}%
            </span>
          </>
        ) : null}

        <span className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-[10px] font-black text-slate-300 transition group-hover:border-yellow-400/40 group-hover:text-yellow-200">
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
  const emptyState =
    data.empty_states.continue_learning;

  return (
    <section className="rounded-2xl border border-yellow-400/20 bg-black p-4 sm:p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-black text-yellow-300">
          <span>📖</span>
          Continue Learning
        </h2>

        <p className="mt-1 text-xs text-slate-500">
          Resume your most recent meaningful work.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {data.continue_learning.length ? (
          data.continue_learning.map((item) => (
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
    </section>
  );
}


function GroupActivityRow({
  item,
}: {
  item: DashboardFeedItem;
}) {
  const unreadCount =
    typeof item.metadata.unread_count === "number"
      ? item.metadata.unread_count
      : null;

  return (
    <Link
      href={item.action_href}
      className="group flex items-start gap-3 rounded-xl border border-violet-300/10 bg-violet-300/[0.035] p-3 transition hover:border-violet-300/20 hover:bg-violet-300/[0.055]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-300/10 text-lg">
        {item.icon}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-black text-yellow-100">
            {item.title}
          </p>

          {unreadCount ? (
            <span className="grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-black text-white">
              {unreadCount}
            </span>
          ) : null}
        </div>

        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
          {item.description}
        </p>

        <p className="mt-1 text-[10px] font-bold text-slate-600">
          {formatRelativeTime(item.timestamp)}
        </p>
      </div>

      <span className="shrink-0 rounded-lg border border-violet-300/15 px-2.5 py-1.5 text-[10px] font-black text-violet-200">
        Open
      </span>
    </Link>
  );
}


function GroupActivitySection({
  data,
}: {
  data: SmartDashboardResponse;
}) {
  const emptyState =
    data.empty_states.group_activity;

  return (
    <section className="rounded-2xl border border-yellow-400/20 bg-black p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-yellow-300">
            <span>💬</span>
            New Group Activity
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Messages and updates from Study Together.
          </p>
        </div>

        {data.unread_group_count > 0 ? (
          <span className="rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-black text-white">
            {data.unread_group_count} unread
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {data.group_activity.length ? (
          data.group_activity.map((item) => (
            <GroupActivityRow
              key={item.id}
              item={item}
            />
          ))
        ) : (
          <EmptySection
            icon="💬"
            title={emptyState.title}
            description={emptyState.description}
            actionHref="/study-together"
            actionLabel="Open Study Together"
          />
        )}
      </div>
    </section>
  );
}


function FeedItem({
  item,
}: {
  item: DashboardFeedItem;
}) {
  const groupedCount =
    typeof item.metadata.grouped_count === "number"
      ? item.metadata.grouped_count
      : 1;

  return (
    <article className="border-b border-white/[0.065] px-3 py-4 last:border-b-0 sm:px-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-lg">
          {item.icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <h3 className="min-w-0 flex-1 text-sm font-black leading-5 text-white">
              {item.title}
            </h3>

            <span className="shrink-0 text-[10px] font-bold text-slate-600">
              {formatRelativeTime(item.timestamp)}
            </span>
          </div>

          <p className="mt-1 text-xs leading-5 text-slate-400">
            {item.description}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-600">
            {item.actor_name ? (
              <span>{item.actor_name}</span>
            ) : null}

            {item.room_name ? (
              <span className="rounded-full border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-slate-500">
                {item.room_name}
              </span>
            ) : null}

            {groupedCount > 1 ? (
              <span>
                {groupedCount} grouped actions
              </span>
            ) : null}
          </div>

          <Link
            href={item.action_href}
            className="mt-3 inline-flex items-center rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[10px] font-black text-slate-300 transition hover:border-yellow-300/20 hover:text-yellow-200"
          >
            {item.action_label}
            <span className="ml-1.5">→</span>
          </Link>
        </div>
      </div>
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
  const emptyState =
    data.empty_states.feed;

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#090d13]">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] p-4 sm:p-5">
        <div>
          <h2 className="text-lg font-black text-white">
            Learning Feed
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Your newest learning activity first.
          </p>
        </div>

        <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[10px] font-black text-slate-500">
          Recent → older
        </span>
      </div>

      {data.feed.length ? (
        <div>
          {data.feed.map((item) => (
            <FeedItem
              key={item.id}
              item={item}
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
          {data.has_more && data.next_cursor ? (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-2.5 text-xs font-black text-slate-200 transition hover:border-yellow-300/20 hover:text-yellow-200 disabled:cursor-wait disabled:opacity-50"
            >
              {loadingMore
                ? "Loading older activity..."
                : "Load older activity"}
            </button>
          ) : (
            <>
              <p className="text-sm font-black text-yellow-100">
                You’re all caught up
              </p>

              <p className="mt-1 text-xs text-slate-500">
                That is everything in your learning history so far.
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
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
        <p className="text-sm font-black text-yellow-100">
          StudySnap could not load your learning feed
        </p>

        <p className="mt-1 text-xs leading-5 text-slate-400">
          {error ||
            "Your dashboard data is temporarily unavailable."}
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-yellow-300 px-4 py-2 text-xs font-black text-black"
        >
          Try again
        </button>
      </section>
    );
  }

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
            className="shrink-0 text-[10px] font-black text-yellow-300"
          >
            Refresh
          </button>
        </div>
      ) : null}

      <NextStepCard item={data.next_step} />

      <NeedsAttentionSection data={data} />

      <ContinueLearningSection data={data} />

      <GroupActivitySection data={data} />

      <LearningFeedSection
        data={data}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
      />
    </div>
  );
}
