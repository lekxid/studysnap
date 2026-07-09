"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import { loadJSON, saveJSON } from "@/lib/storage";

type SettingsState = {
  learningMode: string;
  knowledgeLevel: string;
  progressSharing: string;
  favoriteSubject: string;
  selectedSubjects: string[];
  dailyGoal: string;
  notifications: string;
};

type OnboardingProfile = {
  explanationStyle: string;
  knowledgeLevel: string;
  subjects: string[];
  savedAt: string;
};

const SETTINGS_STORAGE_KEY = "studysnap_settings";
const ONBOARDING_STORAGE_KEY = "studysnap:onboarding";
const ONBOARDING_COMPLETE_KEY = "studysnap:onboarding-complete";

const defaultSettings: SettingsState = {
  learningMode: "Clear Explain",
  knowledgeLevel: "Medium",
  progressSharing: "Private",
  favoriteSubject: "",
  selectedSubjects: ["Networking / IT", "Linux"],
  dailyGoal: "Review 10 flashcards",
  notifications: "Important only",
};

const learningModes = [
  {
    name: "Easy Explain",
    desc: "Simple words, slower steps, and beginner-friendly examples.",
  },
  {
    name: "Clear Explain",
    desc: "Balanced answers that are easy to understand and still useful.",
  },
  {
    name: "Deep Explain",
    desc: "More detail, stronger reasoning, and deeper study explanations.",
  },
];

const knowledgeLevels = [
  {
    name: "Beginner",
    desc: "Best when the topic is new or confusing.",
  },
  {
    name: "Medium",
    desc: "Good for most studying and daily learning.",
  },
  {
    name: "Advanced",
    desc: "Best when you already know the basics.",
  },
];

const sharingOptions = [
  {
    name: "Private",
    desc: "Only you can see your progress.",
  },
  {
    name: "Friends Only",
    desc: "Future study partners can see selected progress.",
  },
  {
    name: "Public",
    desc: "Useful later for public achievements or shared learning.",
  },
];

const dailyGoals = [
  "Review 10 flashcards",
  "Take 1 mini quiz",
  "Summarize 1 note",
  "Study for 25 minutes",
  "Ask AI Tutor 1 question",
];

const notificationOptions = [
  "Important only",
  "Study reminders",
  "Daily summary",
  "Off",
];

function getOnboardingProfile(): Partial<OnboardingProfile> {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    return {};
  }
}

function saveOnboardingFromSettings(settings: SettingsState) {
  const profile: OnboardingProfile = {
    explanationStyle: settings.learningMode,
    knowledgeLevel: settings.knowledgeLevel,
    subjects: settings.selectedSubjects,
    savedAt: new Date().toISOString(),
  };

  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(profile));
  localStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
}

