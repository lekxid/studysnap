"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import AppShell from "@/components/AppShell";
import ConnectedProjectBanner from "@/features/projects/ConnectedProjectBanner";
import {
  ensureProjectRoomIdInUrl,
  getActiveProjectRoomId,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";
import useRequireAuth from "@/hooks/useRequireAuth";
import { apiFetch } from "@/lib/api";
import { loadJSON, saveJSON } from "@/lib/storage";

type PlannerItem = {
  id: number;
  title: string;
  subject: string;
  date: string;
  time?: string;
  duration?: number;
  priority?: "Low" | "Medium" | "High";
  status?: "Planned" | "Done";
};

type ApiPlannerItem = {
  id: number;
  user_id: number;
  study_room_id: number | null;
  title: string;
  subject: string;
  description: string | null;
  scheduled_for: string;
  duration_minutes: number;
  priority: "Low" | "Medium" | "High";
  status: "Planned" | "Done";
  created_at: string;
  updated_at: string;
};

type SettingsState = {
  learningMode: string;
  knowledgeLevel: string;
  progressSharing: string;
  favoriteSubject: string;
  selectedSubjects: string[];
  dailyGoal: string;
  notifications: string;
};

const STORAGE_KEY = "studysnap_planner_items";
const NOTICE_KEY = "studysnap_notifications";
const SETTINGS_KEY = "studysnap_settings";
const CLOUD_IMPORT_KEY =
  "studysnap_planner_cloud_import_v1";

const defaultSettings: SettingsState = {
  learningMode: "Clear Explain",
  knowledgeLevel: "Medium",
  progressSharing: "Private",
  favoriteSubject: "",
  selectedSubjects: ["Networking / IT", "Linux"],
  dailyGoal: "Review 10 Concept Cards",
  notifications: "Important only",
};

function getTodayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function buildScheduledFor(
  date: string,
  time?: string,
) {
  return `${date}T${time || "00:00"}:00`;
}

function mapApiPlannerItem(
  item: ApiPlannerItem,
): PlannerItem {
  const [
    datePart,
    timeWithSeconds = "",
  ] = item.scheduled_for.split("T");

  const timePart = timeWithSeconds.slice(0, 5);

  return {
    id: item.id,
    title: item.title,
    subject: item.subject,
    date: datePart,
    time:
      timePart && timePart !== "00:00"
        ? timePart
        : "",
    duration: item.duration_minutes,
    priority: item.priority,
    status: item.status,
  };
}

function planMatchesContext(
  item: ApiPlannerItem,
  connectedRoomId: number | null,
) {
  if (connectedRoomId !== null) {
    return item.study_room_id === connectedRoomId;
  }

  return item.study_room_id === null;
}

function formatTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatDisplayDate(value: string) {
  if (!value) return "No date";

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getDateStatus(value: string) {
  if (!value) return "No date";

  const today = new Date(getTodayDateInput());
  const date = new Date(value);
  const diffDays = Math.round(
    (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `${diffDays} days`;
}

function getPriorityStyle(priority?: PlannerItem["priority"]) {
  if (priority === "High") {
    return "border-red-300/25 bg-red-500/10 text-red-100";
  }

  if (priority === "Low") {
    return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  }

  return "border-amber-300/25 bg-amber-400/10 text-amber-100";
}

export default function PlannerPage() {
  const ready = useRequireAuth();

  const [connectedRoomId, setConnectedRoomId] =
    useState<number | null>(null);

  const [plannerContextReady, setPlannerContextReady] =
    useState(false);

  const [plannerLoading, setPlannerLoading] =
    useState(true);

  const [plannerBusy, setPlannerBusy] =
    useState(false);

  const [items, setItems] =
    useState<PlannerItem[]>([]);

  const [settings, setSettings] =
    useState<SettingsState>(defaultSettings);

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(getTodayDateInput());
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("25");
  const [priority, setPriority] = useState<PlannerItem["priority"]>("Medium");
  const [error, setError] = useState("");

  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const notifiedRef = useRef(false);

  const storageKey = useMemo(() => {
    return connectedRoomId ? `${STORAGE_KEY}_room_${connectedRoomId}` : STORAGE_KEY;
  }, [connectedRoomId]);

  useEffect(() => {
    if (!ready) return;

    const requestedRoomId =
      getActiveProjectRoomId();

    if (requestedRoomId !== null) {
      saveProjectRoomId(requestedRoomId);
      ensureProjectRoomIdInUrl(
        requestedRoomId
      );
    }

    const savedSettings =
      loadJSON<SettingsState>(
        SETTINGS_KEY,
        defaultSettings
      );

    const mergedSettings = {
      ...defaultSettings,
      ...savedSettings,
      selectedSubjects:
        Array.isArray(
          savedSettings.selectedSubjects
        ) &&
        savedSettings.selectedSubjects.length > 0
          ? savedSettings.selectedSubjects
          : defaultSettings.selectedSubjects,
    };

    queueMicrotask(() => {
      setConnectedRoomId(requestedRoomId);
      setSettings(mergedSettings);

      setSubject((currentSubject) => {
        if (currentSubject.trim()) {
          return currentSubject;
        }

        return (
          mergedSettings.favoriteSubject ||
          mergedSettings.selectedSubjects[0] ||
          defaultSettings.selectedSubjects[0]
        );
      });

      setPlannerContextReady(true);
    });
  }, [ready]);

  useEffect(() => {
    if (
      !ready ||
      !plannerContextReady
    ) {
      return;
    }

    let cancelled = false;

    async function loadCloudPlanner() {
      setPlannerLoading(true);
      setError("");

      try {
        let cloudPlans =
          await apiFetch(
            "/api/planner"
          ) as ApiPlannerItem[];

        const contextPlans =
          cloudPlans.filter((plan) =>
            planMatchesContext(
              plan,
              connectedRoomId
            )
          );

        const legacyItems =
          loadJSON<PlannerItem[]>(
            storageKey,
            []
          );

        const migrationMarker =
          `${CLOUD_IMPORT_KEY}:${storageKey}`;

        const shouldImport =
          contextPlans.length === 0 &&
          legacyItems.length > 0 &&
          !window.localStorage.getItem(
            migrationMarker
          );

        if (shouldImport) {
          const importedPlans:
            ApiPlannerItem[] = [];

          for (const legacyItem of legacyItems) {
            let imported =
              await apiFetch(
                "/api/planner",
                {
                  method: "POST",
                  body: JSON.stringify({
                    title: legacyItem.title,
                    subject:
                      legacyItem.subject ||
                      "Study",
                    description: null,
                    scheduled_for:
                      buildScheduledFor(
                        legacyItem.date,
                        legacyItem.time
                      ),
                    duration_minutes:
                      legacyItem.duration ||
                      25,
                    priority:
                      legacyItem.priority ||
                      "Medium",
                    study_room_id:
                      connectedRoomId,
                  }),
                }
              ) as ApiPlannerItem;

            if (
              legacyItem.status === "Done"
            ) {
              imported =
                await apiFetch(
                  `/api/planner/${imported.id}`,
                  {
                    method: "PATCH",
                    body: JSON.stringify({
                      status: "Done",
                    }),
                  }
                ) as ApiPlannerItem;
            }

            importedPlans.push(imported);
          }

          window.localStorage.setItem(
            migrationMarker,
            "complete"
          );

          cloudPlans = [
            ...cloudPlans,
            ...importedPlans,
          ];
        }

        if (cancelled) return;

        setItems(
          cloudPlans
            .filter((plan) =>
              planMatchesContext(
                plan,
                connectedRoomId
              )
            )
            .map(mapApiPlannerItem)
        );
      } catch (loadError) {
        if (cancelled) return;

        setItems([]);

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Your cloud planner could not be loaded."
        );
      } finally {
        if (!cancelled) {
          setPlannerLoading(false);
        }
      }
    }

    void loadCloudPlanner();

    return () => {
      cancelled = true;
    };
  }, [
    ready,
    plannerContextReady,
    connectedRoomId,
    storageKey,
  ]);

  useEffect(() => {
    if (!timerRunning) return;

    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [timerRunning]);

  useEffect(() => {
    if (secondsLeft === 0 && !notifiedRef.current) {
      notifiedRef.current = true;
      setTimerRunning(false);

      const audio = new Audio(
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
      );
      audio.play().catch(() => {});

      const current = loadJSON<Array<Record<string, unknown>>>(NOTICE_KEY, []);
      const next = [
        {
          id: Date.now(),
          text: "🔔 Focus session complete. Time for a short break.",
          createdAt: new Date().toLocaleString(),
        },
        ...current,
      ];

      saveJSON(NOTICE_KEY, next);
    }
  }, [secondsLeft]);

  const stats = useMemo(() => {
    const done = items.filter((item) => item.status === "Done").length;
    const planned = items.length - done;
    const today = items.filter((item) => item.date === getTodayDateInput()).length;
    const highPriority = items.filter((item) => item.priority === "High").length;

    return {
      done,
      planned,
      today,
      highPriority,
    };
  }, [items]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.status === "Done" && b.status !== "Done") return 1;
      if (a.status !== "Done" && b.status === "Done") return -1;
      return a.date.localeCompare(b.date);
    });
  }, [items]);

  function addNotification(text: string) {
    const current = loadJSON<Array<Record<string, unknown>>>(NOTICE_KEY, []);
    const now = new Date();

    saveJSON(NOTICE_KEY, [
      {
        id: now.getTime(),
        text,
        createdAt: now.toLocaleString(),
        createdAtIso: now.toISOString(),
        href: "/planner",
        actionLabel: "Open planner",
        kind: "planner",
        read: false,
      },
      ...current,
    ]);
  }

  async function addItem() {
    if (plannerBusy) return;

    if (!title.trim()) {
      setError("Enter a study task.");
      return;
    }

    if (!subject.trim()) {
      setError("Enter a subject.");
      return;
    }

    if (!date) {
      setError("Choose a date.");
      return;
    }

    setError("");
    setPlannerBusy(true);

    try {
      const created =
        await apiFetch(
          "/api/planner",
          {
            method: "POST",
            body: JSON.stringify({
              title: title.trim(),
              subject: subject.trim(),
              description: null,
              scheduled_for:
                buildScheduledFor(
                  date,
                  time
                ),
              duration_minutes:
                Number(duration) || 25,
              priority,
              study_room_id:
                connectedRoomId,
            }),
          }
        ) as ApiPlannerItem;

      setItems((currentItems) => [
        mapApiPlannerItem(created),
        ...currentItems,
      ]);

      addNotification(
        `📘 Study session added: ` +
        `${title.trim()} ` +
        `(${subject.trim()})`
      );

      setTitle("");
      setDate(getTodayDateInput());
      setTime("");
      setDuration("25");
      setPriority("Medium");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The study session could not be saved."
      );
    } finally {
      setPlannerBusy(false);
    }
  }

  async function addDailyGoalPlan() {
    if (plannerBusy) return;

    const goalTitle =
      settings.dailyGoal ||
      "Study for 25 minutes";

    const goalSubject =
      settings.favoriteSubject ||
      settings.selectedSubjects[0] ||
      subject ||
      "Study";

    setError("");
    setPlannerBusy(true);

    try {
      const created =
        await apiFetch(
          "/api/planner",
          {
            method: "POST",
            body: JSON.stringify({
              title: goalTitle,
              subject: goalSubject,
              description:
                "Daily smart action",
              scheduled_for:
                buildScheduledFor(
                  getTodayDateInput()
                ),
              duration_minutes: 25,
              priority: "High",
              study_room_id:
                connectedRoomId,
            }),
          }
        ) as ApiPlannerItem;

      setItems((currentItems) => [
        mapApiPlannerItem(created),
        ...currentItems,
      ]);

      addNotification(
        `⭐ Daily smart action planned: ` +
        goalTitle
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The daily action could not be saved."
      );
    } finally {
      setPlannerBusy(false);
    }
  }

  async function removeItem(id: number) {
    if (plannerBusy) return;

    setError("");
    setPlannerBusy(true);

    try {
      await apiFetch(
        `/api/planner/${id}`,
        {
          method: "DELETE",
        }
      );

      setItems((currentItems) =>
        currentItems.filter(
          (item) => item.id !== id
        )
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The study session could not be deleted."
      );
    } finally {
      setPlannerBusy(false);
    }
  }

  async function toggleDone(id: number) {
    if (plannerBusy) return;

    const currentItem =
      items.find(
        (item) => item.id === id
      );

    if (!currentItem) return;

    const nextStatus:
      PlannerItem["status"] =
        currentItem.status === "Done"
          ? "Planned"
          : "Done";

    setError("");
    setPlannerBusy(true);

    try {
      const updated =
        await apiFetch(
          `/api/planner/${id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              status: nextStatus,
            }),
          }
        ) as ApiPlannerItem;

      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === id
            ? mapApiPlannerItem(updated)
            : item
        )
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "The study session could not be updated."
      );
    } finally {
      setPlannerBusy(false);
    }
  }

  function resetTimer() {
    setTimerRunning(false);
    setSecondsLeft(25 * 60);
    notifiedRef.current = false;
  }

  function setTimerMinutes(minutes: number) {
    setTimerRunning(false);
    setSecondsLeft(minutes * 60);
    notifiedRef.current = false;
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-black p-6 text-white">
        Checking authentication...
      </div>
    );
  }

  return (
    <AppShell
      title="Planner"
      subtitle="Plan your daily smart actions, study sessions, focus blocks, and deadlines."
    >
      <div className="content-grid">
        <ConnectedProjectBanner
          toolName="Planner"
          toolIcon="📅"
          description="Your planner is connected to this project so study sessions, deadlines, and focus time feel part of the same learning workspace."
        />

        <section className="hero-grid">
          <div className="gold-card rounded-[2rem] p-6 sm:p-8">
            <div className="gold-chip mb-4">Smart planning</div>

            <h3 className="panel-title text-white text-balance">
              Turn your learning profile into a real study plan.
            </h3>

            <p className="panel-muted mt-4 max-w-2xl">
              Planner now connects with Settings and Progress. Your daily goal,
              subjects, learning style, and study sessions work together instead
              of feeling separate.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-4">
              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Today</p>
                <p className="mt-3 text-2xl font-black text-cyan-300">
                  {stats.today}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Planned</p>
                <p className="mt-3 text-2xl font-black text-amber-300">
                  {stats.planned}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Done</p>
                <p className="mt-3 text-2xl font-black text-emerald-300">
                  {stats.done}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">High Priority</p>
                <p className="mt-3 text-2xl font-black text-red-200">
                  {stats.highPriority}
                </p>
              </div>
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Daily smart action</div>
            <h3 className="panel-title text-white">{settings.dailyGoal}</h3>

            <p className="mt-4 text-sm leading-7 text-slate-300">
              Recommended subject:{" "}
              <span className="font-black text-amber-200">
                {settings.favoriteSubject ||
                  settings.selectedSubjects[0] ||
                  "Your main subject"}
              </span>
            </p>

            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={addDailyGoalPlan}
                className="premium-button rounded-[1.2rem] px-4 py-3.5 text-sm font-black"
              >
                Add today’s smart action
              </button>

              <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                <p className="kpi-label">Learning mode</p>
                <p className="mt-2 text-sm font-black text-white">
                  {settings.learningMode} · {settings.knowledgeLevel}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Add session</div>
            <h3 className="panel-title text-white">Plan study time</h3>
            <p className="panel-muted mt-3">
              Create a task, deadline, review block, or focused study session.
            </p>

            <div className="mt-5 grid gap-4">
              <input
                className="rounded-[1.2rem] px-4 py-3.5"
                placeholder="Task title, example: Review flashcards"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <input
                className="rounded-[1.2rem] px-4 py-3.5"
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="date"
                  className="rounded-[1.2rem] px-4 py-3.5"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />

                <input
                  type="time"
                  className="rounded-[1.2rem] px-4 py-3.5"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className="w-full rounded-[1.2rem] border border-white/10 bg-slate-950/70 px-4 py-3.5 text-white outline-none"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                >
                  <option value="15">15 minutes</option>
                  <option value="25">25 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                </select>

                <select
                  className="w-full rounded-[1.2rem] border border-white/10 bg-slate-950/70 px-4 py-3.5 text-white outline-none"
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as PlannerItem["priority"])
                  }
                >
                  <option value="Low">Low priority</option>
                  <option value="Medium">Medium priority</option>
                  <option value="High">High priority</option>
                </select>
              </div>

              <button
                type="button"
                onClick={addItem}
                disabled={plannerBusy}
                className="premium-button rounded-[1.2rem] px-4 py-3.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {plannerBusy
                  ? "Saving..."
                  : "Save session"}
              </button>

              {error ? (
                <div className="rounded-[1.2rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
                  {error}
                </div>
              ) : null}
            </div>
          </div>

          <div className="gold-card rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Focus mode</div>
            <h3 className="panel-title text-white">Pomodoro timer</h3>
            <p className="panel-muted mt-3">
              Use focused sessions to complete your planned tasks.
            </p>

            <div className="mt-6 rounded-[2rem] border border-white/10 bg-black/20 p-7 text-center">
              <p className="text-7xl font-black tracking-tight text-white">
                {formatTime(secondsLeft)}
              </p>
              <p className="mt-3 text-sm font-bold text-slate-300">
                {timerRunning ? "Focus session running" : "Ready to focus"}
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setTimerRunning(true)}
                  className="premium-button rounded-xl px-5 py-3 text-sm font-black"
                >
                  Start
                </button>

                <button
                  type="button"
                  onClick={() => setTimerRunning(false)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white transition hover:bg-white/[0.08]"
                >
                  Pause
                </button>

                <button
                  type="button"
                  onClick={resetTimer}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white transition hover:bg-white/[0.08]"
                >
                  Reset
                </button>
              </div>

              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {[15, 25, 45, 60].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => setTimerMinutes(minutes)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black text-slate-200 transition hover:bg-white/[0.08]"
                  >
                    {minutes}m
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="gold-chip mb-4">Schedule</div>
                <h3 className="panel-title text-white">
                  Upcoming study sessions
                </h3>
                <p className="panel-muted mt-3">
                  Your saved sessions for this workspace.
                </p>
              </div>
            </div>

            {plannerLoading ? (
              <div className="empty-state mt-6">
                Loading your cloud planner...
              </div>
            ) : sortedItems.length === 0 ? (
              <div className="empty-state mt-6">
                No sessions yet. Add your first study plan.
              </div>
            ) : (
              <div className="mt-6 grid gap-4">
                {sortedItems.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-[1.5rem] border p-5 ${
                      item.status === "Done"
                        ? "border-emerald-300/20 bg-emerald-400/10"
                        : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black ${getPriorityStyle(
                              item.priority
                            )}`}
                          >
                            {item.priority || "Medium"}
                          </span>

                          <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-100">
                            {getDateStatus(item.date)}
                          </span>
                        </div>

                        <h4 className="mt-3 text-lg font-black text-white">
                          {item.title}
                        </h4>

                        <p className="mt-2 text-sm font-bold text-amber-200">
                          {item.subject}
                        </p>

                        <p className="mt-2 text-sm text-slate-400">
                          {formatDisplayDate(item.date)}
                          {item.time ? ` · ${item.time}` : ""}
                          {item.duration ? ` · ${item.duration} min` : ""}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => toggleDone(item.id)}
                          className="rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-100"
                        >
                          {item.status === "Done" ? "Undo" : "Done"}
                        </button>

                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-2 text-sm font-black text-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="content-grid">
            <div className="premium-card gold-border rounded-[2rem] p-6">
              <div className="gold-chip mb-4">Subject focus</div>
              <h3 className="panel-title text-white">Your study areas</h3>

              <div className="mt-5 flex flex-wrap gap-2">
                {settings.selectedSubjects.map((item) => (
                  <span key={item} className="tag-chip">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="gold-card rounded-[2rem] p-6">
              <div className="gold-chip mb-4">Planner insight</div>
              <h3 className="panel-title text-white">What to do next</h3>
              <p className="panel-muted mt-4">
                Add today’s smart action, complete one planned session, then
                check Progress to see your learning profile update.
              </p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
