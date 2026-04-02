"use client";

import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    setChecked(true);
  }, []);

  if (!checked) {
    return (
      <main className="premium-bg flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-slate-950/40 p-6 text-center text-white shadow-[0_24px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8">
          Checking login...
        </div>
      </main>
    );
  }

  return (
    <main className="premium-bg flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-4xl rounded-[2rem] border border-white/10 bg-slate-950/40 p-6 text-white shadow-[0_24px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="gold-chip mb-4">Dashboard</div>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              Welcome to StudySnap
            </h1>
            <p className="mt-4 text-base leading-8 text-slate-300">
              You are logged in successfully.
            </p>
          </div>

          <button
            onClick={() => {
              localStorage.removeItem("token");
              window.location.href = "/login";
            }}
            className="rounded-[1.2rem] border border-red-400/20 bg-red-500/10 px-5 py-3 text-sm font-bold text-red-200"
          >
            Logout
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-xl font-bold text-white">Notes</h2>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              Your notes section will go here.
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-xl font-bold text-white">Flashcards</h2>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              Your flashcards section will go here.
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-xl font-bold text-white">Quizzes</h2>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              Your quizzes section will go here.
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-xl font-bold text-white">AI Tutor</h2>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              Your AI study assistant will go here.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
