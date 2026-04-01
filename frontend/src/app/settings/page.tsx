"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import { loadJSON, saveJSON } from "@/lib/storage";

type SettingsState = {
  learningMode: string;
  progressSharing: string;
  favoriteSubject: string;
};

const STORAGE_KEY = "studysnap_settings";

export default function SettingsPage() {
  const ready = useRequireAuth();

  const [settings, setSettings] = useState<SettingsState>({
    learningMode: "Clear Explain",
    progressSharing: "Private",
    favoriteSubject: "",
  });

  useEffect(() => {
    if (!ready) return;
    setSettings(
      loadJSON<SettingsState>(STORAGE_KEY, {
        learningMode: "Clear Explain",
        progressSharing: "Private",
        favoriteSubject: "",
      })
    );
  }, [ready]);

  function update<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveJSON(STORAGE_KEY, next);
  }

  if (!ready) {
    return <div className="min-h-screen bg-black text-white p-6">Checking authentication...</div>;
  }

  return (
    <AppShell title="Settings" subtitle="Customize your learning experience">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-xl font-semibold text-cyan-300">Understanding Mode</h3>
          <div className="mt-4 grid gap-3">
            {["Easy Explain", "Clear Explain", "Deep Explain"].map((item) => (
              <button
                key={item}
                onClick={() => update("learningMode", item)}
                className={`rounded-xl px-4 py-3 text-left ${
                  settings.learningMode === item
                    ? "border border-cyan-500/20 bg-cyan-500/10 text-white"
                    : "border border-white/20 text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-xl font-semibold text-cyan-300">Progress Sharing</h3>
          <div className="mt-4 grid gap-3">
            {["Private", "Friends Only", "Public"].map((item) => (
              <button
                key={item}
                onClick={() => update("progressSharing", item)}
                className={`rounded-xl px-4 py-3 text-left ${
                  settings.progressSharing === item
                    ? "border border-cyan-500/20 bg-cyan-500/10 text-white"
                    : "border border-white/20 text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6 lg:col-span-2">
          <h3 className="text-xl font-semibold text-cyan-300">Profile Learning Preference</h3>
          <div className="mt-4">
            <input
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30"
              placeholder="Favorite subject"
              value={settings.favoriteSubject}
              onChange={(e) => update("favoriteSubject", e.target.value)}
            />
          </div>

          <div className="mt-6 rounded-xl bg-white/5 p-4 text-white/80">
            Saved settings:
            <div className="mt-2 text-sm text-white/70">
              Mode: {settings.learningMode} | Sharing: {settings.progressSharing} | Favorite Subject: {settings.favoriteSubject || "Not set"}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
