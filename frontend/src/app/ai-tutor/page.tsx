"use client";

import { FormEvent, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

const modes = [
  "Easy Explain",
  "Clear Explain",
  "Deep Explain",
  "Explain Simply",
  "Step-by-Step",
  "Like I’m New",
];

const quickActions = [
  "Make Flashcards",
  "Make Quiz",
  "Summarize Notes",
  "Test Me Now",
];

const demoPrompts = [
  "Explain TCP like I am 10 years old",
  "What is subnetting step by step?",
  "Explain the OSI model in simple language",
  "Break down routing protocols for beginners",
];

export default function AITutorPage() {
  const [mode, setMode] = useState("Clear Explain");
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => question.trim().length > 0, [question]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setAnswer("");

    try {
      await new Promise((resolve) => setTimeout(resolve, 700));

      const simulated = `Mode: ${mode}

Question:
${question}

${context.trim() ? `Context:
${context}

` : ""}Answer:
This is your upgraded AI Tutor workspace.

Your final backend connection can later return real answers here, but the page now has a cleaner premium layout, better spacing, clearer action hierarchy, and a more polished study flow.`;

      setAnswer(simulated);
      setHistory((prev) => [question, ...prev].slice(0, 6));
      setQuestion("");
    } finally {
      setLoading(false);
    }
  }

  function applyDemoPrompt(prompt: string) {
    setQuestion(prompt);
  }

  function applyQuickAction(action: string) {
    if (!question.trim() && !context.trim()) {
      setQuestion(`${action}: `);
      return;
    }

    setQuestion((prev) => {
      const base = prev.trim();
      return base ? `${action} for: ${base}` : `${action}: `;
    });
  }

  return (
    <AppShell
      title="AI Tutor"
      subtitle="Ask smarter questions, switch explanation style, and turn notes into study tools."
    >
      <div className="content-grid xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <section className="content-grid">
          <div className="gold-card rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-3xl">
                <div className="gold-chip mb-4">Main AI workspace</div>
                <h3 className="panel-title text-white text-balance">
                  Ask anything and get answers in the way you understand best.
                </h3>
                <p className="panel-muted mt-4">
                  Choose your explanation mode, ask a question, add optional
                  notes or lecture context, and let StudySnap shape the answer
                  to your learning level.
                </p>
              </div>

              <div className="rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-4 sm:min-w-[180px]">
                <p className="kpi-label">Current mode</p>
                <p className="mt-3 text-base font-black text-amber-200 sm:text-lg">
                  {mode}
                </p>
              </div>
            </div>

            <div className="mt-7">
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.16em] gold-accent">
                Understanding mode
              </p>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {modes.map((item) => {
                  const active = mode === item;

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setMode(item)}
                      className={active ? "mode-pill mode-pill-active" : "mode-pill"}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="premium-card gold-border rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-8">
            <div>
              <div className="gold-chip mb-4">Quick tools</div>
              <h3 className="panel-title text-white">One-tap study actions</h3>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {quickActions.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => applyQuickAction(action)}
                  className="premium-button-secondary rounded-[1.1rem] px-4 py-4 text-sm font-semibold"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>

          <div className="premium-card gold-border rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-8 lg:p-9">
            <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
              <div>
                <label className="mb-3 block text-sm font-semibold text-slate-200">
                  Your question
                </label>
                <textarea
                  className="min-h-[150px] rounded-[1.25rem] px-4 py-4 sm:min-h-[160px] sm:rounded-[1.5rem] sm:px-5"
                  placeholder="Ask a question, paste a concept, or tell AI what you want explained..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-3 block text-sm font-semibold text-slate-200">
                  Optional notes or context
                </label>
                <textarea
                  className="min-h-[140px] rounded-[1.25rem] px-4 py-4 sm:min-h-[150px] sm:rounded-[1.5rem] sm:px-5"
                  placeholder="Paste lecture notes, homework text, topic keywords, or extra context here..."
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  type="submit"
                  disabled={!canSubmit || loading}
                  className="premium-button rounded-[1.1rem] px-6 py-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Thinking..." : "Ask AI Tutor"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setQuestion("");
                    setContext("");
                    setAnswer("");
                  }}
                  className="premium-button-secondary rounded-[1.1rem] px-6 py-3.5 text-sm font-semibold"
                >
                  Clear
                </button>
              </div>
            </form>

            <div className="mt-8">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h4 className="text-sm font-bold uppercase tracking-[0.16em] gold-accent">
                  Response
                </h4>
                <div className="gold-chip">AI output</div>
              </div>

              <div className="stat-card rounded-[1.5rem] p-4 sm:rounded-[1.8rem] sm:p-6">
                {answer ? (
                  <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-100">
                    {answer}
                  </pre>
                ) : (
                  <div className="empty-state">
                    Your answer will appear here after you ask a question.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="content-grid">
          <div className="premium-card gold-border rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-6">
            <div className="gold-chip mb-4">Try these</div>
            <h3 className="panel-title text-white">Starter prompts</h3>

            <div className="mt-6 space-y-3">
              {demoPrompts.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => applyDemoPrompt(item)}
                  className="w-full rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-left text-sm font-medium text-slate-200 transition hover:bg-white/[0.05]"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="premium-card gold-border rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-6">
            <div className="gold-chip mb-4">Recent prompts</div>
            <h3 className="panel-title text-white">Your latest questions</h3>

            <div className="mt-6 space-y-3">
              {history.length === 0 ? (
                <div className="empty-state">No AI history yet.</div>
              ) : (
                history.map((item, index) => (
                  <div
                    key={`${item}-${index}`}
                    className="rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-200"
                  >
                    {item}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="gold-card rounded-[1.7rem] p-5 sm:rounded-[2rem] sm:p-6">
            <div className="gold-chip mb-4">Smart tip</div>
            <h3 className="panel-title text-white">Use better prompts</h3>
            <p className="panel-muted mt-4">
              For stronger answers, include the topic, what confuses you, and
              how simple or deep you want the explanation to be.
            </p>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
