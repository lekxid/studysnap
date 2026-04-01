"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import { loadJSON, saveJSON } from "@/lib/storage";

type PlannerItem = {
  id: number;
  title: string;
  subject: string;
  date: string;
};

const STORAGE_KEY = "studysnap_planner_items";
const NOTICE_KEY = "studysnap_notifications";

export default function PlannerPage() {
  const ready = useRequireAuth();

  const [items, setItems] = useState<PlannerItem[]>([]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");

  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    setItems(loadJSON<PlannerItem[]>(STORAGE_KEY, []));
  }, [ready]);

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

      const current = loadJSON<any[]>(NOTICE_KEY, []);
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

  function persist(next: PlannerItem[]) {
    setItems(next);
    saveJSON(STORAGE_KEY, next);
  }

  function addItem() {
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

    const next: PlannerItem[] = [
      {
        id: Date.now(),
        title: title.trim(),
        subject: subject.trim(),
        date,
      },
      ...items,
    ];

    persist(next);

    const current = loadJSON<any[]>(NOTICE_KEY, []);
    saveJSON(NOTICE_KEY, [
      {
        id: Date.now() + 1,
        text: `📘 Study session added: ${title.trim()} (${subject.trim()})`,
        createdAt: new Date().toLocaleString(),
      },
      ...current,
    ]);

    setTitle("");
    setSubject("");
    setDate("");
  }

  function removeItem(id: number) {
    persist(items.filter((item) => item.id !== id));
  }

  function formatTime(totalSeconds: number) {
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const secs = (totalSeconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function resetTimer() {
    setTimerRunning(false);
    setSecondsLeft(25 * 60);
    notifiedRef.current = false;
  }

  if (!ready) {
    return <div className="min-h-screen bg-black text-white p-6">Checking authentication...</div>;
  }

  return (
    <AppShell title="Planner" subtitle="Timetable, deadlines, reminders, and exam countdowns">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-xl font-semibold text-cyan-300">Add Study Session</h3>

          <div className="mt-4 space-y-4">
            <input
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <input
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />

            <input
              type="date"
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />

            <button
              onClick={addItem}
              className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-black"
            >
              Save Session
            </button>

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
            <h3 className="text-xl font-semibold text-cyan-300">Focus Mode</h3>
            <p className="mt-4 text-6xl font-bold">{formatTime(secondsLeft)}</p>
            <p className="mt-2 text-sm text-white/60">Pomodoro: 25 minutes study, 5 minutes break</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => setTimerRunning(true)}
                className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-black"
              >
                Start
              </button>
              <button
                onClick={() => setTimerRunning(false)}
                className="rounded-xl border border-white/20 px-4 py-2 font-semibold text-white"
              >
                Pause
              </button>
              <button
                onClick={resetTimer}
                className="rounded-xl border border-white/20 px-4 py-2 font-semibold text-white"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
            <h3 className="text-xl font-semibold text-cyan-300">Upcoming Study Sessions</h3>

            {items.length === 0 ? (
              <div className="mt-6 rounded-xl bg-white/5 p-6 text-white/70">
                No sessions yet. Add your first study plan.
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {items.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-black p-5">
                    <h4 className="text-lg font-semibold text-cyan-300">{item.title}</h4>
                    <p className="mt-2 text-sm text-yellow-300">{item.subject}</p>
                    <p className="mt-2 text-sm text-white/70">{item.date}</p>
                    <div className="mt-5">
                      <button
                        onClick={() => removeItem(item.id)}
                        className="rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-white/5 p-4 text-white/80">Networking exam in 7 days</div>
              <div className="rounded-xl bg-white/5 p-4 text-white/80">Daily mission: Study 20 minutes</div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
