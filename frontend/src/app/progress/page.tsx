"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import { getLearningInsights } from "@/lib/api";

type LearningTopic = {
  subject: string;
  reviewed: number;
  correct: number;
  wrong: number;
  accuracy: number;
};

type LearningTrend = {
  date: string;
  reviews: number;
  average_confidence: number;
  correct: number;
  wrong: number;
};

type LearningInsights = {
  learning_score: number;
  learning_index: number;
  learning_index_today_change: number;
  learning_index_message: string;
  average_confidence: number;
  cards_reviewed_today: number;
  correct_today: number;
  wrong_today: number;
  study_streak: number;
  weak_topics: LearningTopic[];
  strong_topics: LearningTopic[];
  ai_recommendation: string;
  trend: LearningTrend[];
};

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="premium-card gold-border rounded-[2rem] p-6">
      <p className="kpi-label">{label}</p>
      <p className={`mt-4 text-4xl font-black ${tone}`}>{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-400">{detail}</p>
    </div>
  );
}

function ActionLink({
  href,
  title,
  subtitle,
}: {
  href: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
    >
      <p className="text-sm font-black text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p>
    </Link>
  );
}

function TopicCard({
  topic,
  tone,
}: {
  topic: LearningTopic;
  tone: "weak" | "strong";
}) {
  const color =
    tone === "weak"
      ? "border-red-300/20 bg-red-400/10 text-red-100"
      : "border-amber-300/20 bg-amber-300/10 text-amber-100";

  return (
    <div className={`rounded-[1.25rem] border p-4 ${color}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-white">{topic.subject}</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            {topic.reviewed} reviews · {topic.correct} correct · {topic.wrong} missed
          </p>
        </div>

        <p className="text-sm font-black">{topic.accuracy}%</p>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${
            tone === "weak" ? "bg-red-300/80" : "bg-amber-300/80"
          }`}
          style={{ width: `${Math.max(5, topic.accuracy)}%` }}
        />
      </div>
    </div>
  );
}

function TrendBar({
  item,
}: {
  item: LearningTrend;
}) {
  const value = Math.min(100, Math.max(4, item.reviews * 12));
  const label = new Date(item.date).toLocaleDateString(undefined, {
    weekday: "short",
  });

  return (
    <div className="grid gap-2 text-center">
      <div className="flex h-36 items-end rounded-2xl border border-white/8 bg-white/[0.03] p-2">
        <div
          className="w-full rounded-xl bg-gradient-to-t from-amber-500/70 to-amber-200/90"
          style={{ height: `${value}%` }}
        />
      </div>
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="text-[11px] text-slate-500">{item.reviews}</p>
    </div>
  );
}

