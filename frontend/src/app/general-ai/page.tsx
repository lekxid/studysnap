"use client";

import AppShell from "@/components/AppShell";
import GeneralAIChat from "@/features/ai/GeneralAIChat";

export default function GeneralAIPage() {
  return (
    <AppShell
      title="General AI"
      subtitle="Ask StudySnap anything, upload an image, brainstorm ideas, or get help studying."
    >
      <GeneralAIChat />
    </AppShell>
  );
}
