"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import ConnectedProjectBanner from "@/features/projects/ConnectedProjectBanner";
import {
  ensureProjectRoomIdInUrl,
  getActiveProjectRoomId,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";
import useRequireAuth from "@/hooks/useRequireAuth";
import {
  createLearningEvent,
  createQuiz,
  deleteQuiz,
  getQuizzes,
  getStudyRooms,
  type QuizQuestionInput,
  type QuizQuestionResult,
  type QuizWithQuestions,
} from "@/lib/api";

type StudyRoom = {
  id: number;
  name: string;
  subject: string;
  description?: string;
};

type AnswerLetter = "A" | "B" | "C" | "D";

const ANSWER_LETTERS: AnswerLetter[] = ["A", "B", "C", "D"];

function getQuestionOptions(question: QuizQuestionResult) {
  return [
    { letter: "A" as const, text: question.option_a },
    { letter: "B" as const, text: question.option_b },
    { letter: "C" as const, text: question.option_c },
    { letter: "D" as const, text: question.option_d },
  ];
}

function normalizeCorrectAnswer(value: string): AnswerLetter {
  const answer = value.trim().toUpperCase();

  if (answer === "B" || answer === "C" || answer === "D") {
    return answer;
  }

  return "A";
}

function buildQuizConceptId(questionId: number, questionText: string) {
  const slug = questionText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);

  return `quiz-question-${questionId}-${slug || "concept"}`;
}

function buildQuizConceptName(questionText: string) {
  const clean = questionText.replace(/\s+/g, " ").trim();

  if (clean.length <= 120) {
    return clean;
  }

  return `${clean.slice(0, 117)}...`;
}

