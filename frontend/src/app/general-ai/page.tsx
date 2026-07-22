"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import AppShell from "@/components/AppShell";
import GeneralAIChat from "@/features/ai/GeneralAIChat";

function GeneralAIContent() {
  const searchParams = useSearchParams();
  const initialPrompt =
    searchParams.get("prompt") || "";

  const startFresh =
    searchParams.get("new") === "1";

  return (
    <AppShell title="">
      <GeneralAIChat
        initialPrompt={initialPrompt}
        startFresh={startFresh}
      />
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
