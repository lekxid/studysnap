import Link from "next/link";

const features = [
  {
    title: "AI Tutor",
    desc: "Ask questions, simplify hard topics, and get step-by-step explanations.",
  },
  {
    title: "Study Rooms",
    desc: "Keep each subject organized with notes, files, quizzes, and AI support.",
  },
  {
    title: "Flashcards & Quizzes",
    desc: "Turn notes into active recall tools that help you revise faster.",
  },
];

const quickStats = [
  { label: "Learning modes", value: "3" },
  { label: "Core study tools", value: "6" },
  { label: "Premium focus", value: "24/7" },
];

export default function HomePage() {
  return (
    <main className="premium-bg min-h-screen text-white">
      <section className="page-wrap py-8 sm:py-10">
        <div className="premium-card-strong overflow-hidden rounded-[2rem] border border-white/10">
          <div className="grid gap-0 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="p-6 sm:p-8 lg:p-12">
              <div className="mb-6 flex items-center gap-3">
                <div className="brand-mark" />
                <div className="gold-chip">Premium AI study platform</div>
              </div>

              <h1 className="max-w-4xl text-4xl font-black leading-tight tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
                Study smarter with
                <span className="glow-title mt-2 block bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-300 bg-clip-text text-transparent">
                  StudySnap AI
                </span>
              </h1>

              <p className="panel-muted mt-6 max-w-2xl text-base sm:text-lg">
                A premium study workspace for AI tutoring, organized study rooms,
                notes, flashcards, quizzes, and focused planning — all in one app.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="premium-button rounded-[1.2rem] px-6 py-3.5 text-sm font-bold"
                >
                  Get started
                </Link>

                <Link
                  href="/login"
                  className="premium-button-secondary rounded-[1.2rem] px-6 py-3.5 text-sm font-semibold"
                >
                  Log in
                </Link>

                <Link
                  href="/dashboard"
                  className="premium-button-secondary rounded-[1.2rem] px-6 py-3.5 text-sm font-semibold"
                >
                  Open dashboard
                </Link>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {quickStats.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[1.35rem] border border-white/10 bg-black/20 p-4"
                  >
                    <p className="kpi-label">{item.label}</p>
                    <p className="metric-number mt-3 text-amber-300">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10 p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
              <div className="gold-card rounded-[1.8rem] p-6">
                <div className="gold-chip mb-4">Why it feels different</div>
                <h2 className="panel-title text-white">
                  Built for real study flow
                </h2>

                <div className="mt-6 space-y-4">
                  {features.map((feature) => (
                    <div
                      key={feature.title}
                      className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4"
                    >
                      <p className="text-base font-bold text-white">
                        {feature.title}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-300">
                        {feature.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="premium-card mt-5 rounded-[1.8rem] p-6">
                <div className="gold-chip mb-4">Study flow</div>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <span className="subtle-dot mt-1.5 shrink-0" />
                    <p className="text-sm leading-7 text-slate-200">
                      Create your account and personalize your learning style.
                    </p>
                  </div>

                  <div className="flex items-start gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <span className="subtle-dot mt-1.5 shrink-0" />
                    <p className="text-sm leading-7 text-slate-200">
                      Organize subjects into rooms and keep your study materials together.
                    </p>
                  </div>

                  <div className="flex items-start gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <span className="subtle-dot mt-1.5 shrink-0" />
                    <p className="text-sm leading-7 text-slate-200">
                      Use AI Tutor, flashcards, and quizzes to revise faster.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
