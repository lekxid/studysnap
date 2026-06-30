"use client";

import AppShell from "@/components/AppShell";
import AIWorkspace from "@/features/ai/AIWorkspace";

export default function AITutorPage() {
  return (
    <AppShell title="AI Tutor" subtitle="Ask questions, generate lessons, and study smarter">
      <AIWorkspace />
    </AppShell>
  );
}