export default function SettingsPage() {
  const ready = useRequireAuth();

  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [newSubject, setNewSubject] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    if (!ready) return;

    const savedSettings = loadJSON<SettingsState>(
      SETTINGS_STORAGE_KEY,
      defaultSettings
    );

    const onboarding = getOnboardingProfile();

    const mergedSettings: SettingsState = {
      ...defaultSettings,
      ...savedSettings,
      learningMode:
        onboarding.explanationStyle ||
        savedSettings.learningMode ||
        defaultSettings.learningMode,
      knowledgeLevel:
        onboarding.knowledgeLevel ||
        savedSettings.knowledgeLevel ||
        defaultSettings.knowledgeLevel,
      selectedSubjects:
        Array.isArray(onboarding.subjects) && onboarding.subjects.length > 0
          ? onboarding.subjects
          : savedSettings.selectedSubjects || defaultSettings.selectedSubjects,
    };

    setSettings(mergedSettings);
    saveJSON(SETTINGS_STORAGE_KEY, mergedSettings);
  }, [ready]);

  const profileSummary = useMemo(() => {
    return {
      style: settings.learningMode,
      level: settings.knowledgeLevel,
      subjects: settings.selectedSubjects.length,
      favorite: settings.favoriteSubject || "Not set",
    };
  }, [settings]);

  function saveSettings(next: SettingsState, message = "Settings saved.") {
    setSettings(next);
    saveJSON(SETTINGS_STORAGE_KEY, next);
    saveOnboardingFromSettings(next);
    setSavedMessage(message);

    window.setTimeout(() => {
      setSavedMessage("");
    }, 1800);
  }

  function update<K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K]
  ) {
    saveSettings({ ...settings, [key]: value });
  }

  function addSubject() {
    const subject = newSubject.trim();
    if (!subject) return;

    const exists = settings.selectedSubjects.some(
      (item) => item.toLowerCase() === subject.toLowerCase()
    );

    if (exists) {
      setNewSubject("");
      return;
    }

    saveSettings(
      {
        ...settings,
        selectedSubjects: [...settings.selectedSubjects, subject],
        favoriteSubject: settings.favoriteSubject || subject,
      },
      "Subject added."
    );
    setNewSubject("");
  }

  function removeSubject(subject: string) {
    const nextSubjects = settings.selectedSubjects.filter(
      (item) => item !== subject
    );

    saveSettings(
      {
        ...settings,
        selectedSubjects: nextSubjects,
        favoriteSubject:
          settings.favoriteSubject === subject ? "" : settings.favoriteSubject,
      },
      "Subject removed."
    );
  }

  function resetLearningSetup() {
    saveSettings(defaultSettings, "Learning setup reset.");
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
      title="Settings"
      subtitle="Manage your learning profile, privacy, reminders, and connected StudySnap setup."
    >
      <div className="content-grid">
        <section className="hero-grid">
          <div className="gold-card rounded-[2rem] p-6 sm:p-8">
            <div className="gold-chip mb-4">Workspace profile</div>

            <h3 className="panel-title text-white text-balance">
              Your StudySnap settings are now connected to onboarding.
            </h3>

            <p className="panel-muted mt-4 max-w-2xl">
              Changes here update your saved learning setup, so your AI style,
              knowledge level, and subject profile stay consistent across the
              app.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-4">
              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Style</p>
                <p className="mt-3 text-lg font-black text-cyan-300">
                  {profileSummary.style}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Level</p>
                <p className="mt-3 text-lg font-black text-amber-300">
                  {profileSummary.level}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Subjects</p>
                <p className="mt-3 text-lg font-black text-violet-300">
                  {profileSummary.subjects}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Favorite</p>
                <p className="mt-3 text-lg font-black text-emerald-300">
                  {profileSummary.favorite}
                </p>
              </div>
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Quick actions</div>
            <h3 className="panel-title text-white">Setup controls</h3>

            <div className="mt-5 grid gap-3">
              <Link
                href="/onboarding"
                className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm font-black text-white transition hover:bg-white/[0.07]"
              >
                Open onboarding →
              </Link>

              <button
                type="button"
                onClick={resetLearningSetup}
                className="rounded-[1.2rem] border border-red-300/20 bg-red-500/10 px-4 py-3.5 text-left text-sm font-black text-red-100 transition hover:bg-red-500/15"
              >
                Reset learning setup
              </button>

              {savedMessage ? (
                <div className="rounded-[1.2rem] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
                  {savedMessage}
                </div>
              ) : (
                <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-400">
                  Settings auto-save when you change them.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">AI Tutor</div>
            <h3 className="panel-title text-white">Understanding mode</h3>
            <p className="panel-muted mt-3">
              Choose how StudySnap should explain answers.
            </p>

            <div className="mt-5 grid gap-3">
              {learningModes.map((item) => {
                const active = settings.learningMode === item.name;

                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => update("learningMode", item.name)}
                    className={`rounded-[1.35rem] border px-5 py-4 text-left transition ${
                      active
                        ? "border-transparent bg-gradient-to-r from-violet-500/95 via-indigo-500/92 to-sky-500/85 text-white shadow-[0_14px_30px_rgba(109,94,252,0.25)]"
                        : "border-white/8 bg-white/[0.03] text-slate-200 hover:bg-white/[0.05]"
                    }`}
                  >
                    <p className="text-sm font-black">{item.name}</p>
                    <p
                      className={`mt-2 text-sm leading-6 ${
                        active ? "text-white/85" : "text-slate-400"
                      }`}
                    >
                      {item.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Difficulty</div>
            <h3 className="panel-title text-white">Knowledge level</h3>
            <p className="panel-muted mt-3">
              Set the starting level for explanations and study suggestions.
            </p>

            <div className="mt-5 grid gap-3">
              {knowledgeLevels.map((item) => {
                const active = settings.knowledgeLevel === item.name;

                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => update("knowledgeLevel", item.name)}
                    className={`rounded-[1.35rem] border px-5 py-4 text-left transition ${
                      active
                        ? "border-amber-300/30 bg-amber-400/12 text-amber-100"
                        : "border-white/8 bg-white/[0.03] text-slate-200 hover:bg-white/[0.05]"
                    }`}
                  >
                    <p className="text-sm font-black">{item.name}</p>
                    <p
                      className={`mt-2 text-sm leading-6 ${
                        active ? "text-amber-50/85" : "text-slate-400"
                      }`}
                    >
                      {item.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Subjects</div>
            <h3 className="panel-title text-white">Learning subjects</h3>
            <p className="panel-muted mt-3">
              These subjects sync with onboarding and help personalize your
              StudySnap workspace.
            </p>

            <div className="mt-5 flex gap-3">
              <input
                className="rounded-[1.2rem] px-4 py-3.5"
                placeholder="Add subject, example: Anatomy"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSubject();
                  }
                }}
              />

              <button
                type="button"
                onClick={addSubject}
                className="premium-button shrink-0 rounded-[1.2rem] px-5 py-3.5 text-sm font-black"
              >
                Add
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {settings.selectedSubjects.length === 0 ? (
                <div className="empty-state w-full">
                  No subjects selected yet.
                </div>
              ) : (
                settings.selectedSubjects.map((subject) => (
                  <button
                    key={subject}
                    type="button"
                    onClick={() => removeSubject(subject)}
                    className="tag-chip"
                  >
                    {subject} ×
                  </button>
                ))
              )}
            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-black text-slate-200">
                Favorite subject
              </label>
              <input
                className="rounded-[1.2rem] px-4 py-3.5"
                placeholder="Favorite subject"
                value={settings.favoriteSubject}
                onChange={(e) => update("favoriteSubject", e.target.value)}
              />
            </div>
          </div>

          <div className="content-grid">
            <div className="premium-card gold-border rounded-[2rem] p-6">
              <div className="gold-chip mb-4">Privacy</div>
              <h3 className="panel-title text-white">Progress sharing</h3>

              <div className="mt-5 grid gap-3">
                {sharingOptions.map((item) => {
                  const active = settings.progressSharing === item.name;

                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => update("progressSharing", item.name)}
                      className={`rounded-[1.25rem] border px-4 py-3 text-left transition ${
                        active
                          ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-100"
                          : "border-white/8 bg-white/[0.03] text-slate-200 hover:bg-white/[0.05]"
                      }`}
                    >
                      <p className="text-sm font-black">{item.name}</p>
                      <p
                        className={`mt-1 text-xs leading-5 ${
                          active ? "text-cyan-50/80" : "text-slate-400"
                        }`}
                      >
                        {item.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="gold-card rounded-[2rem] p-6">
              <div className="gold-chip mb-4">Daily focus</div>
              <h3 className="panel-title text-white">Study preferences</h3>

              <div className="mt-5 grid gap-4">
                <div>
                  <label className="mb-2 block text-sm font-black text-slate-200">
                    Daily smart action
                  </label>
                  <select
                    className="w-full rounded-[1.2rem] border border-white/10 bg-slate-950/70 px-4 py-3.5 text-white outline-none"
                    value={settings.dailyGoal}
                    onChange={(e) => update("dailyGoal", e.target.value)}
                  >
                    {dailyGoals.map((goal) => (
                      <option key={goal} value={goal}>
                        {goal}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-black text-slate-200">
                    Notifications
                  </label>
                  <select
                    className="w-full rounded-[1.2rem] border border-white/10 bg-slate-950/70 px-4 py-3.5 text-white outline-none"
                    value={settings.notifications}
                    onChange={(e) => update("notifications", e.target.value)}
                  >
                    {notificationOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
