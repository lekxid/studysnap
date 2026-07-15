"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import {
  announceProfileUpdated,
  getCurrentUser,
  getCurrentUserAvatarBlob,
  getGoogleDriveConnectUrl,
  getGoogleDriveFiles,
  importGoogleDrivePDF,
  getGoogleDriveStatus,
  getStudyRooms,
  getUserSessions,
  getUserSettings,
  logoutAllSessions,
  logoutOtherSessions,
  removeCurrentUserAvatar,
  revokeUserSession,
  updateCurrentUserProfile,
  updateUserSettings,
  uploadCurrentUserAvatar,
  type GoogleDriveFile,
  type GoogleDriveIntegrationStatus,
  type StudyRoom,
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
  dailyGoal: "Review 10 Concept Cards",
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
  "Review 10 Concept Cards",
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
  flashcards_folder: "Auto-import Concept Cards folder",
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

type SettingsTab = "profile" | "learning" | "integrations" | "security";

const settingsTabs: {
  id: SettingsTab;
  label: string;
  description: string;
}[] = [
  {
    id: "profile",
    label: "Profile",
    description: "Account, setup, and identity",
  },
  {
    id: "learning",
    label: "Learning",
    description: "AI Tutor, subjects, goals, and memory",
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "Google Drive, apps, and auto-import",
  },
  {
    id: "security",
    label: "Security",
    description: "Sessions and device controls",
  },
];

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

function formatDriveFileDate(value?: string | null) {
  if (!value) return "Modified date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Modified date unavailable";
  }

  return date.toLocaleString();
}

function formatDriveFileSize(value?: string | null) {
  if (!value) return "Size unavailable";

  const bytes = Number(value);

  if (!Number.isFinite(bytes)) {
    return "Size unavailable";
  }

  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;

  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;

  return `${(mb / 1024).toFixed(1)} GB`;
}

function formatConnectedAppLabel(key: string) {
  const labels: Record<string, string> = {
    google_drive: "Google Drive",
    google_docs: "Google Docs",
    icloud: "iCloud",
    onedrive: "OneDrive",
    dropbox: "Dropbox",
  };

  return labels[key] || key;
}

function formatAutoImportRuleLabel(key: string) {
  const labels: Record<string, string> = {
    drive_pdfs: "Auto-import PDFs from Drive",
    google_docs: "Auto-import Google Docs",
    icloud_notes: "Auto-import iCloud notes",
    flashcards_folder: "Auto-import Concept Cards folder",
    sync_every_24_hours: "Sync every 24 hours",
  };

  return labels[key] || key.split("_").join(" ");
}

function getDriveFileKind(mimeType?: string | null) {
  if (!mimeType) return "File";

  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "application/vnd.google-apps.folder") return "Folder";
  if (mimeType === "application/vnd.google-apps.document") return "Google Doc";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "Google Sheet";
  if (mimeType === "application/vnd.google-apps.presentation") return "Google Slides";

  if (mimeType.includes("image/")) return "Image";
  if (mimeType.includes("json")) return "JSON";
  if (mimeType.includes("text/")) return "Text file";

  return "Drive file";
}

