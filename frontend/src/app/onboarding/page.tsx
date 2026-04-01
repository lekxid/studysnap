"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

const allSubjects = [
  "Math",
  "Science",
  "Biology",
  "Chemistry",
  "Physics",
  "Networking / IT",
  "Programming",
  "Business",
  "History",
  "English",
  "Cybersecurity",
  "Databases",
  "Linux",
  "Cloud Computing",
  "Project Management",
];

const styles = [
  {
    name: "Easy Explain",
    desc: "Simple language, slower breakdown, and beginner-friendly examples.",
  },
  {
    name: "Clear Explain",
    desc: "Balanced explanation with enough detail to understand fast.",
  },
  {
    name: "Deep Explain",
    desc: "More technical detail for serious study and deeper understanding.",
  },
];

const levels = [
  {
    name: "Beginner",
    desc: "Best for new topics or when you want everything broken down simply.",
  },
  {
    name: "Medium",
    desc: "A balanced starting point for most students.",
  },
  {
    name: "Advanced",
    desc: "Good when you already know the basics and want deeper explanations.",
  },
];

export default function OnboardingPage() {
  const [selectedStyle, setSelectedStyle] = useState("Clear Explain");
  const [selectedLevel, setSelectedLevel] = useState("Medium");
  const [query, setQuery] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([
    "Networking / IT",
    "Linux",
  ]);

  const filteredSubjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allSubjects.filter((item) => {
      if (selectedSubjects.includes(item)) return false;
      if (!q) return true;
      return item.toLowerCase().includes(q);
    });
  }, [query, selectedSubjects]);

  function toggleSubject(subject: string) {
    setSelectedSubjects((prev) =>
      prev.includes(subject)
        ? prev.filter((item) => item !== subject)
        : [...prev, subject]
    );
  }

  return (
    <AppShell
      title="Onboarding"
      subtitle="Set your explanation style, choose your subjects, and personalize how StudySnap helps you learn."
    >
      <div className="content-grid">
        <section className="hero-grid">
          <div className="gold-card rounded-[2rem] p-6 sm:p-8">
            <div className="gold-chip mb-4">Smart setup</div>

            <h3 className="panel-title text-white text-balance">
              Personalize your study experience from the start.
            </h3>

            <p className="panel-muted mt-4 max-w-2xl">
              Choose how explanations should sound, pick your subjects, and set
              your starting level so the app feels more useful from day one.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Style</p>
                <p className="mt-3 text-xl font-black text-cyan-300">
                  {selectedStyle}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Level</p>
                <p className="mt-3 text-xl font-black text-amber-300">
                  {selectedLevel}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                <p className="kpi-label">Subjects</p>
                <p className="mt-3 text-xl font-black text-violet-300">
                  {selectedSubjects.length}
                </p>
              </div>
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Saved profile</div>
            <h3 className="panel-title text-white">Your learning setup</h3>

            <div className="mt-6 space-y-4">
              <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Explanation style
                </p>
                <p className="mt-2 text-base font-bold text-white">
                  {selectedStyle}
                </p>
              </div>

              <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Knowledge level
                </p>
                <p className="mt-2 text-base font-bold text-white">
                  {selectedLevel}
                </p>
              </div>

              <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Selected subjects
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-200">
                  {selectedSubjects.length > 0
                    ? selectedSubjects.join(", ")
                    : "No subjects selected yet."}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_1.15fr_0.9fr]">
          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Step 1</div>
            <h3 className="panel-title text-white">Explanation style</h3>
            <p className="panel-muted mt-3">
              Choose how you want the AI to teach you.
            </p>

            <div className="mt-6 space-y-3">
              {styles.map((style) => {
                const active = selectedStyle === style.name;

                return (
                  <button
                    key={style.name}
                    type="button"
                    onClick={() => setSelectedStyle(style.name)}
                    className={`w-full rounded-[1.35rem] border px-5 py-4 text-left transition ${
                      active
                        ? "bg-gradient-to-r from-violet-500/95 via-indigo-500/92 to-sky-500/85 text-white border-transparent shadow-[0_14px_30px_rgba(109,94,252,0.25)]"
                        : "border-white/8 bg-white/[0.03] text-slate-200 hover:bg-white/[0.05]"
                    }`}
                  >
                    <p className="text-sm font-bold">{style.name}</p>
                    <p
                      className={`mt-2 text-sm leading-7 ${
                        active ? "text-white/85" : "text-slate-400"
                      }`}
                    >
                      {style.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Step 2</div>
            <h3 className="panel-title text-white">Choose subjects</h3>
            <p className="panel-muted mt-3">
              Search and add the subjects you want in your setup.
            </p>

            <div className="mt-5">
              <input
                type="text"
                placeholder="Search subjects like Networking, Linux, Math..."
                className="rounded-[1.2rem] px-4 py-3.5"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="mt-6">
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.14em] gold-accent">
                Selected subjects
              </p>

              <div className="flex flex-wrap gap-2">
                {selectedSubjects.length === 0 ? (
                  <div className="empty-state w-full">
                    No subjects selected yet.
                  </div>
                ) : (
                  selectedSubjects.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      onClick={() => toggleSubject(subject)}
                      className="tag-chip"
                    >
                      {subject} ×
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="mt-6">
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.14em] gold-accent">
                Search results
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {filteredSubjects.length === 0 ? (
                  <div className="empty-state sm:col-span-2">
                    No matching subjects found.
                  </div>
                ) : (
                  filteredSubjects.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      onClick={() => toggleSubject(subject)}
                      className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-3.5 text-left text-sm font-semibold text-slate-200 transition hover:bg-white/[0.05]"
                    >
                      {subject}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="content-grid">
            <div className="premium-card gold-border rounded-[2rem] p-6">
              <div className="gold-chip mb-4">Step 3</div>
              <h3 className="panel-title text-white">Knowledge level</h3>
              <p className="panel-muted mt-3">
                Set your starting difficulty.
              </p>

              <div className="mt-6 space-y-3">
                {levels.map((level) => {
                  const active = selectedLevel === level.name;

                  return (
                    <button
                      key={level.name}
                      type="button"
                      onClick={() => setSelectedLevel(level.name)}
                      className={`w-full rounded-[1.35rem] border px-5 py-4 text-left transition ${
                        active
                          ? "border-amber-300/30 bg-amber-400/12 text-amber-100"
                          : "border-white/8 bg-white/[0.03] text-slate-200 hover:bg-white/[0.05]"
                      }`}
                    >
                      <p className="text-sm font-bold">{level.name}</p>
                      <p
                        className={`mt-2 text-sm leading-7 ${
                          active ? "text-amber-50/85" : "text-slate-400"
                        }`}
                      >
                        {level.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="gold-card rounded-[2rem] p-6">
              <div className="gold-chip mb-4">Ready to continue</div>
              <h3 className="panel-title text-white">Your setup looks good</h3>
              <p className="panel-muted mt-4">
                You can continue refining this later, but this already gives the
                app enough information to personalize explanations and study
                suggestions.
              </p>

              <button className="premium-button mt-6 rounded-[1.15rem] px-5 py-3 text-sm font-bold">
                Save and continue
              </button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
