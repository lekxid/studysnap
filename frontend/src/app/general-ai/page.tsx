"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import AppShell from "@/components/AppShell";
import GeneralAIChat from "@/features/ai/GeneralAIChat";

function GeneralAIContent() {
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") || "";

  return (
    <AppShell
      title="General AI"
      subtitle="Ask StudySnap anything, upload an image, brainstorm ideas, or get help studying."
    >
      <GeneralAIChat initialPrompt={initialPrompt} />
    </AppShell>
  );
}

function GeneralAILoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#05080d] text-sm text-slate-400">
      Opening StudySnap AI...
    </main>
  );
}

export default function GeneralAIPage() {
  return (
    <Suspense fallback={<GeneralAILoading />}>
      <GeneralAIContent />
    </Suspense>
  );
}
