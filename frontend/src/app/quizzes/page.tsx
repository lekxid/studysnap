"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import { loadJSON, saveJSON } from "@/lib/storage";

type QuizQuestion = {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
};

const STORAGE_KEY = "studysnap_quiz_questions";

export default function QuizzesPage() {
  const ready = useRequireAuth();

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [q, setQ] = useState("");
  const [o1, setO1] = useState("");
  const [o2, setO2] = useState("");
  const [o3, setO3] = useState("");
  const [o4, setO4] = useState("");
  const [correctIndex, setCorrectIndex] = useState("0");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    setQuestions(loadJSON<QuizQuestion[]>(STORAGE_KEY, []));
  }, [ready]);

  function persist(next: QuizQuestion[]) {
    setQuestions(next);
    saveJSON(STORAGE_KEY, next);
  }

  function addQuestion() {
    if (!q.trim() || !o1.trim() || !o2.trim() || !o3.trim() || !o4.trim()) {
      setError("Fill all quiz fields.");
      return;
    }

    setError("");

    const newQuestion: QuizQuestion = {
      id: Date.now(),
      question: q.trim(),
      options: [o1.trim(), o2.trim(), o3.trim(), o4.trim()],
      correctIndex: Number(correctIndex),
    };

    persist([newQuestion, ...questions]);
    setQ("");
    setO1("");
    setO2("");
    setO3("");
    setO4("");
    setCorrectIndex("0");
  }

  function removeQuestion(id: number) {
    const next = questions.filter((item) => item.id !== id);
    persist(next);

    const nextAnswers = { ...answers };
    delete nextAnswers[id];
    setAnswers(nextAnswers);
  }

  const score = useMemo(() => {
    return questions.reduce((sum, item) => {
      return sum + (answers[item.id] === item.correctIndex ? 1 : 0);
    }, 0);
  }, [answers, questions]);

  if (!ready) {
    return <div className="min-h-screen bg-black text-white p-6">Checking authentication...</div>;
  }

  return (
    <AppShell title="Quizzes" subtitle="Build quick quizzes, answer them, and score yourself">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-xl font-semibold text-cyan-300">Create Quiz Question</h3>

          <div className="mt-4 space-y-4">
            <textarea
              className="min-h-[100px] w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30"
              placeholder="Question"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <input className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none" placeholder="Option 1" value={o1} onChange={(e) => setO1(e.target.value)} />
            <input className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none" placeholder="Option 2" value={o2} onChange={(e) => setO2(e.target.value)} />
            <input className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none" placeholder="Option 3" value={o3} onChange={(e) => setO3(e.target.value)} />
            <input className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none" placeholder="Option 4" value={o4} onChange={(e) => setO4(e.target.value)} />

            <select
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none"
              value={correctIndex}
              onChange={(e) => setCorrectIndex(e.target.value)}
            >
              <option value="0">Correct answer: Option 1</option>
              <option value="1">Correct answer: Option 2</option>
              <option value="2">Correct answer: Option 3</option>
              <option value="3">Correct answer: Option 4</option>
            </select>

            <button
              onClick={addQuestion}
              className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-black"
            >
              Save Question
            </button>

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-cyan-300">Quiz Runner</h3>
            <div className="flex gap-3">
              <button
                onClick={() => setSubmitted(true)}
                className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-black"
                disabled={questions.length === 0}
              >
                Submit Quiz
              </button>
              <button
                onClick={() => {
                  setAnswers({});
                  setSubmitted(false);
                }}
                className="rounded-xl border border-white/20 px-4 py-2 font-semibold text-white"
              >
                Reset
              </button>
            </div>
          </div>

          {submitted ? (
            <div className="mt-6 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-5 text-white">
              Score: {score} / {questions.length}
            </div>
          ) : null}

          {questions.length === 0 ? (
            <div className="mt-6 rounded-xl bg-white/5 p-6 text-white/70">
              No quiz questions yet.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {questions.map((item, index) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-black p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h4 className="text-lg font-semibold text-cyan-300">
                      {index + 1}. {item.question}
                    </h4>
                    <button
                      onClick={() => removeQuestion(item.id)}
                      className="rounded-xl border border-red-500/30 px-3 py-2 text-sm font-semibold text-red-300"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {item.options.map((option, optionIndex) => {
                      const selected = answers[item.id] === optionIndex;
                      const correct = submitted && item.correctIndex === optionIndex;
                      const wrong = submitted && selected && item.correctIndex !== optionIndex;

                      return (
                        <button
                          key={optionIndex}
                          onClick={() =>
                            setAnswers((prev) => ({ ...prev, [item.id]: optionIndex }))
                          }
                          className={`rounded-xl border px-4 py-3 text-left text-white ${
                            correct
                              ? "border-green-500 bg-green-500/10"
                              : wrong
                              ? "border-red-500 bg-red-500/10"
                              : selected
                              ? "border-cyan-400 bg-cyan-400/10"
                              : "border-white/20 bg-white/5"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
