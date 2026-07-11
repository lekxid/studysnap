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
import { loadJSON, saveJSON } from "@/lib/storage";

type Notice = {
  id: number;
  text: string;
  createdAt: string;
  createdAtIso?: string;
  href?: string;
  actionLabel?: string;
  kind?: "planner" | "study-reminder" | "general";
  dedupeKey?: string;
  read?: boolean;
};

const STORAGE_KEY = "studysnap_notifications";
const LAST_APP_VISIT_KEY = "studysnap:last-app-visit-at";
const LAST_STUDY_ACTIVITY_KEY =
  "studysnap:last-study-activity-at";
const LAST_REMINDER_DAY_KEY =
  "studysnap:last-study-reminder-day";

const REMINDER_AFTER_HOURS = 24;
const MAX_NOTIFICATIONS = 30;

function getDayKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
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
        typeof item.id === "number" &&
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

    const now = new Date();
    const nowIso = now.toISOString();
    const todayKey = getDayKey(now);

    const saved = normalizeNotices(
      loadJSON<Notice[]>(STORAGE_KEY, [])
    );

    const lastStudyActivity = window.localStorage.getItem(
      LAST_STUDY_ACTIVITY_KEY
    );

    const previousAppVisit = window.localStorage.getItem(
      LAST_APP_VISIT_KEY
    );

    const activityTime =
      parseTime(lastStudyActivity) ??
      parseTime(previousAppVisit);

    const inactiveHours =
      activityTime === null
        ? 0
        : (now.getTime() - activityTime) / 3_600_000;

    const lastReminderDay = window.localStorage.getItem(
      LAST_REMINDER_DAY_KEY
    );

    const reminderDedupeKey =
      `study-reminder:${todayKey}`;

    const alreadySaved = saved.some(
      (item) => item.dedupeKey === reminderDedupeKey
    );

    let nextItems = saved;

    if (
      inactiveHours >= REMINDER_AFTER_HOURS &&
      lastReminderDay !== todayKey &&
      !alreadySaved
    ) {
      const activeRoomId = getSavedProjectRoomId();

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

      nextItems = [reminder, ...saved].slice(
        0,
        MAX_NOTIFICATIONS
      );

      saveJSON(STORAGE_KEY, nextItems);

      window.localStorage.setItem(
        LAST_REMINDER_DAY_KEY,
        todayKey
      );
    }

    setItems(nextItems);

    window.localStorage.setItem(
      LAST_APP_VISIT_KEY,
      nowIso
    );
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
      const latest = reloadNotifications();

      const markedRead = latest.map((item) => ({
        ...item,
        read: true,
      }));

      persist(markedRead);
    }

    setOpen(nextOpen);
  }

  function clearAll() {
    persist([]);
  }

  function dismissNotice(id: number) {
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
                Gentle reminders and important study updates.
              </p>
            </div>

            {items.length ? (
              <button
                type="button"
                onClick={clearAll}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-red-300 transition hover:bg-red-400/10 hover:text-red-200"
              >
                Clear all
              </button>
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
                    "rounded-2xl border p-4",
                    item.kind === "study-reminder"
                      ? "border-yellow-300/25 bg-gradient-to-br from-yellow-300/12 to-cyan-300/[0.05]"
                      : "border-white/10 bg-white/[0.03]",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-lg">
                      {item.kind === "study-reminder"
                        ? "🌱"
                        : "🔔"}
                    </span>

                    <div className="min-w-0 flex-1">
                      {item.kind === "study-reminder" ? (
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-yellow-200">
                          Gentle study reminder
                        </p>
                      ) : null}

                      <p className="mt-1 text-sm leading-6 text-slate-100">
                        {item.text}
                      </p>

                      <p className="mt-2 text-[11px] font-bold text-slate-500">
                        {formatRelativeTime(item)}
                      </p>

                      {item.href && item.actionLabel ? (
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="mt-3 inline-flex rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-xs font-black text-yellow-100 transition hover:bg-yellow-300/20"
                        >
                          {item.actionLabel} →
                        </Link>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => dismissNotice(item.id)}
                      aria-label="Dismiss notification"
                      className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      ×
                    </button>
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
