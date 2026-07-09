"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  "Anatomy",
  "Nursing",
  "Personal Support Worker",
  "Psychology",
];

const styles = [
  {
    name: "Easy Explain",
    desc: "Simple words, slower steps, and beginner-friendly examples.",
  },
  {
    name: "Clear Explain",
    desc: "Balanced answers that are easy to understand and still useful.",
  },
  {
    name: "Deep Explain",
    desc: "More detail, stronger reasoning, and deeper study explanations.",
  },
];

const levels = [
  {
    name: "Beginner",
    desc: "Best when the topic is new or confusing.",
  },
  {
    name: "Medium",
    desc: "Good for most studying and daily learning.",
  },
  {
    name: "Advanced",
    desc: "Best when you already know the basics.",
  },
];

const ONBOARDING_STORAGE_KEY = "studysnap:onboarding";

type OnboardingProfile = {
  explanationStyle: string;
  knowledgeLevel: string;
  subjects: string[];
  savedAt: string;
};

export default function OnboardingPage() {
  const router = useRouter();

  const [selectedStyle, setSelectedStyle] = useState("Clear Explain");
  const [selectedLevel, setSelectedLevel] = useState("Medium");
  const [query, setQuery] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([
    "Networking / IT",
    "Linux",
  ]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (!raw) return;

      const profile = JSON.parse(raw) as Partial<OnboardingProfile>;

      if (profile.explanationStyle) {
        setSelectedStyle(profile.explanationStyle);
      }

      if (profile.knowledgeLevel) {
        setSelectedLevel(profile.knowledgeLevel);
      }

      if (Array.isArray(profile.subjects)) {
        setSelectedSubjects(profile.subjects);
      }
    } catch {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    }
  }, []);

  const filteredSubjects = useMemo(() => {
    const q = query.trim().toLowerCase();

    return allSubjects.filter((item) => {
      if (selectedSubjects.includes(item)) return false;
      if (!q) return true;
      return item.toLowerCase().includes(q);
    });
  }, [query, selectedSubjects]);

  function toggleSubject(subject: string) {
    setSaved(false);
    setSelectedSubjects((prev) =>
      prev.includes(subject)
        ? prev.filter((item) => item !== subject)
        : [...prev, subject]
    );
  }

  function saveAndContinue() {
    const profile: OnboardingProfile = {
      explanationStyle: selectedStyle,
      knowledgeLevel: selectedLevel,
      subjects: selectedSubjects,
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(profile));
    localStorage.setItem("studysnap:onboarding-complete", "true");

    setSaved(true);

    window.setTimeout(() => {
      router.push("/dashboard");
    }, 450);
  }

  return (
    <AppShell
      title="Onboarding"
      subtitle="Personalize your explanation style, subjects, and study level so StudySnap feels built for you."
    >
      <div className="content-grid">
        <section className="hero-grid">
          <div className="gold-card rounded-[2rem] p-6 sm:p-8">
            <div className="gold-chip mb-4">Smart setup</div>

            <h3 className="panel-title text-white text-balance">
              Make StudySnap teach the way you learn best.
            </h3>

            <p className="panel-muted mt-4 max-w-2xl">
              This setup helps the app personalize AI explanations, study
              suggestions, weak concept reviews, and future learning actions.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-3">
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
            <div className="gold-chip mb-4">Your profile</div>
            <h3 className="panel-title text-white">Learning setup</h3>

            <div className="mt-5 space-y-3">
              <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  Explanation style
                </p>
                <p className="mt-2 text-base font-black text-white">
                  {selectedStyle}
                </p>
              </div>

              <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  Knowledge level
                </p>
                <p className="mt-2 text-base font-black text-white">
                  {selectedLevel}
                </p>
              </div>

              <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
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

        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.25fr_0.85fr]">
          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Step 1</div>
            <h3 className="panel-title text-white">AI teaching style</h3>
            <p className="panel-muted mt-3">
              Choose how StudySnap should explain topics to you.
            </p>

            <div className="mt-5 space-y-3">
              {styles.map((style) => {
                const active = selectedStyle === style.name;

                return (
                  <button
                    key={style.name}
                    type="button"
                    onClick={() => {
                      setSaved(false);
                      setSelectedStyle(style.name);
                    }}
                    className={`w-full rounded-[1.35rem] border px-5 py-4 text-left transition ${
                      active
                        ? "border-transparent bg-gradient-to-r from-violet-500/95 via-indigo-500/92 to-sky-500/85 text-white shadow-[0_14px_30px_rgba(109,94,252,0.25)]"
                        : "border-white/8 bg-white/[0.03] text-slate-200 hover:bg-white/[0.05]"
                    }`}
                  >
                    <p className="text-sm font-black">{style.name}</p>
                    <p
                      className={`mt-2 text-sm leading-6 ${
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
              Pick the subjects StudySnap should understand about your study
              goals.
            </p>

            <div className="mt-5">
              <input
                type="text"
                placeholder="Search subjects like Nursing, Linux, Anatomy..."
                className="rounded-[1.2rem] px-4 py-3.5"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="mt-5">
              <p className="mb-3 text-sm font-black uppercase tracking-[0.14em] gold-accent">
                Selected
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

            <div className="mt-5">
              <p className="mb-3 text-sm font-black uppercase tracking-[0.14em] gold-accent">
                Add more
              </p>

              <div className="grid max-h-[250px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
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
                      className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-left text-sm font-bold text-slate-200 transition hover:bg-white/[0.05]"
                    >
                      + {subject}
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

              <div className="mt-5 space-y-3">
                {levels.map((level) => {
                  const active = selectedLevel === level.name;

                  return (
                    <button
                      key={level.name}
                      type="button"
                      onClick={() => {
                        setSaved(false);
                        setSelectedLevel(level.name);
                      }}
                      className={`w-full rounded-[1.35rem] border px-5 py-4 text-left transition ${
                        active
                          ? "border-amber-300/30 bg-amber-400/12 text-amber-100"
                          : "border-white/8 bg-white/[0.03] text-slate-200 hover:bg-white/[0.05]"
                      }`}
                    >
                      <p className="text-sm font-black">{level.name}</p>
                      <p
                        className={`mt-2 text-sm leading-6 ${
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
              <div className="gold-chip mb-4">Ready</div>
              <h3 className="panel-title text-white">Save your setup</h3>
              <p className="panel-muted mt-4">
                Your setup will be saved on this device and used as the base for
                your StudySnap experience.
              </p>

              {saved ? (
                <div className="mt-5 rounded-[1.2rem] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
                  Saved. Taking you to dashboard...
                </div>
              ) : null}

              <button
                type="button"
                onClick={saveAndContinue}
                className="premium-button mt-5 w-full rounded-[1.15rem] px-5 py-3.5 text-sm font-black"
              >
                Save and continue
              </button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
