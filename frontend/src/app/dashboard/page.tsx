"use client";

import { useEffect, useState } from "react";
import { getBrainInsights, getLearningInsights, type BrainInsights } from "@/lib/api";

type TokenPayload = {
  sub?: string;
  user_id?: number;
  full_name?: string;
  exp?: number;
};

type TopicInsight = {
  subject: string;
  reviewed: number;
  correct: number;
  wrong: number;
  accuracy: number;
};

type TrendPoint = {
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
  weak_topics: TopicInsight[];
  strong_topics: TopicInsight[];
  ai_recommendation: string;
  trend: TrendPoint[];
};


function getTimeGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

function parseJwt(token: string): TokenPayload | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );

    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}



function LearningIndexCard({
  insights,
}: {
  insights: LearningInsights | null;
}) {
  const change = insights?.learning_index_today_change || 0;
  const isPositive = change >= 0;
  const indexValue = insights?.learning_index || 0;
  const progress = Math.min(Math.round((indexValue / 1000) * 100), 100);

  const trendValues =
    insights?.trend?.map((point) => point.reviews + point.average_confidence) ||
    [];

  const maxTrendValue = Math.max(...trendValues, 1);
  const sparklineHeights = trendValues.map((value) =>
    Math.max(18, Math.round((value / maxTrendValue) * 64))
  );

  return (
    <div className="rounded-[1.5rem] border border-cyan-400/20 bg-cyan-500/10 p-5 lg:col-span-2">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-cyan-200">
            📈 StudySnap Learning Index
          </p>

          <p className="mt-4 text-6xl font-black tracking-tight text-white">
            {insights ? insights.learning_index : "—"}
          </p>

          <p className="mt-2 text-sm text-slate-300">
            Your live learning value across reviews, confidence, accuracy,
            streak, and activity.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:w-72 lg:grid-cols-1">
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-left">
            <p
              className={
                isPositive
                  ? "text-lg font-black text-green-300"
                  : "text-lg font-black text-red-300"
              }
            >
              {isPositive ? "▲" : "▼"} {Math.abs(change)} Today
            </p>
            <p className="mt-1 text-xs text-slate-400">Learning movement</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <div className="flex h-20 items-end gap-2">
              {sparklineHeights.length > 0 ? (
                sparklineHeights.map((height, index) => (
                  <div
                    key={`${height}-${index}`}
                    className="flex-1 rounded-t-full bg-cyan-300/80"
                    style={{ height: `${height}px` }}
                    title={insights?.trend?.[index]?.date}
                  />
                ))
              ) : (
                <p className="text-sm text-slate-400">No trend yet</p>
              )}
            </div>

            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              7-Day Learning Trend
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          <span>SLI Progress</span>
          <span>{progress}%</span>
        </div>

        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-950/60">
          <div
            className="h-full rounded-full bg-cyan-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
        <p className="text-sm leading-7 text-slate-200">
          {insights
            ? insights.learning_index_message
            : "Loading your StudySnap Learning Index..."}
        </p>

        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Updated just now
        </p>
      </div>
    </div>
  );
}


function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5">
      <p className="text-sm font-semibold text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
    </div>
  );
}



