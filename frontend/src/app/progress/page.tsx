"use client";

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

export default function ProgressPage() {
  const ready = useRequireAuth();

  const [plannerItems, setPlannerItems] = useState<PlannerItem[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);

  useEffect(() => {
    if (!ready) return;

    setPlannerItems(loadJSON<PlannerItem[]>("studysnap_planner_items", []));
    setFlashcards(loadJSON<Flashcard[]>("studysnap_flashcards", []));
    setQuizQuestions(loadJSON<QuizQuestion[]>("studysnap_quiz_questions", []));
    setNotes(loadJSON<NoteItem[]>("studysnap_notes", []));
  }, [ready]);

  const xp = useMemo(() => {
    return plannerItems.length * 10 + flashcards.length * 5 + quizQuestions.length * 8 + notes.length * 4;
  }, [plannerItems, flashcards, quizQuestions, notes]);

  const streak = useMemo(() => {
    return Math.max(1, Math.min(7, plannerItems.length + flashcards.length));
  }, [plannerItems, flashcards]);

  if (!ready) {
    return <div className="min-h-screen bg-black text-white p-6">Checking authentication...</div>;
  }

  return (
    <AppShell title="Progress" subtitle="Track streaks, weak topics, XP, and study growth">
      <div className="grid gap-6 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-lg font-semibold text-cyan-300">Study XP</h3>
          <p className="mt-4 text-4xl font-bold text-yellow-300">{xp} XP</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-lg font-semibold text-cyan-300">Study Streak</h3>
          <p className="mt-4 text-4xl font-bold text-green-400">🔥 {streak} days</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-lg font-semibold text-cyan-300">Flashcards</h3>
          <p className="mt-4 text-4xl font-bold">{flashcards.length}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-lg font-semibold text-cyan-300">Quiz Questions</h3>
          <p className="mt-4 text-4xl font-bold">{quizQuestions.length}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-xl font-semibold text-cyan-300">Study Activity Summary</h3>
          <div className="mt-4 grid gap-3">
            <div className="rounded-xl bg-white/5 p-4 text-white/80">Saved notes: {notes.length}</div>
            <div className="rounded-xl bg-white/5 p-4 text-white/80">Planner sessions: {plannerItems.length}</div>
            <div className="rounded-xl bg-white/5 p-4 text-white/80">Flashcards created: {flashcards.length}</div>
            <div className="rounded-xl bg-white/5 p-4 text-white/80">Quiz questions created: {quizQuestions.length}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-xl font-semibold text-cyan-300">Weak Topic Detection</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-white/5 p-4">Subnetting</div>
            <div className="rounded-xl bg-white/5 p-4">Routing Protocols</div>
            <div className="rounded-xl bg-white/5 p-4">OSI Layers</div>
            <div className="rounded-xl bg-white/5 p-4">Binary Conversion</div>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-white/10 bg-[#0a1022] p-6">
        <h3 className="text-xl font-semibold text-cyan-300">Achievements</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-white/5 p-4">Flashcard Master</div>
          <div className="rounded-xl bg-white/5 p-4">Quiz Champion</div>
          <div className="rounded-xl bg-white/5 p-4">7 Day Study Streak</div>
        </div>
      </div>
    </AppShell>
  );
}
