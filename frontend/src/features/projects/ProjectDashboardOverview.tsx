import Link from "next/link";

type ContinueItem = {
  id: number;
  title: string;
  subtitle: string;
  icon?: string;
  onOpen: () => void;
};

type Action = {
  title: string;
  description: string;
  icon: string;
  href?: string;
  onClick?: () => void;
};

type ProjectDashboardOverviewProps = {
  pdfCount: number;
  progress: number;
  continueItems: ContinueItem[];
  quickActions: Action[];
  onAskAI: () => void;
  onUploadPDF: () => void;
  onViewAll: () => void;
};

function getFeaturedActions(actions: Action[]) {
  const preferredTitles = [
    "Upload PDF",
    "Create Note",
    "Flashcards",
    "Take Quiz",
    "Ask Project AI",
  ];

  return preferredTitles
    .map((title) => actions.find((action) => action.title === title))
    .filter(Boolean) as Action[];
}

function DashboardActionCard({
  action,
  index,
}: {
  action: Action;
  index: number;
}) {
  const cardClass =
    "group min-h-[150px] rounded-[1.35rem] border border-white/10 bg-black/35 p-4 text-left transition hover:-translate-y-1 hover:border-yellow-400/40 hover:bg-yellow-400/10";

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-yellow-400/20 bg-yellow-400/10 text-2xl">
          {action.icon}
        </div>

        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-black text-slate-400">
          0{index + 1}
        </span>
      </div>

      <p className="mt-4 text-sm font-black leading-tight text-white">
        {action.title}
      </p>

      <p className="mt-2 text-xs leading-5 text-slate-400">
        {action.description}
      </p>
    </>
  );

  if (action.href) {
    return (
      <Link href={action.href} className={cardClass}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={cardClass}>
      {content}
    </button>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: string;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/80 p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-2xl">
          {icon}
        </div>

        <div>
          <p className="text-sm font-black text-white">{label}</p>
          <p className="text-xs text-slate-500">{detail}</p>
        </div>
      </div>

      <p className="mt-4 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

export default function ProjectDashboardOverview({
  pdfCount,
  progress,
  continueItems,
  quickActions,
  onAskAI,
  onUploadPDF,
  onViewAll,
}: ProjectDashboardOverviewProps) {
  const safeProgress = Math.max(0, Math.min(100, progress));
  const featuredActions = getFeaturedActions(quickActions);

  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_390px]">
        <div className="overflow-hidden rounded-[1.8rem] border border-yellow-400/20 bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.16),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-6">
          <div className="mb-5 inline-flex rounded-full border border-yellow-400/25 bg-yellow-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-yellow-100">
            ✨ Let’s get started
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div>
              <h2 className="text-3xl font-black tracking-tight text-white">
                What do you want to do today?
              </h2>

              <p className="mt-2 text-sm leading-7 text-slate-300">
                Pick up where you left off, upload new material, or ask StudySnap AI for help.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {featuredActions.map((action, index) => (
                  <DashboardActionCard
                    key={action.title}
                    action={action}
                    index={index}
                  />
                ))}
              </div>
            </div>

            <div className="hidden rounded-[1.6rem] border border-yellow-400/20 bg-black/30 p-5 lg:block">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-black text-yellow-100">
                  Hi, I’m StudySnap AI
                </p>
                <p className="mt-2 text-xs leading-6 text-slate-400">
                  Your personal study assistant for this project room.
                </p>
              </div>

              <div className="mt-5 grid h-44 place-items-center rounded-[1.4rem] border border-white/10 bg-yellow-400/10 text-7xl">
                🤖
              </div>
            </div>
          </div>
        </div>

        <aside className="rounded-[1.8rem] border border-white/10 bg-slate-950/80 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-200">
                Your Progress
              </p>
              <h3 className="mt-2 text-2xl font-black text-white">
                Keep it up
              </h3>
            </div>

            <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-xs font-black text-yellow-100">
              Live
            </span>
          </div>

          <div className="mt-7 grid place-items-center">
            <div
              className="grid h-44 w-44 place-items-center rounded-full"
              style={{
                background: `conic-gradient(rgb(250 204 21) ${safeProgress}%, rgba(255,255,255,0.08) 0)`,
              }}
            >
              <div className="grid h-32 w-32 place-items-center rounded-full bg-slate-950 text-center">
                <div>
                  <p className="text-4xl font-black text-white">
                    {safeProgress}%
                  </p>
                  <p className="text-xs text-slate-500">Overall</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-7 space-y-3">
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 p-3 text-sm">
              <span className="text-slate-300">📄 PDFs Uploaded</span>
              <span className="font-black text-white">{pdfCount}</span>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 p-3 text-sm">
              <span className="text-slate-300">📝 Notes</span>
              <span className="font-black text-white">Connected</span>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 p-3 text-sm">
              <span className="text-slate-300">🧠 Flashcards</span>
              <span className="font-black text-white">Ready</span>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 p-3 text-sm">
              <span className="text-slate-300">🧾 Quizzes</span>
              <span className="font-black text-white">Ready</span>
            </div>
          </div>
        </aside>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/80 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-200">
                📖 Continue Learning
              </p>
              <h3 className="mt-2 text-2xl font-black text-white">
                Pick up where you stopped
              </h3>
            </div>

            <button
              type="button"
              onClick={onViewAll}
              className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-4 py-2 text-sm font-black text-yellow-100 transition hover:bg-yellow-400/20"
            >
              View all activity →
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {continueItems.length ? (
              continueItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onOpen}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-left transition hover:border-yellow-400/35 hover:bg-yellow-400/10"
                >
                  <div className="min-w-0">
                    <p className="line-clamp-1 break-all font-black text-white">
                      {item.icon || "📘"} {item.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {item.subtitle}
                    </p>
                  </div>

                  <div className="hidden h-2 w-28 overflow-hidden rounded-full bg-white/10 sm:block">
                    <div className="h-full w-3/4 rounded-full bg-yellow-300" />
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm leading-7 text-slate-400">
                Upload a PDF, create a note, or ask StudySnap AI to start your learning activity.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/80 p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-yellow-400/20 bg-yellow-400/10 text-2xl">
              🤖
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-200">
                AI Tutor
              </p>
              <h3 className="text-2xl font-black text-white">
                Ask about this project
              </h3>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-yellow-400/15 bg-yellow-400/10 p-4">
            <p className="text-sm font-black text-yellow-100">
              Try asking me something like:
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "Explain this in simple words",
                "Quiz me from this project",
                "What should I review next?",
                "Summarize my PDFs",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={onAskAI}
                  className="rounded-full border border-white/10 bg-black/30 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-yellow-400/30 hover:bg-yellow-400/10"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onAskAI}
            className="mt-5 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-left text-sm font-bold text-slate-300 transition hover:border-yellow-400/35 hover:bg-yellow-400/10"
          >
            <span>Ask anything about your study material...</span>
            <span className="rounded-xl bg-yellow-300 px-3 py-2 font-black text-black">
              ➤
            </span>
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon="📄"
          label="PDFs"
          value={String(pdfCount)}
          detail="Files uploaded"
        />
        <StatCard
          icon="📝"
          label="Notes"
          value="Live"
          detail="Project notes connected"
        />
        <StatCard
          icon="🧠"
          label="Flashcards"
          value="Ready"
          detail="Cards linked to room"
        />
        <StatCard
          icon="🧾"
          label="Quizzes"
          value="Ready"
          detail="Project quiz storage"
        />
        <StatCard
          icon="🔥"
          label="Study Streak"
          value="Soon"
          detail="Learning events connected"
        />
      </div>

      <div className="rounded-[1.8rem] border border-yellow-400/20 bg-yellow-400/10 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xl font-black text-white">
              🏆 You’re building a connected study system.
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              PDFs, notes, flashcards, quizzes, planner, search, and AI are now tied to this project room.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-black text-yellow-100">
            <span>1 day</span>
            <span className="h-px w-10 bg-yellow-300/50" />
            <span>3 days</span>
            <span className="h-px w-10 bg-yellow-300/50" />
            <span>7 days</span>
            <span className="h-px w-10 bg-yellow-300/50" />
            <span>10 days</span>
          </div>
        </div>
      </div>
    </section>
  );
}
