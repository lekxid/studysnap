"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import { loadJSON } from "@/lib/storage";

type PlannerItem = {
  id: number;
  title: string;
  subject: string;
  date: string;
};

type Flashcard = {
  id: number;
  question: string;
  answer: string;
};

type QuizQuestion = {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
};

type NoteItem = {
  id: number;
  title: string;
  content: string;
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

const defaultSettings: SettingsState = {
  learningMode: "Clear Explain",
  knowledgeLevel: "Medium",
  progressSharing: "Private",
  favoriteSubject: "",
  selectedSubjects: ["Networking / IT", "Linux"],
  dailyGoal: "Review 10 flashcards",
  notifications: "Important only",
};

const weekActivity = [
  { day: "Mon", value: 72 },
  { day: "Tue", value: 42 },
  { day: "Wed", value: 88 },
  { day: "Thu", value: 54 },
  { day: "Fri", value: 96 },
  { day: "Sat", value: 64 },
  { day: "Sun", value: 78 },
];

function safeReadArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function readRoomCollections<T>(prefix: string): T[] {
  if (typeof window === "undefined") return [];

  const combined: T[] = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(prefix)) continue;

    combined.push(...safeReadArray<T>(key));
  }

  return combined;
}

function getAchievementState(value: boolean) {
  return value
    ? "border-amber-300/30 bg-amber-400/12 text-amber-100"
    : "border-white/8 bg-white/[0.03] text-slate-400";
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="premium-card gold-border rounded-[2rem] p-6">
      <p className="kpi-label">{label}</p>
      <p className={`mt-4 text-4xl font-black ${tone}`}>{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-400">{detail}</p>
    </div>
  );
}

function ActionLink({
  href,
  title,
  subtitle,
}: {
  href: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
    >
      <p className="text-sm font-black text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p>
    </Link>
  );
}