function TopicInsightCard({
  title,
  topics,
  emptyMessage,
}: {
  title: string;
  topics: TopicInsight[];
  emptyMessage: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5">
      <h2 className="text-xl font-black text-white">{title}</h2>

      <div className="mt-4 space-y-3">
        {topics.length === 0 ? (
          <p className="text-sm leading-7 text-slate-400">
            {emptyMessage}
          </p>
        ) : (
          topics.map((topic) => (
            <div
              key={topic.subject}
              className="rounded-xl border border-white/10 bg-slate-950/40 p-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white">
                  {topic.subject}
                </h3>

                <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-sm font-bold text-cyan-200">
                  {topic.accuracy}%
                </span>
              </div>

              <div className="mt-3 text-sm text-slate-400">
                Reviewed {topic.reviewed} • Correct {topic.correct} • Wrong {topic.wrong}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}






function DailyBriefingCard({
  fullName,
  insights,
  goal = 20,
}: {
  fullName: string;
  insights: LearningInsights | null;
  goal?: number;
}) {
  const reviewedToday = insights?.cards_reviewed_today || 0;
  const remaining = Math.max(goal - reviewedToday, 0);
  const estimatedMinutes = remaining === 0 ? 0 : Math.max(5, Math.ceil(remaining * 0.7));

  return (
    <div className="mt-5 max-w-3xl rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5">
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-cyan-200">
        🧠 Today's Briefing
      </p>

      <p className="mt-3 text-base leading-8 text-slate-200">
        {fullName}, you reviewed{" "}
        <span className="font-bold text-white">{reviewedToday}</span>{" "}
        flashcard{reviewedToday === 1 ? "" : "s"} today.
        {remaining > 0 ? (
          <>
            {" "}You are{" "}
            <span className="font-bold text-yellow-200">{remaining}</span>{" "}
            card{remaining === 1 ? "" : "s"} away from today's goal.
          </>
        ) : (
          <> You completed today's goal. Great work.</>
        )}
      </p>

      <p className="mt-2 text-sm leading-7 text-slate-400">
        Estimated study time:{" "}
        <span className="font-bold text-white">
          {estimatedMinutes === 0 ? "Goal complete" : `${estimatedMinutes} minutes`}
        </span>
      </p>
    </div>
  );
}


function TodayGoalCard({
  reviewedToday,
  goal = 20,
}: {
  reviewedToday: number;
  goal?: number;
}) {
  const completed = Math.min(reviewedToday, goal);
  const percentage = Math.round((completed / goal) * 100);

  return (
    <div className="mt-8 rounded-[1.5rem] border border-yellow-400/20 bg-yellow-500/10 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-yellow-200">
            🎯 Today's Goal
          </p>
          <h2 className="mt-3 text-2xl font-black text-white">
            Review {goal} flashcards
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            {completed} / {goal} completed today
          </p>
        </div>

        <div className="text-left sm:text-right">
          <p className="text-4xl font-black text-white">{percentage}%</p>
          <p className="mt-1 text-sm text-slate-400">Daily progress</p>
        </div>
      </div>

      <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-950/60">
        <div
          className="h-full rounded-full bg-yellow-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}



function getBrainCoachMessage(brainInsights: BrainInsights | null) {
  if (!brainInsights || brainInsights.concept_count === 0) {
    return "StudySnap Brain is ready. Add notes, PDFs, flashcards, or AI Tutor activity so it can learn your strongest and weakest concepts.";
  }

  const firstReview =
    brainInsights.review_queue[0] ||
    brainInsights.weak_concepts[0] ||
    brainInsights.developing_concepts[0];

  if (firstReview) {
    return `Your next best action is to review ${firstReview.concept_name}. StudySnap Brain selected it from your current learning memory.`;
  }

  if (brainInsights.mastered_count > 0) {
    return "You have mastered concepts building up. Keep reviewing new material so StudySnap can keep your learning momentum strong.";
  }

  return "Your learning memory is growing. Keep studying so StudySnap Brain can detect stronger patterns and smarter review actions.";
}

function getBrainActionHref(brainInsights: BrainInsights | null) {
  if (!brainInsights || brainInsights.concept_count === 0) return "/study-rooms";
  if (brainInsights.review_queue.length > 0) return "/flashcards";
  if (brainInsights.weak_concepts.length > 0) return "/ai-tutor";
  return "/flashcards";
}

function getBrainActionLabel(brainInsights: BrainInsights | null) {
  if (!brainInsights || brainInsights.concept_count === 0) return "Add Learning Material";
  if (brainInsights.review_queue.length > 0) return "Start Smart Review";
  if (brainInsights.weak_concepts.length > 0) return "Ask AI Tutor";
  return "Review Flashcards";
}

function BrainSummaryCard({
  brainInsights,
}: {
  brainInsights: BrainInsights | null;
}) {
  const averageMastery = brainInsights
    ? Math.round(brainInsights.average_mastery * 100)
    : 0;

  const topConcepts =
    brainInsights?.review_queue.length
      ? brainInsights.review_queue
      : brainInsights?.weak_concepts.length
        ? brainInsights.weak_concepts
        : brainInsights?.developing_concepts || [];

  return (
    <div className="mt-8 rounded-[1.5rem] border border-violet-400/20 bg-violet-500/10 p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-violet-200">
            🧠 StudySnap Brain
          </p>

          <h2 className="mt-3 text-2xl font-black text-white">
            Your AI learning memory is active
          </h2>

          <p className="mt-3 text-sm leading-7 text-slate-200">
            {getBrainCoachMessage(brainInsights)}
          </p>

          <button
            onClick={() => {
              window.location.href = getBrainActionHref(brainInsights);
            }}
            className="mt-4 rounded-[1rem] bg-violet-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5"
          >
            {getBrainActionLabel(brainInsights)}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:w-96">
          <StatCard
            title="Concepts Learned"
            value={brainInsights ? brainInsights.concept_count : "—"}
            subtitle="Concepts saved in Brain memory"
          />
          <StatCard
            title="Brain Mastery"
            value={brainInsights ? `${averageMastery}%` : "—"}
            subtitle="Average concept understanding"
          />
          <StatCard
            title="Developing"
            value={brainInsights ? brainInsights.developing_count : "—"}
            subtitle="Concepts still growing"
          />
          <StatCard
            title="Needs Review"
            value={brainInsights ? brainInsights.needs_review_count : "—"}
            subtitle="Concepts Brain recommends reviewing"
          />
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          Top concepts to focus on
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {topConcepts.slice(0, 6).length === 0 ? (
            <span className="text-sm text-slate-400">
              No concept memory yet.
            </span>
          ) : (
            topConcepts.slice(0, 6).map((concept) => (
              <span
                key={concept.concept_id}
                className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-sm font-bold text-slate-100"
              >
                {concept.concept_name}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}


export default function DashboardPage() {
  const [checked, setChecked] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [insights, setInsights] = useState<LearningInsights | null>(null);
  const [brainInsights, setBrainInsights] = useState<BrainInsights | null>(null);
  const [insightsError, setInsightsError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    const payload = parseJwt(token);

    if (!payload) {
      localStorage.removeItem("token");
      window.location.href = "/login";
      return;
    }

    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem("token");
      window.location.href = "/login";
      return;
    }

    setFullName(payload.full_name || "User");
    setEmail(payload.sub || "");
    setChecked(true);

    Promise.all([getLearningInsights(), getBrainInsights()])
      .then(([learningData, brainData]) => {
        setInsights(learningData as LearningInsights);
        setBrainInsights(brainData);
      })
      .catch((err) => {
        setInsightsError(
          err instanceof Error ? err.message : "Failed to load dashboard insights"
        );
      });
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
    <main className="premium-bg min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-6xl rounded-[2rem] border border-white/10 bg-slate-950/40 p-6 text-white shadow-[0_24px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="gold-chip mb-4">Learning Dashboard</div>

            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              {getTimeGreeting()}, {fullName} 👋
            </h1>

            <p className="mt-4 text-base leading-8 text-slate-300">
              Logged in as: {email}
            </p>

            <DailyBriefingCard fullName={fullName} insights={insights} />
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

        {insightsError && (
          <div className="mt-6 rounded-[1.2rem] border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
            {insightsError}
          </div>
        )}

        <TodayGoalCard reviewedToday={insights?.cards_reviewed_today || 0} />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <LearningIndexCard insights={insights} />
          <StatCard
            title="Learning Score"
            value={insights ? `${insights.learning_score}%` : "—"}
            subtitle="Traditional score from reviews and confidence"
          />
          <StatCard
            title="Average Confidence"
            value={insights ? `${insights.average_confidence}%` : "—"}
            subtitle="How confident you felt during study"
          />
          <StatCard
            title="Study Streak"
            value={insights ? `${insights.study_streak} day(s)` : "—"}
            subtitle="Consecutive days with learning activity"
          />
          <StatCard
            title="Cards Reviewed Today"
            value={insights ? insights.cards_reviewed_today : "—"}
            subtitle="Flashcards studied today"
          />
          <StatCard
            title="Correct Today"
            value={insights ? insights.correct_today : "—"}
            subtitle="Cards you knew"
          />
          <StatCard
            title="Wrong Today"
            value={insights ? insights.wrong_today : "—"}
            subtitle="Cards that need more practice"
          />
        </div>

        <div className="mt-8 rounded-[1.5rem] border border-cyan-400/20 bg-cyan-500/10 p-5">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-cyan-200">
            AI Recommendation
          </p>
          <p className="mt-3 text-base leading-8 text-slate-100">
            {insights
              ? insights.ai_recommendation
              : "Loading your learning recommendation..."}
          </p>
        </div>

        <BrainSummaryCard brainInsights={brainInsights} />

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <TopicInsightCard
            title="🎯 Weak Topics"
            topics={insights?.weak_topics || []}
            emptyMessage="No weak topics yet. Review more flashcards so StudySnap can detect where you need help."
          />

          <TopicInsightCard
            title="🏆 Strong Topics"
            topics={insights?.strong_topics || []}
            emptyMessage="No strong topics yet. Keep reviewing cards so StudySnap can identify your strongest subjects."
          />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            {
              title: "Study Rooms",
              desc: "Active spaces for your subjects.",
              href: "/study-rooms",
            },
            {
              title: "Notes",
              desc: "Your saved notes and summaries.",
              href: "/notes",
            },
            {
              title: "Flashcards",
              desc: "Review cards and train StudySnap's learning engine.",
              href: "/flashcards",
            },
            {
              title: "AI Tutor",
              desc: "Ask anything and learn faster.",
              href: "/ai-tutor",
            },
          ].map((item) => (
            <button
              key={item.title}
              onClick={() => (window.location.href = item.href)}
              className="rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5 text-left transition hover:-translate-y-1 hover:border-cyan-400/40 hover:bg-slate-800/80"
            >
              <h2 className="text-xl font-bold text-white">{item.title}</h2>

              <p className="mt-2 text-sm text-slate-300">{item.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
