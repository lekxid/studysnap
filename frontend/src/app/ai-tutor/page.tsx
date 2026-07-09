"use client";

import AppShell from "@/components/AppShell";
import AIWorkspace from "@/features/ai/AIWorkspace";

export default function AITutorPage() {
  return (
    <AppShell
      title="AI Tutor"
      subtitle="Your personal AI tutor for study tasks, lessons, and guided learning."
    >
      <AIWorkspace />
    </AppShell>
  );
}
