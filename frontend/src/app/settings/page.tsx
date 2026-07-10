"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import {
  getCurrentUser,
  getUserSessions,
  getUserSettings,
  logoutAllSessions,
  logoutOtherSessions,
  revokeUserSession,
  updateCurrentUserProfile,
  updateUserSettings,
  type SyncedUserSettings,
  type UserProfile,
  type UserSession,
} from "@/lib/api";
import { loadJSON, saveJSON } from "@/lib/storage";

type SettingsState = {
  learningMode: string;
  knowledgeLevel: string;
  progressSharing: string;
  favoriteSubject: string;
  selectedSubjects: string[];
  dailyGoal: string;
  notifications: string;
  theme: string;

  aiMemoryEnabled: boolean;
  saveNotesToMemory: boolean;
  saveFlashcardsToMemory: boolean;
  saveQuizResultsToMemory: boolean;
  saveWeakStrongConcepts: boolean;
  saveStudyHistory: boolean;

  connectedApps: Record<
    string,
    { connected?: boolean; last_synced_at?: string | null }
  >;
  autoImportRules: Record<string, boolean>;
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

const defaultConnectedApps = {
  google_drive: { connected: false, last_synced_at: null },
  google_docs: { connected: false, last_synced_at: null },
  icloud: { connected: false, last_synced_at: null },
  onedrive: { connected: false, last_synced_at: null },
  dropbox: { connected: false, last_synced_at: null },
};

const defaultAutoImportRules = {
  drive_pdfs: false,
  google_docs: false,
  icloud_notes: false,
  flashcards_folder: false,
  sync_every_24_hours: false,
};

const defaultSettings: SettingsState = {
  learningMode: "Clear Explain",
  knowledgeLevel: "Medium",
  progressSharing: "Private",
  favoriteSubject: "",
  selectedSubjects: ["Networking / IT", "Linux"],
  dailyGoal: "Review 10 flashcards",
  notifications: "Important only",
  theme: "dark",

  aiMemoryEnabled: true,
  saveNotesToMemory: true,
  saveFlashcardsToMemory: true,
  saveQuizResultsToMemory: true,
  saveWeakStrongConcepts: true,
  saveStudyHistory: true,

  connectedApps: defaultConnectedApps,
  autoImportRules: defaultAutoImportRules,
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

const connectedAppLabels: Record<string, string> = {
  google_drive: "Google Drive",
  google_docs: "Google Docs",
  icloud: "iCloud",
  onedrive: "OneDrive",
  dropbox: "Dropbox",
};

const autoImportLabels: Record<string, string> = {
  drive_pdfs: "Auto-import PDFs from Drive",
  google_docs: "Auto-import Google Docs",
  icloud_notes: "Auto-import iCloud notes",
  flashcards_folder: "Auto-import flashcards folder",
  sync_every_24_hours: "Sync every 24 hours",
};

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

function fromBackendSettings(settings: SyncedUserSettings): SettingsState {
  return {
    learningMode: settings.learning_mode,
    knowledgeLevel: settings.knowledge_level,
    progressSharing: settings.progress_sharing,
    favoriteSubject: settings.favorite_subject || "",
    selectedSubjects:
      Array.isArray(settings.selected_subjects) &&
      settings.selected_subjects.length > 0
        ? settings.selected_subjects
        : defaultSettings.selectedSubjects,
    dailyGoal: settings.daily_goal,
    notifications: settings.notifications,
    theme: settings.theme || "dark",

    aiMemoryEnabled: settings.ai_memory_enabled,
    saveNotesToMemory: settings.save_notes_to_memory,
    saveFlashcardsToMemory: settings.save_flashcards_to_memory,
    saveQuizResultsToMemory: settings.save_quiz_results_to_memory,
    saveWeakStrongConcepts: settings.save_weak_strong_concepts,
    saveStudyHistory: settings.save_study_history,

    connectedApps: {
      ...defaultConnectedApps,
      ...(settings.connected_apps || {}),
    },
    autoImportRules: {
      ...defaultAutoImportRules,
      ...(settings.auto_import_rules || {}),
    },
  };
}

function toBackendSettings(settings: SettingsState) {
  return {
    learning_mode: settings.learningMode,
    knowledge_level: settings.knowledgeLevel,
    progress_sharing: settings.progressSharing,
    favorite_subject: settings.favoriteSubject,
    selected_subjects: settings.selectedSubjects,
    daily_goal: settings.dailyGoal,
    notifications: settings.notifications,
    theme: settings.theme,

    ai_memory_enabled: settings.aiMemoryEnabled,
    save_notes_to_memory: settings.saveNotesToMemory,
    save_flashcards_to_memory: settings.saveFlashcardsToMemory,
    save_quiz_results_to_memory: settings.saveQuizResultsToMemory,
    save_weak_strong_concepts: settings.saveWeakStrongConcepts,
    save_study_history: settings.saveStudyHistory,

    connected_apps: settings.connectedApps,
    auto_import_rules: settings.autoImportRules,
  };
}

function formatSyncStatus(value?: string | null) {
  if (!value) return "Never synced";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never synced";

  return `Last synced ${date.toLocaleDateString()}`;
}

function formatSessionDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString();
}

function getSessionStatus(session: UserSession) {
  if (session.revoked_at) return "Signed out";
  if (session.is_current) return "Current device";
  return "Active";
}

export default function SettingsPage() {
  const ready = useRequireAuth();

  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [newSubject, setNewSubject] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState("Loading cloud settings...");
  const [isSaving, setIsSaving] = useState(false);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [sessionsStatus, setSessionsStatus] = useState("Loading devices...");
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [account, setAccount] = useState<UserProfile | null>(null);
  const [accountStatus, setAccountStatus] = useState("Loading account...");
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function loadSettings() {
      const savedSettings = loadJSON<SettingsState>(
        SETTINGS_STORAGE_KEY,
        defaultSettings
      );

      const onboarding = getOnboardingProfile();

      const localMergedSettings: SettingsState = {
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
        connectedApps: {
          ...defaultConnectedApps,
          ...(savedSettings.connectedApps || {}),
        },
        autoImportRules: {
          ...defaultAutoImportRules,
          ...(savedSettings.autoImportRules || {}),
        },
      };

      setSettings(localMergedSettings);
      saveJSON(SETTINGS_STORAGE_KEY, localMergedSettings);

      try {
        const backendSettings = await getUserSettings();
        if (cancelled) return;

        const syncedSettings = fromBackendSettings(backendSettings);
        setSettings(syncedSettings);
        saveJSON(SETTINGS_STORAGE_KEY, syncedSettings);
        saveOnboardingFromSettings(syncedSettings);
        setSyncStatus("Cloud settings synced.");
      } catch (error) {
        console.error(error);
        if (cancelled) return;
        setSyncStatus("Using local settings. Cloud sync unavailable.");
      }
    }

    loadSettings();
    loadAccount();
    loadSessions();

    return () => {
      cancelled = true;
    };
  }, [ready]);

  const profileSummary = useMemo(() => {
    return {
      style: settings.learningMode,
      level: settings.knowledgeLevel,
      subjects: settings.selectedSubjects.length,
      favorite: settings.favoriteSubject || "Not set",
    };
  }, [settings]);

  const accountSummary = useMemo(() => {
    const name = account?.full_name?.trim() || "StudySnap Learner";
    const email = account?.email || "Email unavailable";
    const initials =
      name
        .split(" ")
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") ||
      email[0]?.toUpperCase() ||
      "S";

    return {
      name,
      email,
      initials,
      accountId: account?.id ? `#${account.id}` : "Syncing",
      learningMode: account?.learning_mode || settings.learningMode,
    };
  }, [account, settings.learningMode]);

  async function saveSettings(next: SettingsState, message = "Settings saved.") {
    setSettings(next);
    saveJSON(SETTINGS_STORAGE_KEY, next);
    saveOnboardingFromSettings(next);
    setSavedMessage(message);
    setIsSaving(true);

    try {
      const synced = await updateUserSettings(toBackendSettings(next));
      const syncedSettings = fromBackendSettings(synced);

      setSettings(syncedSettings);
      saveJSON(SETTINGS_STORAGE_KEY, syncedSettings);
      saveOnboardingFromSettings(syncedSettings);

      setSyncStatus("Cloud settings synced.");
      setSavedMessage(message);
    } catch (error) {
      console.error(error);
      setSyncStatus("Saved locally. Cloud sync failed.");
      setSavedMessage("Saved locally. Cloud sync failed.");
    } finally {
      setIsSaving(false);

      window.setTimeout(() => {
        setSavedMessage("");
      }, 1800);
    }
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

  function toggleMemory(key: keyof SettingsState) {
    const value = settings[key];

    if (typeof value !== "boolean") return;

    saveSettings(
      {
        ...settings,
        [key]: !value,
      },
      "AI memory preference saved."
    );
  }

  function toggleAutoImport(ruleKey: string) {
    saveSettings(
      {
        ...settings,
        autoImportRules: {
          ...settings.autoImportRules,
          [ruleKey]: !settings.autoImportRules[ruleKey],
        },
      },
      "Auto-import rule saved."
    );
  }

  async function handleSaveProfileName() {
    const fullName = profileNameDraft.trim();

    if (!fullName) {
      setAccountStatus("Profile name cannot be empty.");
      return;
    }

    setProfileSaving(true);

    try {
      const updatedProfile = await updateCurrentUserProfile(fullName);

      setAccount(updatedProfile);
      setProfileNameDraft(updatedProfile.full_name || fullName);
      setAccountStatus("Profile name updated.");
      setSavedMessage("Profile name updated.");

      if (typeof window !== "undefined") {
        localStorage.setItem("studysnap_user", JSON.stringify(updatedProfile));

        window.setTimeout(() => {
          setSavedMessage("");
        }, 1800);
      }
    } catch (error) {
      console.error(error);
      setAccountStatus("Could not update profile name.");
      setSavedMessage("Could not update profile name.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function loadAccount() {
    try {
      const profile = await getCurrentUser();
      setAccount(profile);
      setProfileNameDraft(profile.full_name || "");
      setAccountStatus("Account verified and synced.");

      if (typeof window !== "undefined") {
        localStorage.setItem("studysnap_user", JSON.stringify(profile));
      }
    } catch (error) {
      console.error(error);
      setAccountStatus("Could not load account profile.");
    }
  }

  async function loadSessions() {
    setSessionsLoading(true);

    try {
      const nextSessions = await getUserSessions();
      setSessions(nextSessions);
      setSessionsStatus("Devices synced.");
    } catch (error) {
      console.error(error);
      setSessionsStatus("Could not load logged-in devices.");
    } finally {
      setSessionsLoading(false);
    }
  }

  async function handleRevokeSession(sessionId: number) {
    setSessionsLoading(true);

    try {
      await revokeUserSession(sessionId);
      await loadSessions();
      setSavedMessage("Device signed out.");
    } catch (error) {
      console.error(error);
      setSavedMessage("Could not sign out that device.");
    } finally {
      setSessionsLoading(false);
    }
  }

  async function handleLogoutOtherSessions() {
    const confirmed = window.confirm(
      "Sign out all other devices? This device will stay logged in."
    );

    if (!confirmed) return;

    setSessionsLoading(true);

    try {
      const result = await logoutOtherSessions();
      await loadSessions();
      setSavedMessage(result?.message || "Other devices signed out.");
    } catch (error) {
      console.error(error);
      setSavedMessage("Could not sign out other devices.");
    } finally {
      setSessionsLoading(false);
    }
  }

  async function handleLogoutAllSessions() {
    const confirmed = window.confirm(
      "Sign out all devices? You will need to log in again."
    );

    if (!confirmed) return;

    setSessionsLoading(true);

    try {
      await logoutAllSessions();
      localStorage.removeItem("token");
      window.location.href = "/login";
    } catch (error) {
      console.error(error);
      setSavedMessage("Could not sign out all devices.");
      setSessionsLoading(false);
    }
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
      subtitle="Manage your synced learning profile, AI memory, connected apps, privacy, and StudySnap setup."
    >
      <div className="content-grid">
        <section className="hero-grid">
          <div className="gold-card rounded-[2rem] p-6 sm:p-8">
            <div className="gold-chip mb-4">Cloud profile</div>

            <h3 className="panel-title text-white text-balance">
              Your StudySnap settings now sync with your account.
            </h3>

            <p className="panel-muted mt-4 max-w-2xl">
              Changes here update your backend profile, onboarding setup, AI
              Tutor style, memory preferences, and future connected-app sync.
            </p>

            <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-slate-200">
              {isSaving ? "Saving to cloud..." : syncStatus}
            </div>

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
                  Settings auto-save to your account when changed.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Account</div>
            <div className="flex flex-wrap items-start gap-5">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[1.6rem] border border-yellow-300/25 bg-yellow-300/15 text-2xl font-black text-yellow-100">
                {accountSummary.initials}
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="panel-title text-white">Profile</h3>
                <p className="mt-2 truncate text-xl font-black text-white">
                  {accountSummary.name}
                </p>
                <p className="mt-1 truncate text-sm font-bold text-slate-400">
                  {accountSummary.email}
                </p>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input
                    className="rounded-[1.2rem] px-4 py-3.5"
                    placeholder="Profile name"
                    value={profileNameDraft}
                    onChange={(event) => setProfileNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleSaveProfileName();
                      }
                    }}
                  />

                  <button
                    type="button"
                    onClick={handleSaveProfileName}
                    disabled={profileSaving}
                    className="premium-button shrink-0 rounded-[1.2rem] px-5 py-3.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {profileSaving ? "Saving..." : "Save name"}
                  </button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.03] p-3">
                    <p className="kpi-label">Account ID</p>
                    <p className="mt-2 text-sm font-black text-slate-100">
                      {accountSummary.accountId}
                    </p>
                  </div>

                  <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.03] p-3">
                    <p className="kpi-label">AI mode</p>
                    <p className="mt-2 text-sm font-black text-cyan-200">
                      {accountSummary.learningMode}
                    </p>
                  </div>

                  <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.03] p-3">
                    <p className="kpi-label">Status</p>
                    <p className="mt-2 text-sm font-black text-emerald-200">
                      Active
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-[1.1rem] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
                  {accountStatus}
                </div>
              </div>
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Security</div>
            <h3 className="panel-title text-white">Account controls</h3>
            <p className="panel-muted mt-3">
              Your sessions are now tracked by StudySnap, so logout and device
              sign-out actions update your backend account history.
            </p>

            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById("logged-in-devices")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3.5 text-left text-sm font-black text-white transition hover:bg-white/[0.07]"
              >
                View logged-in devices →
              </button>

              <button
                type="button"
                disabled
                className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-3.5 text-left text-sm font-black text-slate-500"
              >
                Password settings coming soon
              </button>

              <button
                type="button"
                disabled
                className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-3.5 text-left text-sm font-black text-slate-500"
              >
                Email verification coming soon
              </button>
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
              These subjects sync with your account and personalize your
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

        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Unified AI Memory</div>
            <h3 className="panel-title text-white">AI Tutor cloud memory</h3>
            <p className="panel-muted mt-3">
              Choose what StudySnap Brain can remember to personalize future
              tutoring, quizzes, progress, and study recommendations.
            </p>

            <div className="mt-5 grid gap-3">
              {[
                ["aiMemoryEnabled", "Enable AI memory"],
                ["saveNotesToMemory", "Save notes to AI memory"],
                ["saveFlashcardsToMemory", "Save flashcards to AI memory"],
                ["saveQuizResultsToMemory", "Save quiz results to AI memory"],
                ["saveWeakStrongConcepts", "Save weak/strong concepts"],
                ["saveStudyHistory", "Save study history"],
              ].map(([key, label]) => {
                const enabled = Boolean(settings[key as keyof SettingsState]);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleMemory(key as keyof SettingsState)}
                    className={`flex items-center justify-between rounded-[1.2rem] border px-4 py-3 text-left transition ${
                      enabled
                        ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                        : "border-white/8 bg-white/[0.03] text-slate-300"
                    }`}
                  >
                    <span className="text-sm font-black">{label}</span>
                    <span className="text-xs font-black">
                      {enabled ? "On" : "Off"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Connected Apps</div>
            <h3 className="panel-title text-white">Cloud connections</h3>
            <p className="panel-muted mt-3">
              This is the dashboard foundation for Google Drive, Google Docs,
              iCloud, OneDrive, and Dropbox.
            </p>

            <div className="mt-5 grid gap-3">
              {Object.entries(settings.connectedApps).map(([key, app]) => {
                const connected = Boolean(app.connected);

                return (
                  <div
                    key={key}
                    className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-white">
                          {connectedAppLabels[key] || key}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          {formatSyncStatus(app.last_synced_at)}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${
                          connected
                            ? "bg-emerald-400/15 text-emerald-100"
                            : "bg-white/[0.06] text-slate-300"
                        }`}
                      >
                        {connected ? "Connected" : "Not connected"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        className="rounded-xl bg-white/[0.05] px-3 py-2 text-xs font-black text-slate-300"
                      >
                        Connect
                      </button>
                      <button
                        type="button"
                        className="rounded-xl bg-white/[0.05] px-3 py-2 text-xs font-black text-slate-300"
                      >
                        Sync now
                      </button>
                      <button
                        type="button"
                        className="rounded-xl bg-white/[0.05] px-3 py-2 text-xs font-black text-slate-300"
                      >
                        View files
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section
          id="logged-in-devices"
          className="premium-card gold-border rounded-[2rem] p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="gold-chip mb-4">Security</div>
              <h3 className="panel-title text-white">Logged-in devices</h3>
              <p className="panel-muted mt-3 max-w-3xl">
                See where your StudySnap account is signed in. Later this will
                support trusted devices, location history, and recovery checks.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadSessions}
                disabled={sessionsLoading}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sessionsLoading ? "Refreshing..." : "Refresh"}
              </button>

              <button
                type="button"
                onClick={handleLogoutOtherSessions}
                disabled={sessionsLoading}
                className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm font-black text-amber-100 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Sign out others
              </button>

              <button
                type="button"
                onClick={handleLogoutAllSessions}
                disabled={sessionsLoading}
                className="rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Sign out all
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-slate-200">
            {sessionsStatus}
          </div>

          <div className="mt-5 grid gap-3">
            {sessions.length === 0 ? (
              <div className="empty-state">
                No logged-in devices found yet.
              </div>
            ) : (
              sessions.map((session) => {
                const revoked = Boolean(session.revoked_at);

                return (
                  <div
                    key={session.id}
                    className={`rounded-[1.3rem] border p-4 ${
                      session.is_current
                        ? "border-yellow-300/25 bg-yellow-300/10"
                        : revoked
                          ? "border-white/8 bg-white/[0.02] opacity-70"
                          : "border-white/8 bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-black text-white">
                          {session.device_name}
                        </p>

                        <p className="mt-1 text-sm leading-6 text-slate-400">
                          {session.browser} • {session.operating_system}
                        </p>

                        <p className="mt-1 text-xs font-bold text-slate-500">
                          IP: {session.ip_address || "Unknown"} • Last active:{" "}
                          {formatSessionDate(session.last_active_at)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${
                            session.is_current
                              ? "bg-yellow-300 text-black"
                              : revoked
                                ? "bg-white/[0.06] text-slate-400"
                                : "bg-emerald-400/15 text-emerald-100"
                          }`}
                        >
                          {getSessionStatus(session)}
                        </span>

                        {!session.is_current && !revoked ? (
                          <button
                            type="button"
                            onClick={() => handleRevokeSession(session.id)}
                            className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/15"
                          >
                            Sign out
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="premium-card gold-border rounded-[2rem] p-6">
          <div className="gold-chip mb-4">Automation</div>
          <h3 className="panel-title text-white">Cloud auto-import rules</h3>
          <p className="panel-muted mt-3">
            These switches prepare StudySnap for Drive, Docs, iCloud, and
            folder-based auto-import. The real provider connections come next.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {Object.entries(settings.autoImportRules).map(([key, enabled]) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleAutoImport(key)}
                className={`flex items-center justify-between rounded-[1.2rem] border px-4 py-3 text-left transition ${
                  enabled
                    ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-100"
                    : "border-white/8 bg-white/[0.03] text-slate-300"
                }`}
              >
                <span className="text-sm font-black">
                  {autoImportLabels[key] || key}
                </span>
                <span className="text-xs font-black">
                  {enabled ? "On" : "Off"}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