export default function ProgressPage() {
  const ready = useRequireAuth();

  const [plannerItems, setPlannerItems] = useState<PlannerItem[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);

  useEffect(() => {
    if (!ready) return;

    const savedSettings = loadJSON<SettingsState>(
      "studysnap_settings",
      defaultSettings
    );

    const globalFlashcards = safeReadArray<Flashcard>("studysnap_flashcards");
    const roomFlashcards = readRoomCollections<Flashcard>(
      "studysnap_flashcards_room_"
    );

    const globalQuizQuestions = safeReadArray<QuizQuestion>(
      "studysnap_quiz_questions"
    );
    const roomQuizQuestions = readRoomCollections<QuizQuestion>(
      "studysnap_quiz_questions_room_"
    );

    setSettings({
      ...defaultSettings,
      ...savedSettings,
      selectedSubjects:
        Array.isArray(savedSettings.selectedSubjects) &&
        savedSettings.selectedSubjects.length > 0
          ? savedSettings.selectedSubjects
          : defaultSettings.selectedSubjects,
    });

    setPlannerItems(safeReadArray<PlannerItem>("studysnap_planner_items"));
    setFlashcards([...globalFlashcards, ...roomFlashcards]);
    setQuizQuestions([...globalQuizQuestions, ...roomQuizQuestions]);
    setNotes(safeReadArray<NoteItem>("studysnap_notes"));
  }, [ready]);

  const totals = useMemo(() => {
    const xp =
      plannerItems.length * 12 +
      flashcards.length * 5 +
      quizQuestions.length * 8 +
      notes.length * 6;

    const studyItems =
      plannerItems.length + flashcards.length + quizQuestions.length + notes.length;

    const streak = Math.max(1, Math.min(14, plannerItems.length + Math.ceil(flashcards.length / 4)));

    const learningIndex = Math.min(
      100,
      Math.max(18, Math.round(xp / 8 + studyItems * 3))
    );

    return {
      xp,
      streak,
      studyItems,
      learningIndex,
    };
  }, [plannerItems, flashcards, quizQuestions, notes]);

  const weakConcepts = useMemo(() => {
    const subjectSeeds =
      settings.selectedSubjects.length > 0
        ? settings.selectedSubjects
        : ["Study Basics", "Review Skills"];

    const generated = subjectSeeds.slice(0, 4).map((subject, index) => {
      const labels = [
        "needs quick review",
        "practice with examples",
        "build confidence",
        "connect to notes",
      ];

      return {
        title: subject,
        detail: labels[index] || "review again",
        score: Math.max(35, 76 - index * 9),
      };
    });

    return generated;
  }, [settings.selectedSubjects]);

  const aiRecommendation = useMemo(() => {
    if (flashcards.length === 0 && notes.length === 0) {
      return "Create a note or flashcard deck first so StudySnap can start tracking your learning pattern.";
    }

    if (quizQuestions.length === 0) {
      return `Your next best action is: ${settings.dailyGoal}. After that, create a mini quiz to test understanding.`;
    }

    return `Focus on ${settings.favoriteSubject || settings.selectedSubjects[0] || "your weakest subject"} today using ${settings.learningMode}.`;
  }, [flashcards.length, notes.length, quizQuestions.length, settings]);

  const achievements = [
    {
      title: "First Study System",
      detail: "Created study material inside StudySnap.",
      unlocked: totals.studyItems > 0,
    },
    {
      title: "Flashcard Builder",
      detail: "Built at least 10 flashcards.",
      unlocked: flashcards.length >= 10,
    },
    {
      title: "Quiz Starter",
      detail: "Created practice quiz questions.",
      unlocked: quizQuestions.length > 0,
    },
    {
      title: "Planner Ready",
      detail: "Added study sessions to your planner.",
      unlocked: plannerItems.length > 0,
    },
  ];

  if (!ready) {
    return (
      <div className="min-h-screen bg-black p-6 text-white">
        Checking authentication...
      </div>
    );
  }

  return (
    <AppShell
      title="Progress"
      subtitle="Track your learning growth, weak concepts, daily focus, and StudySnap profile."
    >
      <div className="content-grid">
        <section className="hero-grid">
          <div className="gold-card rounded-[2rem] p-6 sm:p-8">
            <div className="gold-chip mb-4">Learning analytics</div>

            <h3 className="panel-title text-white text-balance">
              Your progress is now connected to your learning profile.
            </h3>

            <p className="panel-muted mt-4 max-w-2xl">
              StudySnap uses your saved settings, subjects, notes, flashcards,
              quizzes, and planner items to show a clearer view of your study
              growth.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-4">
              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Learning Index</p>
                <p className="mt-3 text-2xl font-black text-cyan-300">
                  {totals.learningIndex}%
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">XP</p>
                <p className="mt-3 text-2xl font-black text-amber-300">
                  {totals.xp}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Streak</p>
                <p className="mt-3 text-2xl font-black text-emerald-300">
                  🔥 {totals.streak}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Mode</p>
                <p className="mt-3 text-lg font-black text-violet-300">
                  {settings.learningMode}
                </p>
              </div>
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">AI recommendation</div>
            <h3 className="panel-title text-white">Today’s smart action</h3>

            <p className="mt-4 text-sm leading-7 text-slate-300">
              {aiRecommendation}
            </p>

            <div className="mt-5 grid gap-3">
              <ActionLink
                href="/flashcards"
                title="Review flashcards"
                subtitle={`${flashcards.length} cards available`}
              />
              <ActionLink
                href="/quizzes"
                title="Practice quiz"
                subtitle={`${quizQuestions.length} questions available`}
              />
              <ActionLink
                href="/settings"
                title="Edit learning profile"
                subtitle="Update style, level, subjects, and daily goal"
              />
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Saved Notes"
            value={String(notes.length)}
            detail="Notes available for study review."
            tone="text-cyan-300"
          />
          <MetricCard
            label="Flashcards"
            value={String(flashcards.length)}
            detail="Cards ready for active recall."
            tone="text-amber-300"
          />
          <MetricCard
            label="Quiz Questions"
            value={String(quizQuestions.length)}
            detail="Practice questions generated."
            tone="text-violet-300"
          />
          <MetricCard
            label="Planner Items"
            value={String(plannerItems.length)}
            detail="Scheduled study sessions."
            tone="text-emerald-300"
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Weekly activity</div>
            <h3 className="panel-title text-white">Study rhythm</h3>
            <p className="panel-muted mt-3">
              A simple snapshot of your study consistency this week.
            </p>

            <div className="mt-6 grid grid-cols-7 items-end gap-3">
              {weekActivity.map((item) => (
                <div key={item.day} className="grid gap-2 text-center">
                  <div className="flex h-36 items-end rounded-2xl border border-white/8 bg-white/[0.03] p-2">
                    <div
                      className="w-full rounded-xl bg-gradient-to-t from-amber-300/80 to-cyan-300/80"
                      style={{ height: `${item.value}%` }}
                    />
                  </div>
                  <p className="text-xs font-black text-slate-400">
                    {item.day}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Weak concepts</div>
            <h3 className="panel-title text-white">Quick review targets</h3>
            <p className="panel-muted mt-3">
              Based on your selected subjects and current study setup.
            </p>

            <div className="mt-5 grid gap-3">
              {weakConcepts.map((concept) => (
                <div
                  key={concept.title}
                  className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-white">
                        {concept.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        {concept.detail}
                      </p>
                    </div>

                    <p className="text-sm font-black text-amber-200">
                      {concept.score}%
                    </p>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-amber-300/80"
                      style={{ width: `${concept.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="gold-card rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Profile connection</div>
            <h3 className="panel-title text-white">Learning setup</h3>

            <div className="mt-5 grid gap-3">
              <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Knowledge level</p>
                <p className="mt-2 text-base font-black text-white">
                  {settings.knowledgeLevel}
                </p>
              </div>

              <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Daily goal</p>
                <p className="mt-2 text-base font-black text-white">
                  {settings.dailyGoal}
                </p>
              </div>

              <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Progress sharing</p>
                <p className="mt-2 text-base font-black text-white">
                  {settings.progressSharing}
                </p>
              </div>
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Achievements</div>
            <h3 className="panel-title text-white">Milestones</h3>
            <p className="panel-muted mt-3">
              Unlock more achievements as you create and review study material.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {achievements.map((achievement) => (
                <div
                  key={achievement.title}
                  className={`rounded-[1.25rem] border p-4 ${getAchievementState(
                    achievement.unlocked
                  )}`}
                >
                  <p className="text-sm font-black">
                    {achievement.unlocked ? "🏆 " : "🔒 "}
                    {achievement.title}
                  </p>
                  <p className="mt-2 text-xs leading-5 opacity-80">
                    {achievement.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