export default function ProgressPage() {
  const ready = useRequireAuth();

  const [insights, setInsights] = useState<LearningInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;

    async function loadInsights() {
      try {
        setLoading(true);
        setError("");

        const data = await getLearningInsights();
        setInsights(data as LearningInsights);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load progress.");
      } finally {
        setLoading(false);
      }
    }

    loadInsights();
  }, [ready]);

  const accuracy = useMemo(() => {
    const correct = insights?.correct_today || 0;
    const wrong = insights?.wrong_today || 0;
    const total = correct + wrong;

    return total > 0 ? Math.round((correct / total) * 100) : 0;
  }, [insights]);

  const trend = insights?.trend || [];
  const weakTopics = insights?.weak_topics || [];
  const strongTopics = insights?.strong_topics || [];

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#07101f] p-6 text-white">
        Checking authentication...
      </div>
    );
  }

  return (
    <AppShell
      title="Progress"
      subtitle="Live learning growth from quizzes, flashcards, confidence, weak concepts, and StudySnap Brain."
    >
      <div className="content-grid">
        {error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            {error}
          </div>
        ) : null}

        <section className="hero-grid">
          <div className="gold-card rounded-[2rem] p-6 sm:p-8">
            <div className="gold-chip mb-4">Live learning analytics</div>

            <h3 className="panel-title text-white text-balance">
              Your progress now updates from real study activity.
            </h3>

            <p className="panel-muted mt-4 max-w-2xl">
              StudySnap reads your quiz answers, confidence, speed, correct answers,
              missed questions, flashcards, and study streak to show where you stand.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-4">
              <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="kpi-label">Learning Index</p>
                <p className="mt-3 text-2xl font-black text-amber-200">
                  {loading ? "..." : `${insights?.learning_index ?? 0}/1000`}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="kpi-label">Learning Score</p>
                <p className="mt-3 text-2xl font-black text-amber-300">
                  {loading ? "..." : `${insights?.learning_score ?? 0}%`}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="kpi-label">Streak</p>
                <p className="mt-3 text-2xl font-black text-amber-200">
                  🔥 {insights?.study_streak ?? 0}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="kpi-label">Confidence</p>
                <p className="mt-3 text-2xl font-black text-amber-200">
                  {insights?.average_confidence ?? 0}%
                </p>
              </div>
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">AI recommendation</div>
            <h3 className="panel-title text-white">Today’s smart action</h3>

            <p className="mt-4 text-sm leading-7 text-slate-300">
              {insights?.ai_recommendation ||
                "Start with a quiz or flashcard review so StudySnap can read your progress."}
            </p>

            <div className="mt-5 grid gap-3">
              <ActionLink
                href="/quizzes"
                title="Take a smart quiz"
                subtitle="Updates weak and strong concepts"
              />
              <ActionLink
                href="/flashcards"
                title="Review flashcards"
                subtitle="Build confidence and streak"
              />
              <ActionLink
                href="/brain"
                title="Open StudySnap Brain"
                subtitle="See learning memory"
              />
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Reviews Today"
            value={String(insights?.cards_reviewed_today ?? 0)}
            detail="Quiz questions and flashcard reviews completed today."
            tone="text-amber-200"
          />
          <MetricCard
            label="Correct Today"
            value={String(insights?.correct_today ?? 0)}
            detail={`${accuracy}% accuracy today.`}
            tone="text-amber-200"
          />
          <MetricCard
            label="Needs Review"
            value={String(insights?.wrong_today ?? 0)}
            detail="Questions or cards missed today."
            tone="text-red-300"
          />
          <MetricCard
            label="Today Change"
            value={`${insights?.learning_index_today_change ?? 0}`}
            detail={insights?.learning_index_message || "Learning index will update as you study."}
            tone="text-amber-300"
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Weekly activity</div>
            <h3 className="panel-title text-white">Study rhythm</h3>
            <p className="panel-muted mt-3">
              Real 7-day review activity from learning events.
            </p>

            <div className="mt-6 grid grid-cols-7 items-end gap-3">
              {trend.length ? (
                trend.map((item) => <TrendBar key={item.date} item={item} />)
              ) : (
                <p className="col-span-7 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-400">
                  No weekly activity yet.
                </p>
              )}
            </div>
          </div>

          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Weak concepts</div>
            <h3 className="panel-title text-white">Quick review targets</h3>
            <p className="panel-muted mt-3">
              Based on your quiz and flashcard results.
            </p>

            <div className="mt-5 grid gap-3">
              {weakTopics.length ? (
                weakTopics.map((topic) => (
                  <TopicCard key={topic.subject} topic={topic} tone="weak" />
                ))
              ) : (
                <p className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-400">
                  No weak topics yet. Take a quiz to activate this.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="premium-card gold-border rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Strong topics</div>
            <h3 className="panel-title text-white">What you are building well</h3>

            <div className="mt-5 grid gap-3">
              {strongTopics.length ? (
                strongTopics.map((topic) => (
                  <TopicCard key={topic.subject} topic={topic} tone="strong" />
                ))
              ) : (
                <p className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-400">
                  Strong topics will appear after correct quiz or flashcard answers.
                </p>
              )}
            </div>
          </div>

          <div className="gold-card rounded-[2rem] p-6">
            <div className="gold-chip mb-4">Connected learning loop</div>
            <h3 className="panel-title text-white">What StudySnap is tracking</h3>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-black text-white">Quiz answers</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Correct, wrong, confidence, and speed update learning memory.
                </p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-black text-white">Weak concepts</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Missed and low-confidence areas become review targets.
                </p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-black text-white">Strong concepts</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Correct answers increase confidence and mastery.
                </p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-black text-white">Daily progress</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  The dashboard changes as the student studies.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
