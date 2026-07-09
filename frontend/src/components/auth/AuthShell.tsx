"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  badge: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  sideTitle?: string;
  sideSubtitle?: string;
};

export default function AuthShell({
  badge,
  title,
  subtitle,
  sideTitle = "Your AI learning workspace starts here.",
  sideSubtitle = "StudySnap brings your rooms, PDFs, notes, flashcards, quizzes, progress, and AI Tutor into one connected system.",
  children,
}: AuthShellProps) {
  return (
    <main className="premium-bg min-h-screen px-3 py-3 text-white sm:px-5">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-7xl items-center">
        <div className="grid w-full overflow-hidden rounded-[1.8rem] border border-white/10 bg-slate-950/45 shadow-[0_22px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative hidden overflow-hidden border-r border-white/10 p-7 lg:flex lg:flex-col lg:justify-between xl:p-8">
            <div className="pointer-events-none absolute -left-28 top-12 h-72 w-72 rounded-full bg-cyan-400/18 blur-3xl" />
            <div className="pointer-events-none absolute bottom-8 right-0 h-80 w-80 rounded-full bg-violet-500/18 blur-3xl" />
            <div className="pointer-events-none absolute right-24 top-28 h-40 w-40 rounded-full bg-amber-300/12 blur-3xl" />

            <div className="relative">
              <Link href="/" className="mb-5 inline-flex items-center gap-3">
                <div className="brand-mark" />
                <div>
                  <p className="text-lg font-black tracking-tight text-white">
                    StudySnap
                  </p>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-200/80">
                    AI Learning Companion
                  </p>
                </div>
              </Link>

              <div className="gold-chip mb-4 inline-flex">{badge}</div>

              <h1 className="max-w-2xl text-4xl font-black leading-[1.04] tracking-tight text-white xl:text-[2.9rem]">
                {sideTitle}
              </h1>

              <p className="mt-4 max-w-xl text-base leading-8 text-slate-300">
                {sideSubtitle}
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-3.5">
                  <p className="kpi-label">Brain</p>
                  <p className="mt-2 text-2xl font-black text-cyan-300">
                    Active
                  </p>
                </div>

                <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-3.5">
                  <p className="kpi-label">Study tools</p>
                  <p className="mt-2 text-2xl font-black text-amber-300">
                    Connected
                  </p>
                </div>

                <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-3.5">
                  <p className="kpi-label">Workspace</p>
                  <p className="mt-2 text-2xl font-black text-violet-300">
                    Premium
                  </p>
                </div>
              </div>
            </div>

            <div className="relative mt-5 rounded-[1.4rem] border border-white/10 bg-black/25 p-4">
              <div className="flex gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-lg">
                  🧠
                </div>

                <div>
                  <h2 className="text-base font-black text-white">
                    StudySnap Brain
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    Your study rooms, notes, PDFs, quizzes, flashcards, and AI
                    answers work together instead of feeling separate.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="flex items-center justify-center p-5 sm:p-7 lg:p-8">
            <div className="w-full max-w-md">
              <div className="mb-6 lg:hidden">
                <Link href="/" className="mb-5 inline-flex items-center gap-3">
                  <div className="brand-mark" />
                  <div>
                    <p className="text-lg font-black tracking-tight text-white">
                      StudySnap
                    </p>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200/80">
                      AI Learning Companion
                    </p>
                  </div>
                </Link>
              </div>

              <div className="mb-6">
                <div className="gold-chip mb-4 inline-flex">{badge}</div>
                <h2 className="text-4xl font-black tracking-tight text-white">
                  {title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  {subtitle}
                </p>
              </div>

              {children}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