export default function QuizzesPage() {
  const ready = useRequireAuth();

  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [quizzes, setQuizzes] = useState<QuizWithQuestions[]>([]);
  const [activeQuizId, setActiveQuizId] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [optionC, setOptionC] = useState("");
  const [optionD, setOptionD] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState<AnswerLetter>("A");
  const [explanation, setExplanation] = useState("");

  const [answers, setAnswers] = useState<Record<number, AnswerLetter>>({});
  const [submitted, setSubmitted] = useState(false);

  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;

    async function loadRooms() {
      try {
        setLoadingRooms(true);
        setError("");

        const data = await getStudyRooms();
        const roomList: StudyRoom[] = Array.isArray(data) ? data : [];

        setRooms(roomList);

        const requestedRoomId = getActiveProjectRoomId();
        const matchingRoom =
          requestedRoomId !== null
            ? roomList.find((room) => room.id === requestedRoomId)
            : null;

        if (matchingRoom) {
          saveProjectRoomId(matchingRoom.id);
          ensureProjectRoomIdInUrl(matchingRoom.id);
          setSelectedRoomId(matchingRoom.id);
        } else if (roomList.length > 0) {
          setSelectedRoomId(roomList[0].id);
        } else {
          setSelectedRoomId(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load study rooms.");
      } finally {
        setLoadingRooms(false);
      }
    }

    loadRooms();
  }, [ready]);

  useEffect(() => {
    if (!ready || selectedRoomId === null) return;

    const roomId = selectedRoomId;

    async function loadQuizzes() {
      try {
        setLoadingQuizzes(true);
        setError("");

        const data = await getQuizzes(roomId);
        const quizList = Array.isArray(data) ? data : [];

        setQuizzes(quizList);
        setActiveQuizId(quizList.length > 0 ? quizList[0].id : null);
        setAnswers({});
        setSubmitted(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load quizzes.");
      } finally {
        setLoadingQuizzes(false);
      }
    }

    loadQuizzes();
  }, [ready, selectedRoomId]);

  const selectedRoom = useMemo(() => {
    return rooms.find((room) => room.id === selectedRoomId) || null;
  }, [rooms, selectedRoomId]);

  const activeQuiz = useMemo(() => {
    return quizzes.find((quiz) => quiz.id === activeQuizId) || null;
  }, [quizzes, activeQuizId]);

  const totalQuestions = activeQuiz?.questions.length ?? 0;

  const score = useMemo(() => {
    if (!activeQuiz) return 0;

    return activeQuiz.questions.reduce((sum, item) => {
      return sum + (answers[item.id] === normalizeCorrectAnswer(item.correct_answer) ? 1 : 0);
    }, 0);
  }, [activeQuiz, answers]);

  const scorePercent = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

  function resetQuizRunner(nextQuizId?: number) {
    if (typeof nextQuizId === "number") {
      setActiveQuizId(nextQuizId);
    }

    setAnswers({});
    setSubmitted(false);
  }

  async function handleCreateQuiz() {
    if (selectedRoomId === null) {
      setError("Create or select a study room first.");
      return;
    }

    if (
      !title.trim() ||
      !question.trim() ||
      !optionA.trim() ||
      !optionB.trim() ||
      !optionC.trim() ||
      !optionD.trim()
    ) {
      setError("Fill the quiz title, question, and all four answer options.");
      return;
    }

    const payload: QuizQuestionInput = {
      question: question.trim(),
      option_a: optionA.trim(),
      option_b: optionB.trim(),
      option_c: optionC.trim(),
      option_d: optionD.trim(),
      correct_answer: correctAnswer,
      explanation: explanation.trim() || null,
    };

    try {
      setSaving(true);
      setError("");

      const newQuiz = await createQuiz(selectedRoomId, title.trim(), [payload]);

      setQuizzes((current) => [newQuiz, ...current]);
      setActiveQuizId(newQuiz.id);
      setAnswers({});
      setSubmitted(false);

      setTitle("");
      setQuestion("");
      setOptionA("");
      setOptionB("");
      setOptionC("");
      setOptionD("");
      setCorrectAnswer("A");
      setExplanation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save quiz.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteQuiz(quizId: number) {
    const confirmed = window.confirm("Delete this quiz and its questions? This cannot be undone.");

    if (!confirmed) return;

    try {
      setDeletingId(quizId);
      setError("");

      await deleteQuiz(quizId);

      setQuizzes((current) => {
        const next = current.filter((quiz) => quiz.id !== quizId);

        if (activeQuizId === quizId) {
          setActiveQuizId(next.length > 0 ? next[0].id : null);
          setAnswers({});
          setSubmitted(false);
        }

        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete quiz.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSubmitQuiz() {
    if (!activeQuiz || activeQuiz.questions.length === 0) return;

    const questionResults = activeQuiz.questions.map((item) => {
      const selectedAnswer = answers[item.id];
      const correctAnswerForItem = normalizeCorrectAnswer(item.correct_answer);
      const isCorrect = selectedAnswer === correctAnswerForItem;
      const result = isCorrect ? "correct" : "wrong";
      const confidence = isCorrect ? 95 : selectedAnswer ? 25 : 10;

      return {
        item,
        result,
        confidence,
      };
    });

    const correctCount = questionResults.filter((item) => item.result === "correct").length;
    const percent = Math.round((correctCount / activeQuiz.questions.length) * 100);
    const quizResult = percent >= 80 ? "correct" : percent >= 50 ? "partial" : "wrong";

    try {
      setSubmitting(true);
      setError("");
      setSubmitted(true);

      await Promise.all([
        createLearningEvent({
          study_room_id: activeQuiz.study_room_id,
          activity_type: "quiz",
          reference_id: activeQuiz.id,
          result: quizResult,
          confidence: percent,
        }),
        ...questionResults.map(({ item, result, confidence }) =>
          createLearningEvent({
            study_room_id: activeQuiz.study_room_id,
            activity_type: "quiz_question",
            reference_id: item.id,
            result,
            confidence,
            concept_id: buildQuizConceptId(item.id, item.question),
            concept_name: buildQuizConceptName(item.question),
            concept_type: "quiz_question",
            source: `quiz:${activeQuiz.id}`,
          })
        ),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record quiz result.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-black p-6 text-white">
        Checking authentication...
      </div>
    );
  }

  return (
    <AppShell
      title="Quizzes"
      subtitle="Take project-based quizzes generated from your notes, PDFs, and Smart Organizer uploads"
    >
      <ConnectedProjectBanner
        toolName="Quizzes"
        toolIcon="🧾"
        description="Your quizzes are connected to this project, so StudySnap can use quiz results to improve your learning insights and weak concept tracking."
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-5">
          <p className="text-sm text-white/50">Quizzes</p>
          <p className="mt-2 text-3xl font-bold text-white">{quizzes.length}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-5">
          <p className="text-sm text-white/50">Current Room</p>
          <p className="mt-2 text-xl font-bold text-cyan-300">
            {selectedRoom ? selectedRoom.name : "No room selected"}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-5">
          <p className="text-sm text-white/50">Current Score</p>
          <p className="mt-2 text-3xl font-bold text-white">
            {submitted ? `${scorePercent}%` : "—"}
          </p>
          <p className="mt-1 text-sm text-white/50">
            {submitted ? `${score} / ${totalQuestions} correct` : "Submit a quiz to record progress"}
          </p>
        </div>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-xl font-semibold text-cyan-300">
            Create Quick Quiz
          </h3>

          <p className="mt-2 text-sm text-white/50">
            Save a manual quiz into the selected study room.
          </p>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Study Room
              </span>

              <select
                className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                value={selectedRoomId ?? ""}
                onChange={(event) => {
                  const nextRoomId = Number(event.target.value);
                  setSelectedRoomId(nextRoomId);
                  saveProjectRoomId(nextRoomId);
                  ensureProjectRoomIdInUrl(nextRoomId);
                }}
                disabled={loadingRooms || rooms.length === 0}
              >
                {rooms.length === 0 ? (
                  <option value="">No study rooms found</option>
                ) : (
                  rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} — {room.subject}
                    </option>
                  ))
                )}
              </select>
            </label>

            <input
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-cyan-300"
              placeholder="Quiz title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />

            <textarea
              className="min-h-[100px] w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-cyan-300"
              placeholder="Question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />

            <input
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-cyan-300"
              placeholder="Option A"
              value={optionA}
              onChange={(event) => setOptionA(event.target.value)}
            />

            <input
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-cyan-300"
              placeholder="Option B"
              value={optionB}
              onChange={(event) => setOptionB(event.target.value)}
            />

            <input
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-cyan-300"
              placeholder="Option C"
              value={optionC}
              onChange={(event) => setOptionC(event.target.value)}
            />

            <input
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-cyan-300"
              placeholder="Option D"
              value={optionD}
              onChange={(event) => setOptionD(event.target.value)}
            />

            <select
              className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              value={correctAnswer}
              onChange={(event) => setCorrectAnswer(event.target.value as AnswerLetter)}
            >
              <option value="A">Correct answer: A</option>
              <option value="B">Correct answer: B</option>
              <option value="C">Correct answer: C</option>
              <option value="D">Correct answer: D</option>
            </select>

            <textarea
              className="min-h-[90px] w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-cyan-300"
              placeholder="Explanation optional"
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
            />

            <button
              type="button"
              onClick={handleCreateQuiz}
              disabled={saving || selectedRoomId === null}
              className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Quiz"}
            </button>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-cyan-300">
                  Quiz Runner
                </h3>
                <p className="mt-1 text-sm text-white/50">
                  Choose a saved quiz, answer the questions, then submit to update StudySnap progress.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => resetQuizRunner()}
                  className="rounded-xl border border-white/20 px-4 py-2 font-semibold text-white transition hover:bg-white/5"
                >
                  Reset
                </button>

                <button
                  type="button"
                  onClick={handleSubmitQuiz}
                  disabled={!activeQuiz || totalQuestions === 0 || submitting}
                  className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Recording..." : "Submit Quiz"}
                </button>
              </div>
            </div>

            <div className="mt-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white/70">
                  Saved Quiz
                </span>

                <select
                  className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  value={activeQuizId ?? ""}
                  onChange={(event) => resetQuizRunner(Number(event.target.value))}
                  disabled={loadingQuizzes || quizzes.length === 0}
                >
                  {quizzes.length === 0 ? (
                    <option value="">No quizzes found</option>
                  ) : (
                    quizzes.map((quiz) => (
                      <option key={quiz.id} value={quiz.id}>
                        {quiz.title} · {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            {submitted ? (
              <div className="mt-6 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-5 text-white">
                <p className="text-lg font-bold text-cyan-300">
                  Score: {score} / {totalQuestions} · {scorePercent}%
                </p>
                <p className="mt-1 text-sm text-white/60">
                  StudySnap recorded this quiz attempt for your learning insights.
                </p>
              </div>
            ) : null}

            <div className="mt-6 rounded-2xl border border-white/10 bg-black p-6">
              {loadingQuizzes ? (
                <p className="text-white/70">Loading quizzes...</p>
              ) : !activeQuiz ? (
                <p className="text-white/70">
                  No quizzes yet. Upload material through Smart Organizer or create a quick quiz.
                </p>
              ) : activeQuiz.questions.length === 0 ? (
                <p className="text-white/70">
                  This quiz has no questions yet.
                </p>
              ) : (
                <div className="space-y-5">
                  <div>
                    <p className="text-sm text-white/50">Active Quiz</p>
                    <h4 className="mt-1 text-2xl font-bold text-white">
                      {activeQuiz.title}
                    </h4>
                  </div>

                  {activeQuiz.questions.map((item, index) => {
                    const selected = answers[item.id];
                    const correctAnswerForItem = normalizeCorrectAnswer(item.correct_answer);

                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-white/10 bg-white/5 p-5"
                      >
                        <h5 className="text-lg font-semibold text-cyan-300">
                          {index + 1}. {item.question}
                        </h5>

                        <div className="mt-4 grid gap-3">
                          {getQuestionOptions(item).map((option) => {
                            const isSelected = selected === option.letter;
                            const isCorrect = submitted && correctAnswerForItem === option.letter;
                            const isWrong =
                              submitted && isSelected && correctAnswerForItem !== option.letter;

                            return (
                              <button
                                key={option.letter}
                                type="button"
                                onClick={() =>
                                  setAnswers((current) => ({
                                    ...current,
                                    [item.id]: option.letter,
                                  }))
                                }
                                className={`rounded-xl border px-4 py-3 text-left text-white transition ${
                                  isCorrect
                                    ? "border-green-500 bg-green-500/10"
                                    : isWrong
                                    ? "border-red-500 bg-red-500/10"
                                    : isSelected
                                    ? "border-cyan-400 bg-cyan-400/10"
                                    : "border-white/20 bg-black hover:bg-white/5"
                                }`}
                              >
                                <span className="font-bold text-cyan-300">
                                  {option.letter}.
                                </span>{" "}
                                {option.text}
                              </button>
                            );
                          })}
                        </div>

                        {submitted && item.explanation ? (
                          <div className="mt-4 rounded-xl border border-white/10 bg-black p-4">
                            <p className="text-sm font-semibold text-white/70">
                              Explanation
                            </p>
                            <p className="mt-2 text-sm text-white/70">
                              {item.explanation}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
            <h3 className="text-xl font-semibold text-cyan-300">
              Saved Quizzes
            </h3>

            {loadingQuizzes ? (
              <div className="mt-6 rounded-xl bg-white/5 p-6 text-white/70">
                Loading quizzes...
              </div>
            ) : quizzes.length === 0 ? (
              <div className="mt-6 rounded-xl bg-white/5 p-6 text-white/70">
                No quizzes saved yet.
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {quizzes.map((quiz) => (
                  <div
                    key={quiz.id}
                    className="rounded-2xl border border-white/10 bg-black p-5"
                  >
                    <h4 className="line-clamp-2 text-base font-semibold text-cyan-300">
                      {quiz.title}
                    </h4>

                    <p className="mt-3 text-sm text-white/60">
                      {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => resetQuizRunner(quiz.id)}
                        className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-cyan-300"
                      >
                        Take Quiz
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteQuiz(quiz.id)}
                        disabled={deletingId === quiz.id}
                        className="rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingId === quiz.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
