"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getSavedProjectRoomId,
} from "@/features/projects/projectRoomContext";
import {
  getLearningInsights,
  getSmartDashboard,
  getUserSettings,
} from "@/lib/api";
import { loadJSON, saveJSON } from "@/lib/storage";

type Notice = {
  id: number | string;
  text: string;
  createdAt: string;
  createdAtIso?: string;
  href?: string;
  actionLabel?: string;
  kind?:
    | "planner"
    | "study-reminder"
    | "daily-summary"
    | "dashboard"
    | "general";
  source?: "dashboard" | "local";
  dedupeKey?: string;
  read?: boolean;
};

const STORAGE_KEY = "studysnap_notifications";
const LAST_APP_VISIT_KEY = "studysnap:last-app-visit-at";
const LAST_STUDY_ACTIVITY_KEY =
  "studysnap:last-study-activity-at";
const LAST_REMINDER_DAY_KEY =
  "studysnap:last-study-reminder-day";
const REMINDER_SNOOZED_UNTIL_KEY =
  "studysnap:study-reminder-snoozed-until";
const LAST_DAILY_SUMMARY_DAY_KEY =
  "studysnap:last-daily-summary-day";
const DISMISSED_DASHBOARD_NOTICES_KEY =
  "studysnap:dismissed-dashboard-notifications";

const REMINDER_AFTER_HOURS = 24;
const MAX_NOTIFICATIONS = 30;

function getDayKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

type DailySummaryInsights = {
  learning_score?: number;
  cards_reviewed_today?: number;
  correct_today?: number;
  wrong_today?: number;
  study_streak?: number;
  ai_recommendation?: string;
};