export default function SettingsPage() {
  const ready = useRequireAuth();

  const [activeSettingsTab, setActiveSettingsTab] =
    useState<SettingsTab>("profile");

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
  const [avatarPreviewUrl, setAvatarPreviewUrl] =
    useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [googleDriveStatus, setGoogleDriveStatus] =
    useState<GoogleDriveIntegrationStatus | null>(null);
  const [integrationMessage, setIntegrationMessage] = useState("");
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [googleDriveFiles, setGoogleDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [googleDriveFilesNextPageToken, setGoogleDriveFilesNextPageToken] =
    useState<string | null>(null);
  const [googleDriveFilesSearch, setGoogleDriveFilesSearch] = useState("");
  const [googleDriveFilesLoading, setGoogleDriveFilesLoading] = useState(false);
  const [studyRooms, setStudyRooms] = useState<StudyRoom[]>([]);
  const [studyRoomsLoading, setStudyRoomsLoading] = useState(false);
  const [selectedDriveImportRoomId, setSelectedDriveImportRoomId] =
    useState<number | "">("");
  const [driveImportingFileId, setDriveImportingFileId] = useState<string | null>(
    null
  );
  const [driveImportedFiles, setDriveImportedFiles] = useState<
    Record<
      string,
      {
        pdfId: number;
        roomId: number;
        filename: string;
        roomName: string;
      }
    >
  >({});
  const [lastDriveImportResult, setLastDriveImportResult] = useState<{
    pdfId: number;
    roomId: number;
    filename: string;
    roomName: string;
  } | null>(null);

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
        setSyncStatus("Account settings synced.");
      } catch (error) {
        console.error(error);
        if (cancelled) return;
        setSyncStatus("Using local settings. Account sync unavailable.");
      }
    }

    loadSettings();
    loadAccount();
    loadSessions();
    loadGoogleDriveStatus();

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

      setSyncStatus("Account settings synced.");
      setSavedMessage(message);
    } catch (error) {
      console.error(error);
      setSyncStatus("Saved locally. Account sync failed.");
      setSavedMessage("Saved locally. Account sync failed.");
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

  async function loadAvatarPreview(
    profile: UserProfile | null
  ) {
    if (!profile?.avatar_url) {
      setAvatarPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    try {
      const blob = await getCurrentUserAvatarBlob();

      setAvatarPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return blob ? URL.createObjectURL(blob) : null;
      });
    } catch (error) {
      console.error("Could not load profile picture.", error);
      setAvatarPreviewUrl(null);
    }
  }

  function openAvatarPicker() {
    if (avatarSaving) return;

    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
      avatarInputRef.current.click();
    }
  }

  async function handleAvatarSelected(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setAccountStatus("Use a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAccountStatus("Profile pictures must be 5 MB or smaller.");
      return;
    }

    const temporaryPreview = URL.createObjectURL(file);

    setAvatarPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return temporaryPreview;
    });

    setAvatarSaving(true);
    setAccountStatus("Uploading profile picture...");

    try {
      const updatedProfile =
        await uploadCurrentUserAvatar(file);

      setAccount(updatedProfile);
      announceProfileUpdated(updatedProfile);
      await loadAvatarPreview(updatedProfile);

      setAccountStatus("Profile picture updated.");
      setSavedMessage("Profile picture updated.");
    } catch (error) {
      console.error(error);
      setAccountStatus(
        error instanceof Error
          ? error.message
          : "Could not update profile picture."
      );

      await loadAvatarPreview(account);
    } finally {
      setAvatarSaving(false);
    }
  }

  async function handleRemoveAvatar() {
    if (avatarSaving || !account?.avatar_url) return;

    setAvatarSaving(true);
    setAccountStatus("Removing profile picture...");

    try {
      await removeCurrentUserAvatar();

      const updatedProfile = {
        ...account,
        avatar_url: null,
      };

      setAccount(updatedProfile);
      announceProfileUpdated(updatedProfile);

      setAvatarPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });

      setAccountStatus("Profile picture removed.");
      setSavedMessage("Profile picture removed.");
    } catch (error) {
      console.error(error);
      setAccountStatus(
        error instanceof Error
          ? error.message
          : "Could not remove profile picture."
      );
    } finally {
      setAvatarSaving(false);
    }
  }

  function openUniversalUpload() {
    window.dispatchEvent(
      new CustomEvent(
        "studysnap:open-universal-upload",
        {
          detail: {
            openPanel: true,
          },
        }
      )
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

  async function loadGoogleDriveStatus() {
    try {
      const status = await getGoogleDriveStatus();
      setGoogleDriveStatus(status);

      if (!status.configured) {
        setIntegrationMessage("Google Drive setup needs OAuth keys in backend/.env.");
        return;
      }

      if (status.connected) {
        setIntegrationMessage("Google Drive connected.");
        await loadGoogleDriveFiles({ reset: true });
        return;
      }

      setGoogleDriveFiles([]);
      setGoogleDriveFilesNextPageToken(null);
      setIntegrationMessage("Google Drive is ready to connect.");
    } catch (error) {
      console.error(error);
      setIntegrationMessage("Could not check Google Drive status.");
    }
  }

  async function handleConnectGoogleDrive() {
    setIntegrationLoading(true);

    try {
      const result = await getGoogleDriveConnectUrl();

      if (!result.authorization_url) {
        setIntegrationMessage("Google Drive authorization URL was not returned.");
        return;
      }

      window.location.href = result.authorization_url;
    } catch (error) {
      console.error(error);
      setIntegrationMessage(
        "Google Drive is not configured yet. Add OAuth keys to backend/.env first."
      );
    } finally {
      setIntegrationLoading(false);
    }
  }

  useEffect(() => {
    if (!ready || activeSettingsTab !== "integrations") return;

    void loadStudyRoomsForDriveImport();
  }, [ready, activeSettingsTab]);

  async function loadStudyRoomsForDriveImport() {
    setStudyRoomsLoading(true);

    try {
      const rooms = await getStudyRooms();
      const safeRooms = Array.isArray(rooms) ? rooms : [];

      setStudyRooms(safeRooms);

      setSelectedDriveImportRoomId((current) => {
        if (
          current &&
          safeRooms.some((room) => room.id === Number(current))
        ) {
          return current;
        }

        return safeRooms[0]?.id || "";
      });

      if (safeRooms.length === 0) {
        setIntegrationMessage(
          "Create a Study Room before importing Google Drive PDFs."
        );
      }
    } catch (error) {
      console.error("Could not load Study Rooms for Drive import", error);
      setStudyRooms([]);
      setSelectedDriveImportRoomId("");
      setIntegrationMessage("Could not load Study Rooms for Drive import.");
    } finally {
      setStudyRoomsLoading(false);
    }
  }

  async function loadGoogleDriveFiles(
    options: { reset?: boolean; search?: string } = {}
  ) {
    setGoogleDriveFilesLoading(true);

    try {
      const searchValue = options.search ?? googleDriveFilesSearch;
      const pageToken = options.reset ? null : googleDriveFilesNextPageToken;

      const result = await getGoogleDriveFiles({
        pageSize: 10,
        pageToken,
        search: searchValue,
      });

      const files = Array.isArray(result.files) ? result.files : [];

      setGoogleDriveFiles((current) =>
        options.reset ? files : [...current, ...files]
      );
      setGoogleDriveFilesNextPageToken(result.next_page_token || null);

      if (options.reset && files.length === 0) {
        setIntegrationMessage("Google Drive connected. No matching files found.");
      } else {
        setIntegrationMessage("Google Drive files loaded.");
      }
    } catch (error) {
      console.error(error);
      setIntegrationMessage("Could not load Google Drive files.");
    } finally {
      setGoogleDriveFilesLoading(false);
    }
  }

  function getDriveImportRoomLabel(roomId: number | "") {
    if (!roomId) return "No room selected";

    const room = studyRooms.find((item) => item.id === Number(roomId));

    if (!room) return `Room #${roomId}`;

    return room.subject ? `${room.name} • ${room.subject}` : room.name;
  }

  async function handleImportGoogleDrivePDF(file: GoogleDriveFile) {
    if (!selectedDriveImportRoomId) {
      setIntegrationMessage("Choose a Study Room before importing.");
      return;
    }

    if (file.mimeType !== "application/pdf") {
      setIntegrationMessage("Only PDF files can be imported in this version.");
      return;
    }

    const roomId = Number(selectedDriveImportRoomId);
    const roomName = getDriveImportRoomLabel(roomId);

    setDriveImportingFileId(file.id);
    setIntegrationMessage(`Importing ${file.name} to ${roomName}...`);

    try {
      const result = await importGoogleDrivePDF(file.id, roomId);

      const imported = {
        pdfId: result.pdf.id,
        roomId: result.pdf.study_room_id,
        filename: result.pdf.original_filename,
        roomName,
      };

      setDriveImportedFiles((current) => ({
        ...current,
        [file.id]: imported,
      }));
      setLastDriveImportResult(imported);

      setIntegrationMessage(
        `✅ ${result.pdf.original_filename} imported successfully to ${roomName}.`
      );
    } catch (error) {
      console.error("Google Drive PDF import failed", error);
      setIntegrationMessage(
        error instanceof Error
          ? `Import failed: ${error.message}`
          : "Import failed: Could not import Google Drive PDF."
      );
    } finally {
      setDriveImportingFileId(null);
    }
  }

  async function loadAccount() {
    try {
      const profile = await getCurrentUser();
      setAccount(profile);
      setProfileNameDraft(profile.full_name || "");
      setAccountStatus("Account verified and synced.");
      await loadAvatarPreview(profile);

      if (typeof window !== "undefined") {
        announceProfileUpdated(profile);
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
      <div className="min-h-screen bg-[#0b0f14] p-6 text-white">
        Checking authentication...
      </div>
    );
  }

  return (
    <AppShell
      title="Settings"
      subtitle="Manage your synced learning profile, AI memory, future app connections, privacy, and StudySnap setup."
    >
      <div className="content-grid">
        <section className="sticky top-4 z-20 rounded-[1.6rem] border border-white/10 bg-[#0d1218]/95 p-3 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="grid gap-2 md:grid-cols-4">
            {settingsTabs.map((tab) => {
              const active = activeSettingsTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSettingsTab(tab.id)}
                  className={`rounded-[1.2rem] border px-4 py-3 text-left transition ${
                    active
                      ? "border-[#c9ad50]/[0.18] bg-[#c9ad50]/[0.08] text-[#ece8da]"
                      : "border-white/8 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
                  }`}
                >
                  <p className="text-sm font-black">{tab.label}</p>
                  <p
                    className={`mt-1 text-xs leading-5 ${
                      active ? "text-[#cec18d]" : "text-slate-500"
                    }`}
                  >
                    {tab.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {activeSettingsTab === "profile" ? (
          <>
            <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="gold-card rounded-[2rem] p-6 sm:p-8">
                <div className="gold-chip mb-4">StudySnap profile</div>

                <h3 className="panel-title text-white text-balance">
                  Your StudySnap settings now sync with your account.
                </h3>

                <p className="panel-muted mt-4 max-w-2xl">
                  Manage your account name, synced setup, onboarding profile,
                  and StudySnap identity from one clean place.
                </p>

                <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-white/[0.025] px-4 py-3 text-sm font-bold text-slate-200">
                  {isSaving ? "Saving to account..." : syncStatus}
                </div>

                <div className="mt-7 grid gap-4 sm:grid-cols-4">
                  <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.025] p-4">
                    <p className="kpi-label">Style</p>
                    <p className="mt-3 text-lg font-black text-[#ece8da]">
                      {profileSummary.style}
                    </p>
                  </div>

                  <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.025] p-4">
                    <p className="kpi-label">Level</p>
                    <p className="mt-3 text-lg font-black text-[#ece8da]">
                      {profileSummary.level}
                    </p>
                  </div>

                  <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.025] p-4">
                    <p className="kpi-label">Subjects</p>
                    <p className="mt-3 text-lg font-black text-[#ece8da]">
                      {profileSummary.subjects}
                    </p>
                  </div>

                  <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.025] p-4">
                    <p className="kpi-label">Favorite</p>
                    <p className="mt-3 text-lg font-black text-[#ece8da]">
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

                  <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-400">
                    {savedMessage || "Settings auto-save to your account when changed."}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
              <div className="premium-card gold-border rounded-[2rem] p-6">
                <div className="gold-chip mb-4">Account</div>

                <div className="flex flex-wrap items-start gap-5">
                  <div className="shrink-0">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleAvatarSelected}
                    />

                    <button
                      type="button"
                      onClick={openAvatarPicker}
                      disabled={avatarSaving}
                      className="relative grid h-20 w-20 overflow-hidden rounded-[1.6rem] border border-[#c9ad50]/[0.22] bg-[#c9ad50]/[0.12] text-2xl font-black text-[#ece8da] disabled:cursor-wait disabled:opacity-70"
                      title={
                        account?.avatar_url
                          ? "Change profile picture"
                          : "Upload profile picture"
                      }
                    >
                      {avatarPreviewUrl ? (
                        <img
                          src={avatarPreviewUrl}
                          alt={`${accountSummary.name} profile`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="place-self-center">
                          {accountSummary.initials}
                        </span>
                      )}
                    </button>

                    <div className="mt-2 flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={openAvatarPicker}
                        disabled={avatarSaving}
                        className="text-xs font-black text-[#c9ad50] disabled:opacity-60"
                      >
                        {avatarSaving
                          ? "Saving..."
                          : account?.avatar_url
                            ? "Change picture"
                            : "Upload picture"}
                      </button>

                      {account?.avatar_url ? (
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          disabled={avatarSaving}
                          className="text-xs font-bold text-slate-500 transition hover:text-red-200 disabled:opacity-60"
                        >
                          Remove picture
                        </button>
                      ) : null}
                    </div>
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
                        <p className="mt-2 text-sm font-black text-slate-200">
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

                    <div className="mt-4 rounded-[1.1rem] border border-white/[0.07] bg-white/[0.035] px-4 py-3 text-sm font-bold text-slate-200">
                      {accountStatus}
                    </div>
                  </div>
                </div>
              </div>

              <div className="premium-card gold-border rounded-[2rem] p-6">
                <div className="gold-chip mb-4">Account controls</div>
                <h3 className="panel-title text-white">Security shortcuts</h3>
                <p className="panel-muted mt-3">
                  Session and device controls live inside the Security tab.
                </p>

                <div className="mt-5 grid gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveSettingsTab("security")}
                    className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3.5 text-left text-sm font-black text-white transition hover:bg-white/[0.07]"
                  >
                    Open Security →
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
          </>
        ) : null}

        {activeSettingsTab === "learning" ? (
          <>
            <section className="rounded-[1.6rem] border border-cyan-300/15 bg-cyan-400/10 p-5">
              <div className="gold-chip mb-3">Learning workspace</div>
              <h3 className="panel-title text-white">
                Tune how StudySnap teaches you.
              </h3>
              <p className="panel-muted mt-2">
                AI explanation style, difficulty, subjects, goals, privacy, and
                memory are grouped here.
              </p>
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
                            ? "border-amber-300/35 bg-amber-400/12 text-amber-100 shadow-[0_12px_28px_rgba(250,204,21,0.10)]"
                            : "border-white/8 bg-white/[0.03] text-slate-200 hover:border-white/12 hover:bg-white/[0.05]"
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

            <section className="grid items-start gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="premium-card gold-border rounded-[2rem] p-6">
                <div className="gold-chip mb-4">Subjects</div>
                <h3 className="panel-title text-white">Learning subjects</h3>
                <p className="panel-muted mt-3">
                  These subjects personalize your StudySnap workspace.
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
                              ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
                              : "border-white/8 bg-white/[0.03] text-slate-200 hover:border-white/12 hover:bg-white/[0.05]"
                          }`}
                        >
                          <p className="text-sm font-black">{item.name}</p>
                          <p
                            className={`mt-1 text-xs leading-5 ${
                              active ? "text-amber-50/80" : "text-slate-400"
                            }`}
                          >
                            {item.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
              </div>

              <div className="gold-card rounded-[2rem] p-6 xl:col-span-2">
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
            </section>

            <section className="premium-card gold-border rounded-[2rem] p-6">
              <div className="gold-chip mb-4">Unified AI Memory</div>
              <h3 className="panel-title text-white">AI Tutor memory</h3>
              <p className="panel-muted mt-3">
                Choose what StudySnap Brain can remember for future tutoring,
                quizzes, progress, and recommendations.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {[
                  ["aiMemoryEnabled", "Enable AI memory"],
                  ["saveNotesToMemory", "Save notes to AI memory"],
                  ["saveFlashcardsToMemory", "Save Concept Cards to AI memory"],
                  ["saveQuizResultsToMemory", "Save quiz results to AI memory"],
                  ["saveWeakStrongConcepts", "Save weak/strong concepts"],
                  ["saveStudyHistory", "Save study history"],
                ].map(([key, label]) => {
                  const enabled = Boolean(settings[key as keyof SettingsState]);

                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={enabled}
                      onClick={() => toggleMemory(key as keyof SettingsState)}
                      className={`flex items-center justify-between gap-4 rounded-[1.2rem] border px-4 py-3 text-left transition ${
                        enabled
                          ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
                          : "border-white/8 bg-white/[0.03] text-slate-300 hover:border-white/12 hover:bg-white/[0.05]"
                      }`}
                    >
                      <span className="text-sm font-black">{label}</span>

                      <span className="flex shrink-0 items-center gap-2">
                        <span
                          className={`text-xs font-black ${
                            enabled ? "text-amber-100" : "text-slate-500"
                          }`}
                        >
                          {enabled ? "On" : "Off"}
                        </span>

                        <span
                          aria-hidden="true"
                          className={`relative inline-flex h-6 w-11 rounded-full border transition ${
                            enabled
                              ? "border-amber-300/40 bg-amber-300/30"
                              : "border-white/10 bg-slate-800"
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
                              enabled ? "left-6" : "left-1"
                            }`}
                          />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

        {activeSettingsTab === "integrations" ? (
          <>
            <section className="rounded-[1.6rem] border border-white/[0.07] bg-[#12181e] p-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-3 inline-flex rounded-full border border-[#c9ad50]/[0.18] bg-[#c9ad50]/[0.08] px-3 py-1.5 text-[11px] font-black text-[#cec18d]">
                    Files & uploads
                  </div>

                  <h3 className="panel-title text-white">
                    Add files to StudySnap
                  </h3>

                  <p className="panel-muted mt-2 max-w-2xl">
                    Upload a document, image, audio file, video, code file, or
                    other study material and choose the Study Room where it belongs.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={openUniversalUpload}
                  className="shrink-0 rounded-xl bg-[#c9ad50] px-5 py-3 text-sm font-black text-[#111317] transition hover:bg-[#d5bb63]"
                >
                  Upload a file
                </button>
              </div>
            </section>

            <section className="rounded-[1.6rem] border border-white/[0.07] bg-[#12181e] p-5">
              <div className="gold-chip mb-3">Connected apps workspace</div>
              <h3 className="panel-title text-white">
                Manage files, Drive, and future imports.
              </h3>
              <p className="panel-muted mt-2">
                Google Drive is live. Other providers and automatic import rules
                stay organized here.
              </p>
            </section>

            <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
              <div className="premium-card gold-border rounded-[2rem] p-6">
                <div className="gold-chip mb-4">Apps</div>
                <h3 className="panel-title text-white">Future app connections</h3>
                <p className="panel-muted mt-3">
                  Google Drive is active. Other providers are prepared as future
                  integration placeholders.
                </p>

                <div className="mt-5 grid max-h-[520px] gap-3 overflow-y-auto pr-2">
                  {Object.entries(settings.connectedApps).map(([key]) => {
                    const isGoogleDrive = key === "google_drive";
                    const googleConfigured = Boolean(googleDriveStatus?.configured);
                    const googleConnected = Boolean(googleDriveStatus?.connected);

                    return (
                      <div
                        key={key}
                        className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-white">
                              {formatConnectedAppLabel(key)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {isGoogleDrive
                                ? googleConnected
                                  ? googleDriveStatus?.account_email || "Connected"
                                  : googleConfigured
                                    ? "Ready for OAuth connection"
                                    : "OAuth setup required"
                                : "Integration coming soon"}
                            </p>
                          </div>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${
                              isGoogleDrive && googleConnected
                                ? "bg-emerald-400/15 text-emerald-100"
                                : isGoogleDrive && googleConfigured
                                  ? "bg-cyan-400/15 text-cyan-100"
                                  : "bg-white/[0.06] text-slate-300"
                            }`}
                          >
                            {isGoogleDrive
                              ? googleConnected
                                ? "Connected"
                                : googleConfigured
                                  ? "Ready"
                                  : "Setup required"
                              : "Coming soon"}
                          </span>
                        </div>

                        {isGoogleDrive ? (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={handleConnectGoogleDrive}
                              disabled={integrationLoading || googleConnected}
                              className="rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-black text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:text-slate-500"
                            >
                              {googleConnected
                                ? "Connected"
                                : integrationLoading
                                  ? "Opening..."
                                  : googleConfigured
                                    ? "Connect Google"
                                    : "Setup needed"}
                            </button>

                            <button
                              type="button"
                              onClick={loadGoogleDriveStatus}
                              disabled={integrationLoading}
                              className="rounded-xl bg-white/[0.05] px-3 py-2 text-xs font-black text-slate-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-slate-500"
                            >
                              Refresh
                            </button>
                          </div>
                        ) : (
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              disabled
                              className="cursor-not-allowed rounded-xl bg-white/[0.04] px-3 py-2 text-xs font-black text-slate-500"
                            >
                              Connect later
                            </button>
                            <button
                              type="button"
                              disabled
                              className="cursor-not-allowed rounded-xl bg-white/[0.04] px-3 py-2 text-xs font-black text-slate-500"
                            >
                              Sync later
                            </button>
                            <button
                              type="button"
                              disabled
                              className="cursor-not-allowed rounded-xl bg-white/[0.04] px-3 py-2 text-xs font-black text-slate-500"
                            >
                              Files later
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {integrationMessage ? (
                  <div className="mt-4 rounded-[1.2rem] border border-cyan-300/15 bg-cyan-400/10 px-4 py-3 text-sm font-bold text-cyan-100">
                    {integrationMessage}
                  </div>
                ) : null}
              </div>

              <div className="premium-card gold-border rounded-[2rem] p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="gold-chip mb-4">Google Drive</div>
                    <h3 className="panel-title text-white">Drive file browser</h3>
                    <p className="panel-muted mt-3 max-w-3xl">
                      Browse recent files connected to{" "}
                      <span className="font-black text-cyan-100">
                        {googleDriveStatus?.account_email || "your Google account"}
                      </span>
                      . Import actions come next.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void loadGoogleDriveFiles({ reset: true })}
                      disabled={!googleDriveStatus?.connected || googleDriveFilesLoading}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {googleDriveFilesLoading ? "Loading..." : "Refresh files"}
                    </button>

                    <button
                      type="button"
                      onClick={handleConnectGoogleDrive}
                      disabled={integrationLoading}
                      className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {integrationLoading ? "Opening..." : "Reconnect"}
                    </button>
                  </div>
                </div>

                <div className="mt-5 rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <label className="text-sm font-black text-slate-200">
                      Import selected PDFs to Study Room
                    </label>

                    <button
                      type="button"
                      onClick={() => void loadStudyRoomsForDriveImport()}
                      disabled={studyRoomsLoading}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {studyRoomsLoading ? "Loading rooms..." : "Refresh rooms"}
                    </button>
                  </div>

                  <select
                    value={selectedDriveImportRoomId}
                    onChange={(event) =>
                      setSelectedDriveImportRoomId(
                        event.target.value ? Number(event.target.value) : ""
                      )
                    }
                    className="w-full rounded-[1.2rem] border border-white/10 bg-slate-950/70 px-4 py-3.5 text-white outline-none"
                    disabled={studyRoomsLoading || studyRooms.length === 0}
                  >
                    {studyRoomsLoading ? (
                      <option value="">Loading Study Rooms...</option>
                    ) : studyRooms.length === 0 ? (
                      <option value="">No Study Rooms found</option>
                    ) : (
                      studyRooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name} {room.subject ? `• ${room.subject}` : ""}
                        </option>
                      ))
                    )}
                  </select>

                  <p className="mt-2 text-xs font-bold text-slate-500">
                    Only PDF files show the import button for now. Google Docs import as notes comes next.
                  </p>

                  <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs font-bold text-slate-300">
                    Destination:{" "}
                    <span className="text-cyan-100">
                      {getDriveImportRoomLabel(selectedDriveImportRoomId)}
                    </span>
                  </div>

                  {lastDriveImportResult ? (
                    <div className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3">
                      <p className="text-sm font-black text-emerald-100">
                        ✅ Imported successfully
                      </p>
                      <p className="mt-1 text-xs font-bold text-emerald-50/80">
                        {lastDriveImportResult.filename} was added to{" "}
                        {lastDriveImportResult.roomName}.
                      </p>
                      <Link
                        href={`/study-rooms/${lastDriveImportResult.roomId}?tab=pdf`}
                        className="mt-3 inline-flex rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-400/15"
                      >
                        View imported PDF in Room →
                      </Link>
                    </div>
                  ) : null}
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void loadGoogleDriveFiles({
                      reset: true,
                      search: googleDriveFilesSearch,
                    });
                  }}
                  className="mt-5 flex flex-col gap-3 sm:flex-row"
                >
                  <input
                    value={googleDriveFilesSearch}
                    onChange={(event) =>
                      setGoogleDriveFilesSearch(event.target.value)
                    }
                    placeholder="Search Drive files, example: resume or pdf"
                    className="rounded-[1.2rem] px-4 py-3.5"
                    disabled={!googleDriveStatus?.connected}
                  />

                  <button
                    type="submit"
                    disabled={!googleDriveStatus?.connected || googleDriveFilesLoading}
                    className="premium-button shrink-0 rounded-[1.2rem] px-5 py-3.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Search Drive
                  </button>
                </form>

                <div className="mt-4 rounded-[1.2rem] border border-cyan-300/15 bg-cyan-400/10 px-4 py-3 text-sm font-bold text-cyan-100">
                  {integrationMessage || "Google Drive status will appear here."}
                </div>

                <div className="mt-5 grid max-h-[460px] gap-3 overflow-y-auto pr-2">
                  {!googleDriveStatus?.connected ? (
                    <div className="empty-state">
                      Connect Google Drive first to preview files.
                    </div>
                  ) : googleDriveFilesLoading && googleDriveFiles.length === 0 ? (
                    <div className="empty-state">Loading Google Drive files...</div>
                  ) : googleDriveFiles.length === 0 ? (
                    <div className="empty-state">
                      No files loaded yet. Click Refresh files.
                    </div>
                  ) : (
                    googleDriveFiles.map((file) => (
                      <article
                        key={file.id}
                        className="rounded-[1.3rem] border border-white/8 bg-white/[0.03] p-4"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                              {file.iconLink ? (
                                <img
                                  src={file.iconLink}
                                  alt=""
                                  className="h-5 w-5 shrink-0"
                                />
                              ) : null}

                              <p className="truncate text-base font-black text-white">
                                {file.name}
                              </p>
                            </div>

                            <p className="mt-2 text-sm leading-6 text-slate-400">
                              {getDriveFileKind(file.mimeType)} •{" "}
                              {formatDriveFileSize(file.size)} •{" "}
                              {formatDriveFileDate(file.modifiedTime)}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            {file.mimeType === "application/pdf" ? (
                              <button
                                type="button"
                                onClick={() => void handleImportGoogleDrivePDF(file)}
                                disabled={
                                  !selectedDriveImportRoomId ||
                                  driveImportingFileId === file.id ||
                                  Boolean(driveImportedFiles[file.id])
                                }
                                className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-center text-xs font-black text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {driveImportedFiles[file.id]
                                  ? "Imported"
                                  : driveImportingFileId === file.id
                                    ? "Importing..."
                                    : "Import to Room"}
                              </button>
                            ) : (
                              <span className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2 text-xs font-black text-slate-500">
                                Import PDF only
                              </span>
                            )}

                            {driveImportedFiles[file.id] ? (
                              <Link
                                href={`/study-rooms/${driveImportedFiles[file.id].roomId}?tab=pdf`}
                                className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-center text-xs font-black text-emerald-100 transition hover:bg-emerald-400/15"
                              >
                                View in Room
                              </Link>
                            ) : null}

                            {file.webViewLink ? (
                              <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-center text-xs font-black text-slate-200 transition hover:bg-white/[0.08]"
                              >
                                Open
                              </a>
                            ) : (
                              <span className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2 text-xs font-black text-slate-500">
                                No link
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>

                {googleDriveFilesNextPageToken ? (
                  <button
                    type="button"
                    onClick={() => void loadGoogleDriveFiles()}
                    disabled={googleDriveFilesLoading}
                    className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {googleDriveFilesLoading ? "Loading..." : "Load more files"}
                  </button>
                ) : null}
              </div>
            </section>

            <section className="premium-card gold-border rounded-[2rem] p-6">
              <div className="gold-chip mb-4">Automation</div>
              <h3 className="panel-title text-white">Future auto-import rules</h3>
              <p className="panel-muted mt-3">
                These are saved preferences only. Real automatic imports will come
                in the next provider phase.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {Object.entries(settings.autoImportRules).map(([key, enabled]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      saveSettings(
                        {
                          ...settings,
                          autoImportRules: {
                            ...settings.autoImportRules,
                            [key]: !settings.autoImportRules[key],
                          },
                        },
                        "Auto-import rule saved."
                      )
                    }
                    className={`flex items-center justify-between rounded-[1.2rem] border px-4 py-3 text-left transition ${
                      enabled
                        ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-100"
                        : "border-white/8 bg-white/[0.03] text-slate-300"
                    }`}
                  >
                    <span className="text-sm font-black">
                      {formatAutoImportRuleLabel(key)}
                    </span>
                    <span className="text-xs font-black">
                      {enabled ? "Saved" : "Off"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {activeSettingsTab === "security" ? (
          <>
            <section className="rounded-[1.6rem] border border-red-300/15 bg-red-500/10 p-5">
              <div className="gold-chip mb-3">Security workspace</div>
              <h3 className="panel-title text-white">
                Review active sessions and signed-in devices.
              </h3>
              <p className="panel-muted mt-2">
                Device history is kept inside a scrollable panel so Settings stays
                clean.
              </p>
            </section>

            <section className="premium-card gold-border rounded-[2rem] p-6">
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

              <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-white/[0.025] px-4 py-3 text-sm font-bold text-slate-200">
                {sessionsStatus}
              </div>

              <div className="mt-5 grid max-h-[560px] gap-3 overflow-y-auto pr-2">
                {sessions.length === 0 ? (
                  <div className="empty-state">
                    No logged-in devices found yet.
                  </div>
                ) : (
                  sessions.map((session) => {
                    const lastActive = new Date(session.last_active_at);
                    const lastActiveLabel = Number.isNaN(lastActive.getTime())
                      ? "Unknown"
                      : lastActive.toLocaleString();

                    const signedOut = Boolean(session.revoked_at);

                    return (
                      <div
                        key={session.id}
                        className={`rounded-[1.3rem] border p-4 ${
                          session.is_current
                            ? "border-yellow-300/25 bg-yellow-300/10"
                            : signedOut
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
                              {lastActiveLabel}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-black ${
                                session.is_current
                                  ? "bg-yellow-300 text-black"
                                  : signedOut
                                    ? "bg-white/[0.06] text-slate-400"
                                    : "bg-emerald-400/15 text-emerald-100"
                              }`}
                            >
                              {signedOut
                                ? "Signed out"
                                : session.is_current
                                  ? "Current device"
                                  : "Active"}
                            </span>

                            {!session.is_current && !signedOut ? (
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
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