function cleanSummaryText(
  value: string | null | undefined,
  maxLength = 180
) {
  const cleaned = (value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength).trim()}...`;
}

function allowsDailySummary(
  preference: string | null | undefined
) {
  return preference?.trim().toLowerCase() === "daily summary";
}

function allowsStudyReminders(
  preference: string | null | undefined
) {
  return preference?.trim().toLowerCase() === "study reminders";
}

function parseTime(value: string | null) {
  if (!value) return null;

  const parsed = new Date(value).getTime();

  return Number.isNaN(parsed) ? null : parsed;
}

function formatRelativeTime(notice: Notice) {
  const value = notice.createdAtIso || notice.createdAt;
  const createdTime = parseTime(value);

  if (createdTime === null) {
    return notice.createdAt;
  }

  const difference = Date.now() - createdTime;
  const minutes = Math.max(1, Math.round(difference / 60000));

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.round(hours / 24);

  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function normalizeNotices(value: Notice[]) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item) =>
        item &&
        (typeof item.id === "number" ||
          typeof item.id === "string") &&
        typeof item.text === "string"
    )
    .slice(0, MAX_NOTIFICATIONS);
}

export default function NotificationBell() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);

  const unreadCount = useMemo(
    () => items.filter((item) => item.read !== true).length,
    [items]
  );

  function persist(nextItems: Notice[]) {
    const normalized = normalizeNotices(nextItems);

    setItems(normalized);
    saveJSON(STORAGE_KEY, normalized);
  }

  function reloadNotifications() {
    const saved = normalizeNotices(
      loadJSON<Notice[]>(STORAGE_KEY, [])
    );

    setItems(saved);
    return saved;
  }

  useEffect(() => {
    if (initializedRef.current) return;

    initializedRef.current = true;

    let cancelled = false;

    async function initializeNotifications() {
      const now = new Date();
      const nowIso = now.toISOString();
      const todayKey = getDayKey(now);

      const saved = normalizeNotices(
        loadJSON<Notice[]>(STORAGE_KEY, [])
      );

      let notificationPreference: string | null = null;

      try {
        const settings = await getUserSettings();
        notificationPreference =
          settings.notifications || "Important only";
      } catch {
        // Keep existing notifications when settings cannot be loaded.
        // Do not create a new reminder until the preference is known.
      }

      if (cancelled) return;

      const settingsLoaded =
        notificationPreference !== null;

      const studyRemindersEnabled =
        allowsStudyReminders(notificationPreference);

      const dailySummaryEnabled =
        allowsDailySummary(notificationPreference);

      let nextItems = saved;

      if (settingsLoaded) {
        nextItems = saved.filter((item) => {
          if (item.kind === "study-reminder") {
            return studyRemindersEnabled;
          }

          if (item.kind === "daily-summary") {
            return dailySummaryEnabled;
          }

          return true;
        });

        if (nextItems.length !== saved.length) {
          saveJSON(STORAGE_KEY, nextItems);
        }
      }

      const lastStudyActivity =
        window.localStorage.getItem(
          LAST_STUDY_ACTIVITY_KEY
        );

      const previousAppVisit =
        window.localStorage.getItem(
          LAST_APP_VISIT_KEY
        );

      const activityTime =
        parseTime(lastStudyActivity) ??
        parseTime(previousAppVisit);

      const inactiveHours =
        activityTime === null
          ? 0
          : (now.getTime() - activityTime) / 3_600_000;

      const lastReminderDay =
        window.localStorage.getItem(
          LAST_REMINDER_DAY_KEY
        );

      const snoozedUntil = parseTime(
        window.localStorage.getItem(
          REMINDER_SNOOZED_UNTIL_KEY
        )
      );

      const reminderIsSnoozed =
        snoozedUntil !== null &&
        now.getTime() < snoozedUntil;

      if (
        snoozedUntil !== null &&
        now.getTime() >= snoozedUntil
      ) {
        window.localStorage.removeItem(
          REMINDER_SNOOZED_UNTIL_KEY
        );
      }

      const reminderDedupeKey =
        `study-reminder:${todayKey}`;

      const alreadySaved = nextItems.some(
        (item) =>
          item.dedupeKey === reminderDedupeKey
      );

      if (
        studyRemindersEnabled &&
        !reminderIsSnoozed &&
        inactiveHours >= REMINDER_AFTER_HOURS &&
        lastReminderDay !== todayKey &&
        !alreadySaved
      ) {
        const activeRoomId =
          getSavedProjectRoomId();

        const reminder: Notice = {
          id: Date.now(),
          kind: "study-reminder",
          dedupeKey: reminderDedupeKey,
          read: false,
          text:
            inactiveHours >= 72
              ? "Welcome back. Take a quiet 10-minute study break and restart with one small step—no pressure."
              : "A quiet 10-minute study break can help you keep your learning fresh. Continue with one small step.",
          createdAt: now.toLocaleString("en-CA", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }),
          createdAtIso: nowIso,
          href: activeRoomId
            ? `/study-rooms/${activeRoomId}`
            : "/study-rooms",
          actionLabel: activeRoomId
            ? "Continue my room"
            : "Choose a study room",
        };

        nextItems = [
          reminder,
          ...nextItems,
        ].slice(0, MAX_NOTIFICATIONS);

        saveJSON(STORAGE_KEY, nextItems);

        window.localStorage.setItem(
          LAST_REMINDER_DAY_KEY,
          todayKey
        );
      }

      const lastDailySummaryDay =
        window.localStorage.getItem(
          LAST_DAILY_SUMMARY_DAY_KEY
        );

      const dailySummaryDedupeKey =
        `daily-summary:${todayKey}`;

      const dailySummaryAlreadySaved =
        nextItems.some(
          (item) =>
            item.dedupeKey === dailySummaryDedupeKey
        );

      if (
        dailySummaryEnabled &&
        lastDailySummaryDay !== todayKey &&
        !dailySummaryAlreadySaved
      ) {
        try {
          const insights =
            (await getLearningInsights()) as DailySummaryInsights;

          if (cancelled) return;

          const reviews = Math.max(
            0,
            Number(insights.cards_reviewed_today) || 0
          );

          const correct = Math.max(
            0,
            Number(insights.correct_today) || 0
          );

          const wrong = Math.max(
            0,
            Number(insights.wrong_today) || 0
          );

          const streak = Math.max(
            0,
            Number(insights.study_streak) || 0
          );

          const learningScore = Math.max(
            0,
            Math.round(
              Number(insights.learning_score) || 0
            )
          );

          const recommendation = cleanSummaryText(
            insights.ai_recommendation
          );

          const hasUsefulSummary =
            reviews > 0 ||
            correct > 0 ||
            wrong > 0 ||
            streak > 0 ||
            learningScore > 0 ||
            recommendation.length > 0;

          if (hasUsefulSummary) {
            const summaryParts: string[] = [];

            if (reviews > 0) {
              summaryParts.push(
                `Today you reviewed ${reviews} Concept Card${
                  reviews === 1 ? "" : "s"
                }.`
              );
            } else {
              summaryParts.push(
                "No reviews have been recorded yet today."
              );
            }

            if (correct > 0 || wrong > 0) {
              summaryParts.push(
                `${correct} correct and ${wrong} to review.`
              );
            }

            if (streak > 0) {
              summaryParts.push(
                `Your study streak is ${streak} day${
                  streak === 1 ? "" : "s"
                }.`
              );
            }

            if (learningScore > 0) {
              summaryParts.push(
                `Learning score: ${learningScore}%.`
              );
            }

            if (recommendation) {
              summaryParts.push(
                `Next: ${recommendation}`
              );
            }

            const activeRoomId =
              getSavedProjectRoomId();

            const dailySummary: Notice = {
              id: Date.now(),
              kind: "daily-summary",
              dedupeKey: dailySummaryDedupeKey,
              read: false,
              text: summaryParts.join(" "),
              createdAt: now.toLocaleString("en-CA", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }),
              createdAtIso: nowIso,
              href: activeRoomId
                ? `/study-rooms/${activeRoomId}`
                : "/dashboard",
              actionLabel: activeRoomId
                ? "Continue my room"
                : "View my progress",
            };

            nextItems = [
              dailySummary,
              ...nextItems,
            ].slice(0, MAX_NOTIFICATIONS);

            saveJSON(STORAGE_KEY, nextItems);

            window.localStorage.setItem(
              LAST_DAILY_SUMMARY_DAY_KEY,
              todayKey
            );
          }
        } catch {
          // Do not create an empty summary when insights fail.
        }
      }

      try {
        const dashboard = await getSmartDashboard({
          limit: 1,
        });

        const dismissedKeys = new Set(
          loadJSON<string[]>(
            DISMISSED_DASHBOARD_NOTICES_KEY,
            []
          )
        );

        const existingByDedupeKey = new Map(
          nextItems
            .filter(
              (item) =>
                typeof item.dedupeKey === "string"
            )
            .map((item) => [
              item.dedupeKey as string,
              item,
            ])
        );

        const dashboardNotices: Notice[] =
          dashboard.needs_attention
            .map((signal) => {
              const dedupeKey = [
                "dashboard",
                signal.id,
                signal.created_at,
              ].join(":");

              const existing =
                existingByDedupeKey.get(dedupeKey);

              return {
                id: dedupeKey,
                kind: "dashboard" as const,
                source: "dashboard" as const,
                dedupeKey,
                read: existing?.read === true,
                text: signal.description
                  ? `${signal.title}: ${signal.description}`
                  : signal.title,
                createdAt: signal.created_at,
                createdAtIso: signal.created_at,
                href: signal.action_href,
                actionLabel: signal.action_label,
              };
            })
            .filter(
              (item) =>
                !dismissedKeys.has(
                  item.dedupeKey as string
                )
            );

        const localNotices = nextItems.filter(
          (item) => item.source !== "dashboard"
        );

        nextItems = [
          ...dashboardNotices,
          ...localNotices,
        ].slice(0, MAX_NOTIFICATIONS);

        saveJSON(STORAGE_KEY, nextItems);
      } catch {
        // Keep previously loaded notifications if dashboard
        // intelligence is temporarily unavailable.
      }

      setItems(nextItems);

      window.localStorage.setItem(
        LAST_APP_VISIT_KEY,
        nowIso
      );
    }

    void initializeNotifications();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;

      if (
        containerRef.current &&
        !containerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        reloadNotifications();
      }
    }

    function handleWindowFocus() {
      reloadNotifications();
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
      document.removeEventListener(
        "keydown",
        handleEscape
      );
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        "focus",
        handleWindowFocus
      );
    };
  }, []);

  function handleToggle() {
    const nextOpen = !open;

    if (nextOpen) {
      reloadNotifications();
    }

    setOpen(nextOpen);
  }

  function markAllRead() {
    persist(
      items.map((item) => ({
        ...item,
        read: true,
      }))
    );
  }

  function handleNoticeOpen(id: Notice["id"]) {
    persist(
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              read: true,
            }
          : item
      )
    );

    setOpen(false);
  }

  function rememberDismissedDashboardNotices(
    notices: Notice[]
  ) {
    const newKeys = notices
      .filter(
        (item) =>
          item.source === "dashboard" &&
          typeof item.dedupeKey === "string"
      )
      .map((item) => item.dedupeKey as string);

    if (!newKeys.length) {
      return;
    }

    const existing = loadJSON<string[]>(
      DISMISSED_DASHBOARD_NOTICES_KEY,
      []
    );

    saveJSON(
      DISMISSED_DASHBOARD_NOTICES_KEY,
      Array.from(
        new Set([
          ...existing,
          ...newKeys,
        ])
      ).slice(-200)
    );
  }

  function clearAll() {
    rememberDismissedDashboardNotices(items);
    persist([]);
  }

  function snoozeReminder(id: Notice["id"]) {
    const tomorrow = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    );

    window.localStorage.setItem(
      REMINDER_SNOOZED_UNTIL_KEY,
      tomorrow.toISOString()
    );

    persist(
      items.filter((item) => item.id !== id)
    );
  }

  function dismissNotice(id: Notice["id"]) {
    const notice = items.find(
      (item) => item.id === id
    );

    if (notice) {
      rememberDismissedDashboardNotices([
        notice,
      ]);
    }

    persist(items.filter((item) => item.id !== id));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={
          unreadCount
            ? `${unreadCount} unread notifications`
            : "Notifications"
        }
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-lg text-amber-100 transition hover:bg-white/[0.07]"
      >
        <span aria-hidden="true">🔔</span>

        {unreadCount ? (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-[#05080d] bg-yellow-300 px-1 text-[10px] font-black text-black">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-3 w-[min(24rem,calc(100vw-2rem))] rounded-[1.5rem] border border-white/10 bg-[#07111d]/98 p-4 text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-200">
                Study updates
              </p>

              <h3 className="mt-1 text-lg font-black text-white">
                Notifications
              </h3>

              <p className="mt-1 text-xs leading-5 text-slate-400">
                Gentle reminders, daily summaries, and important study updates.
              </p>
            </div>

            {items.length ? (
              <div className="flex shrink-0 flex-col items-end gap-1">
                {unreadCount ? (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="rounded-lg px-2 py-1 text-xs font-bold text-yellow-200 transition hover:bg-yellow-300/10 hover:text-yellow-100"
                  >
                    Mark all read
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg px-2 py-1 text-xs font-bold text-red-300 transition hover:bg-red-400/10 hover:text-red-200"
                >
                  Clear all
                </button>
              </div>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
              <p className="text-2xl">✨</p>

              <p className="mt-2 text-sm font-black text-white">
                You are all caught up
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-400">
                Helpful study reminders will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-4 max-h-[26rem] space-y-3 overflow-y-auto pr-1">
              {items.map((item) => (
                <article
                  key={item.id}
                  className={[
                    "rounded-2xl border p-4 transition",
                    item.read !== true
                      ? "ring-1 ring-yellow-300/20"
                      : "opacity-80",
                    item.kind === "study-reminder"
                      ? "border-yellow-300/25 bg-gradient-to-br from-yellow-300/12 to-cyan-300/[0.05]"
                      : item.kind === "daily-summary"
                        ? "border-cyan-300/25 bg-gradient-to-br from-cyan-300/10 to-emerald-300/[0.05]"
                        : "border-white/10 bg-white/[0.03]",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-lg">
                      {item.kind === "study-reminder"
                        ? "🌱"
                        : item.kind === "daily-summary"
                          ? "📊"
                          : "🔔"}
                    </span>

                    <div className="min-w-0 flex-1">
                      {item.kind === "study-reminder" ? (
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-yellow-200">
                          Gentle study reminder
                        </p>
                      ) : item.kind === "daily-summary" ? (
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">
                          Daily learning summary
                        </p>
                      ) : null}

                      <p className="mt-1 text-sm leading-6 text-slate-100">
                        {item.text}
                      </p>

                      <p className="mt-2 text-[11px] font-bold text-slate-500">
                        {formatRelativeTime(item)}
                      </p>

                      {item.kind === "study-reminder" ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.href && item.actionLabel ? (
                            <Link
                              href={item.href}
                              onClick={() =>
                                handleNoticeOpen(item.id)
                              }
                              className="inline-flex rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-xs font-black text-yellow-100 transition hover:bg-yellow-300/20"
                            >
                              {item.actionLabel} →
                            </Link>
                          ) : null}

                          <button
                            type="button"
                            onClick={() =>
                              snoozeReminder(item.id)
                            }
                            className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15"
                          >
                            Remind me tomorrow
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              dismissNotice(item.id)
                            }
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                          >
                            Dismiss
                          </button>
                        </div>
                      ) : item.href && item.actionLabel ? (
                        <Link
                          href={item.href}
                          onClick={() =>
                            handleNoticeOpen(item.id)
                          }
                          className="mt-3 inline-flex rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-xs font-black text-yellow-100 transition hover:bg-yellow-300/20"
                        >
                          {item.actionLabel} →
                        </Link>
                      ) : null}
                    </div>

                    {item.kind !== "study-reminder" ? (
                      <button
                        type="button"
                        onClick={() => dismissNotice(item.id)}
                        aria-label="Dismiss notification"
                        className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
