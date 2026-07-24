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
  generateQuizFromContent,
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
type ConfidenceLevel = "guessed" | "unsure" | "confident";
type RetryMode = "incorrect" | "low-confidence" | "slow";

const confidenceLabels: Record<ConfidenceLevel, string> = {
  guessed: "I guessed",
  unsure: "I was unsure",
  confident: "I was confident",
};

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

  return clean.length <= 120 ? clean : `${clean.slice(0, 117)}...`;
}

function shuffleIds(ids: number[]) {
  const shuffled = [...ids];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[randomIndex];
    shuffled[randomIndex] = current;
  }

  return shuffled;
}

function getAdjustedConfidence(
  isCorrect: boolean,
  confidence: ConfidenceLevel,
  seconds: number
) {
  let score = 50;

  if (isCorrect) {
    if (confidence === "confident") score = 95;
    if (confidence === "unsure") score = 75;
    if (confidence === "guessed") score = 60;
  } else {
    if (confidence === "confident") score = 30;
    if (confidence === "unsure") score = 20;
    if (confidence === "guessed") score = 10;
  }

  if (seconds >= 30) score -= 10;
  if (seconds >= 60) score -= 10;

  return Math.max(5, Math.min(100, score));
}

function getHeatmapClass(
  isCorrect: boolean,
  confidence: ConfidenceLevel,
  seconds: number
) {
  if (!isCorrect) return "border-red-500/40 bg-red-500/15 text-red-100";

  if (confidence !== "confident" || seconds >= 30) {
    return "border-yellow-400/40 bg-yellow-400/15 text-yellow-100";
  }

  return "border-green-500/40 bg-green-500/15 text-green-100";
}

function getHeatmapLabel(
  isCorrect: boolean,
  confidence: ConfidenceLevel,
  seconds: number
) {
  if (!isCorrect) return "Weak";
  if (confidence !== "confident" || seconds >= 30) return "Developing";
  return "Strong";
}

export default function QuizzesPage() {
  const ready = useRequireAuth();

  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [quizzes, setQuizzes] = useState<QuizWithQuestions[]>([]);
  const [activeQuizId, setActiveQuizId] = useState<number | null>(null);
  const [questionOrder, setQuestionOrder] = useState<number[]>([]);

  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [optionC, setOptionC] = useState("");
  const [optionD, setOptionD] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState<AnswerLetter>("A");
  const [explanation, setExplanation] = useState("");

  const [answers, setAnswers] = useState<Record<number, AnswerLetter>>({});
  const [confidenceByQuestion, setConfidenceByQuestion] = useState<Record<number, ConfidenceLevel>>({});
  const [timeByQuestion, setTimeByQuestion] = useState<Record<number, number>>({});
  const [lastAnswerAt, setLastAnswerAt] = useState(0);

  const [submitted, setSubmitted] = useState(false);
  const [attemptSavedMessage, setAttemptSavedMessage] = useState("");

  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generatingMore, setGeneratingMore] = useState(false);
  const [error, setError] = useState("");

  function resetAttemptState() {
    setAnswers({});
    setConfidenceByQuestion({});
    setTimeByQuestion({});
    setSubmitted(false);
    setAttemptSavedMessage("");
    setLastAnswerAt(Date.now());
  }

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
        resetAttemptState();
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!activeQuiz) {
        setQuestionOrder([]);
        return;
      }

      setQuestionOrder(
        activeQuiz.questions.map((item) => item.id),
      );
      resetAttemptState();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeQuiz]);

  const orderedQuestions = useMemo(() => {
    if (!activeQuiz) return [];

    const byId = new Map(activeQuiz.questions.map((item) => [item.id, item]));

    return questionOrder
      .map((id) => byId.get(id))
      .filter((item): item is QuizQuestionResult => Boolean(item));
  }, [activeQuiz, questionOrder]);

  const totalQuestions = orderedQuestions.length;

  const score = useMemo(() => {
    return orderedQuestions.reduce((sum, item) => {
      return sum + (answers[item.id] === normalizeCorrectAnswer(item.correct_answer) ? 1 : 0);
    }, 0);
  }, [orderedQuestions, answers]);

  const answeredCount = orderedQuestions.filter((item) => answers[item.id]).length;
  const scorePercent = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

  const weakQuestions = orderedQuestions.filter((item) => {
    const selected = answers[item.id];
    const confidence = confidenceByQuestion[item.id] || "unsure";
    const seconds = timeByQuestion[item.id] || 0;

    return (
      selected !== normalizeCorrectAnswer(item.correct_answer) ||
      confidence !== "confident" ||
      seconds >= 30
    );
  });

  const strongCount = orderedQuestions.filter((item) => {
    const selected = answers[item.id];
    const confidence = confidenceByQuestion[item.id] || "unsure";
    const seconds = timeByQuestion[item.id] || 0;

    return (
      selected === normalizeCorrectAnswer(item.correct_answer) &&
      confidence === "confident" &&
      seconds < 30
    );
  }).length;

  const developingCount = orderedQuestions.filter((item) => {
    const selected = answers[item.id];
    const confidence = confidenceByQuestion[item.id] || "unsure";
    const seconds = timeByQuestion[item.id] || 0;
    const isCorrect = selected === normalizeCorrectAnswer(item.correct_answer);

    return isCorrect && (confidence !== "confident" || seconds >= 30);
  }).length;

  function resetQuizRunner(nextQuizId?: number) {
    const nextQuiz =
      typeof nextQuizId === "number"
        ? quizzes.find((quiz) => quiz.id === nextQuizId)
        : activeQuiz;

    if (typeof nextQuizId === "number") {
      setActiveQuizId(nextQuizId);
    }

    if (nextQuiz) {
      setQuestionOrder(nextQuiz.questions.map((item) => item.id));
    }

    resetAttemptState();
    setError("");
  }

  function handleAnswer(questionId: number, answer: AnswerLetter) {
    if (submitted) return;

    setAnswers((current) => ({
      ...current,
      [questionId]: answer,
    }));

    setTimeByQuestion((current) => {
      if (current[questionId]) return current;

      const now = Date.now();
      const seconds = Math.max(1, Math.round((now - lastAnswerAt) / 1000));
      setLastAnswerAt(now);

      return {
        ...current,
        [questionId]: seconds,
      };
    });

    setConfidenceByQuestion((current) => ({
      ...current,
      [questionId]: current[questionId] || "unsure",
    }));
  }

  function handleConfidence(questionId: number, confidence: ConfidenceLevel) {
    if (submitted) return;

    setConfidenceByQuestion((current) => ({
      ...current,
      [questionId]: confidence,
    }));
  }

  function shuffleQuestions() {
    if (!activeQuiz || questionOrder.length < 2) return;

    setQuestionOrder(shuffleIds(questionOrder));
    resetAttemptState();
    setAttemptSavedMessage("Questions shuffled. Score reset for a fresh attempt.");
  }

  function startSmartRetry(mode: RetryMode) {
    const ids = orderedQuestions
      .filter((item) => {
        const selected = answers[item.id];
        const confidence = confidenceByQuestion[item.id] || "unsure";
        const seconds = timeByQuestion[item.id] || 0;
        const isCorrect = selected === normalizeCorrectAnswer(item.correct_answer);

        if (mode === "incorrect") return !isCorrect;
        if (mode === "low-confidence") return confidence !== "confident";
        return seconds >= 30;
      })
      .map((item) => item.id);

    if (ids.length === 0) {
      setAttemptSavedMessage("No questions found for that retry mode.");
      return;
    }

    setQuestionOrder(ids);
    resetAttemptState();
    setAttemptSavedMessage(`Smart retry started with ${ids.length} question${ids.length === 1 ? "" : "s"}.`);
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

      setQuizzes((current) => [
        newQuiz,
        ...current.filter((quiz) => quiz.id !== newQuiz.id),
      ]);
      setActiveQuizId(newQuiz.id);
      setQuestionOrder(newQuiz.questions.map((item) => item.id));
      resetAttemptState();

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
    if (!window.confirm("Delete this quiz and its questions?")) return;

    try {
      setDeletingId(quizId);
      setError("");

      await deleteQuiz(quizId);

      setQuizzes((current) => {
        const next = current.filter((quiz) => quiz.id !== quizId);

        if (activeQuizId === quizId) {
          setActiveQuizId(next.length > 0 ? next[0].id : null);
          setQuestionOrder(next.length > 0 ? next[0].questions.map((item) => item.id) : []);
          resetAttemptState();
        }

        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete quiz.");
    } finally {
      setDeletingId(null);
    }
  }

  function getActiveStudyRoomId() {
    const roomId = activeQuiz?.study_room_id ?? selectedRoomId;

    if (typeof roomId !== "number" || Number.isNaN(roomId)) {
      return null;
    }

    return roomId;
  }

  function cleanPracticeTitle(value: string) {
    return value
      .replace(/^(AI Retry Practice:\s*)+/i, "")
      .replace(/^(More Practice:\s*)+/i, "")
      .trim() || "Quiz";
  }

  async function handleSubmitQuiz() {
    if (!activeQuiz || orderedQuestions.length === 0 || submitted) return;

    const activeStudyRoomId = getActiveStudyRoomId();

    if (activeStudyRoomId === null) {
      setError("Select a study room first.");
      return;
    }

    const questionResults = orderedQuestions.map((item) => {
      const selectedAnswer = answers[item.id];
      const correctAnswerForItem = normalizeCorrectAnswer(item.correct_answer);
      const isCorrect = selectedAnswer === correctAnswerForItem;
      const confidenceLevel = confidenceByQuestion[item.id] || "unsure";
      const seconds = timeByQuestion[item.id] || 0;
      const result = isCorrect ? "correct" : "wrong";
      const confidence = getAdjustedConfidence(isCorrect, confidenceLevel, seconds);

      return {
        item,
        result,
        confidence,
      };
    });

    const correctCount = questionResults.filter((item) => item.result === "correct").length;
    const percent = Math.round((correctCount / orderedQuestions.length) * 100);
    const quizResult = percent >= 80 ? "correct" : percent >= 50 ? "partial" : "wrong";

    try {
      setSubmitting(true);
      setError("");
      setAttemptSavedMessage("");

      await Promise.all([
        createLearningEvent({
          study_room_id: activeStudyRoomId,
          activity_type: "quiz",
          reference_id: activeQuiz.id,
          result: quizResult,
          confidence: percent,
        }),
        ...questionResults.map(({ item, result, confidence }) =>
          createLearningEvent({
            study_room_id: activeStudyRoomId,
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

      setSubmitted(true);
      setAttemptSavedMessage(
        `Saved automatically: ${orderedQuestions.length} question results updated Brain memory.`
      );
    } catch (err) {
      setSubmitted(false);
      setAttemptSavedMessage("");
      setError(
        err instanceof Error
          ? `${err.message}. Please log in again if this continues.`
          : "Failed to record quiz result."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMorePractice() {
    if (!activeQuiz || orderedQuestions.length === 0) return;

    const activeStudyRoomId = getActiveStudyRoomId();

    if (activeStudyRoomId === null) {
      setError("Select a study room first.");
      return;
    }

    const sourceQuestions = weakQuestions.length > 0 ? weakQuestions : orderedQuestions;
    const baseTitle = cleanPracticeTitle(activeQuiz.title);

    const practiceContent = sourceQuestions
      .slice(0, 5)
      .map((item, index) => {
        const selected = answers[item.id] || "Not answered";
        const correct = normalizeCorrectAnswer(item.correct_answer);
        const correctOption = getQuestionOptions(item).find(
          (option) => option.letter === correct
        );
        const confidence = confidenceByQuestion[item.id] || "unsure";
        const seconds = timeByQuestion[item.id] || 0;

        return [
          `Weak study point ${index + 1}:`,
          `Original question: ${item.question}`,
          `Correct answer: ${correct}. ${correctOption?.text || ""}`,
          `Student selected: ${selected}`,
          `Student confidence: ${confidenceLabels[confidence]}`,
          `Time spent: ${seconds}s`,
          `Explanation: ${item.explanation || "No explanation was provided."}`,
          "",
          "Create a NEW related exam-style multiple-choice question that tests the same concept.",
          "Do not copy the original question wording.",
          "Do not use generic options like unrelated, not important, or outside school.",
          "Use realistic answer choices.",
          "Make the question useful for studying.",
        ].join("\n");
      })
      .join("\n\n");

    try {
      setGeneratingMore(true);
      setError("");
      setAttemptSavedMessage("AI is creating better related practice questions...");

      const newQuiz = (await generateQuizFromContent(
        activeStudyRoomId,
        `AI Retry Practice: ${baseTitle}`,
        practiceContent
      )) as QuizWithQuestions;

      const normalizedQuiz: QuizWithQuestions = {
        ...newQuiz,
        study_room_id: newQuiz.study_room_id ?? activeStudyRoomId,
      };

      setQuizzes((current) => [
        normalizedQuiz,
        ...current.filter((quiz) => quiz.id !== normalizedQuiz.id),
      ]);
      setActiveQuizId(normalizedQuiz.id);
      setQuestionOrder(
        normalizedQuiz.questions.map((item: QuizQuestionResult) => item.id)
      );
      resetAttemptState();
      setAttemptSavedMessage("AI created a new related practice quiz from your weak areas.");
    } catch (err) {
      setAttemptSavedMessage("");
      setError(
        err instanceof Error
          ? `${err.message}. Please log in again if this continues.`
          : "Failed to create AI practice quiz."
      );
    } finally {
      setGeneratingMore(false);
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
      subtitle="Adaptive quiz practice with confidence, timing, smart retry, and Brain memory"
    >
      <div className="quiz-page min-w-0 max-w-full overflow-x-clip">
      <ConnectedProjectBanner
        toolName="Quizzes"
        toolIcon="🧾"
        description="Your quiz answers, confidence, speed, weak areas, and strong areas now update StudySnap Brain automatically."
      />

      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2.5 sm:mb-6 sm:gap-4 md:grid-cols-4">
        <div className="studysnap-glass-panel min-w-0 rounded-[1.35rem] p-3.5 sm:p-5">
          <p className="text-sm text-white/50">Quizzes</p>
          <p className="mt-2 text-3xl font-bold text-white">{quizzes.length}</p>
        </div>

        <div className="studysnap-glass-panel min-w-0 rounded-[1.35rem] p-3.5 sm:p-5">
          <p className="text-sm text-white/50">Current Room</p>
          <p className="mt-2 text-xl font-bold text-cyan-300">
            {selectedRoom ? selectedRoom.name : "No room selected"}
          </p>
        </div>

        <div className="studysnap-glass-panel min-w-0 rounded-[1.35rem] p-3.5 sm:p-5">
          <p className="text-sm text-white/50">Current Score</p>
          <p className="mt-2 text-3xl font-bold text-white">
            {submitted ? `${scorePercent}%` : "—"}
          </p>
          <p className="mt-1 text-sm text-white/50">
            {submitted
              ? `${score} / ${totalQuestions} correct`
              : `${answeredCount} / ${totalQuestions} answered`}
          </p>
        </div>

        <div className="studysnap-glass-panel min-w-0 rounded-[1.35rem] p-3.5 sm:p-5">
          <p className="text-sm text-white/50">Heatmap</p>
          <p className="mt-2 text-sm font-bold text-green-300">
            {submitted ? `${strongCount} strong` : "Submit to view"}
          </p>
          <p className="mt-1 text-sm font-bold text-yellow-200">
            {submitted ? `${developingCount} developing` : ""}
          </p>
          <p className="mt-1 text-sm font-bold text-red-300">
            {submitted ? `${weakQuestions.length} review` : ""}
          </p>
        </div>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      ) : null}

      {attemptSavedMessage ? (
        <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">
          {attemptSavedMessage}
        </div>
      ) : null}

      <div className="grid min-w-0 max-w-full gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="studysnap-glass-panel min-w-0 max-w-full rounded-[1.5rem] p-4 sm:p-6">
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

        <div className="min-w-0 max-w-full space-y-4 sm:space-y-6 lg:col-span-2">
          <div className="studysnap-glass-panel min-w-0 max-w-full rounded-[1.5rem] p-4 sm:p-6">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="break-words text-xl font-semibold text-cyan-200">
                  Smart Quiz Runner
                </h3>
                <p className="mt-1 text-sm text-white/50">
                  Submit once. StudySnap saves answer, confidence, timing, and mastery signals.
                </p>
              </div>

              <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap sm:gap-3">
                <button
                  type="button"
                  onClick={() => resetQuizRunner()}
                  className="w-full rounded-xl border border-white/15 bg-white/[0.035] px-3 py-2.5 text-sm font-semibold text-white backdrop-blur-xl transition hover:bg-white/[0.08] sm:w-auto sm:px-4"
                >
                  Reset Score
                </button>

                <button
                  type="button"
                  onClick={shuffleQuestions}
                  disabled={!activeQuiz || totalQuestions < 2}
                  className="w-full rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2.5 text-sm font-semibold text-yellow-100 transition hover:bg-yellow-300/20 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-4"
                >
                  Shuffle
                </button>

                <button
                  type="button"
                  onClick={handleMorePractice}
                  disabled={!activeQuiz || generatingMore}
                  className="w-full rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-4"
                >
                  {generatingMore ? "Creating..." : "More Practice"}
                </button>

                <button
                  type="button"
                  onClick={handleSubmitQuiz}
                  disabled={!activeQuiz || totalQuestions === 0 || submitting || submitted}
                  className="w-full rounded-xl bg-[#c9ad50] px-3 py-2.5 text-sm font-black text-[#111317] transition hover:bg-[#d5bb63] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-4"
                >
                  {submitted ? "Saved" : submitting ? "Saving..." : "Submit Quiz"}
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
                    quizzes.map((quiz, index) => (
                      <option key={`${quiz.id}-${index}`} value={quiz.id}>
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
                  Strong: {strongCount} · Developing: {developingCount} · Needs review: {weakQuestions.length}
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => startSmartRetry("incorrect")}
                    className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-2 text-sm font-bold text-red-100"
                  >
                    Retry incorrect
                  </button>

                  <button
                    type="button"
                    onClick={() => startSmartRetry("low-confidence")}
                    className="rounded-xl border border-yellow-400/25 bg-yellow-400/10 px-4 py-2 text-sm font-bold text-yellow-100"
                  >
                    Retry low confidence
                  </button>

                  <button
                    type="button"
                    onClick={() => startSmartRetry("slow")}
                    className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-100"
                  >
                    Retry slow
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-5 min-w-0 max-w-full rounded-[1.35rem] border border-white/[0.08] bg-black/35 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] backdrop-blur-xl sm:mt-6 sm:p-6">
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
                    <h4 className="mt-1 break-words text-xl font-bold text-white sm:text-2xl">
                      {activeQuiz.title}
                    </h4>
                  </div>

                  {submitted ? (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                      {orderedQuestions.map((item, index) => {
                        const selected = answers[item.id];
                        const confidence = confidenceByQuestion[item.id] || "unsure";
                        const seconds = timeByQuestion[item.id] || 0;
                        const isCorrect = selected === normalizeCorrectAnswer(item.correct_answer);

                        return (
                          <div
                            key={item.id}
                            className={`rounded-xl border px-3 py-2 text-xs font-bold ${getHeatmapClass(
                              isCorrect,
                              confidence,
                              seconds
                            )}`}
                          >
                            Q{index + 1}: {getHeatmapLabel(isCorrect, confidence, seconds)}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {orderedQuestions.map((item, index) => {
                    const selected = answers[item.id];
                    const confidence = confidenceByQuestion[item.id] || "unsure";
                    const seconds = timeByQuestion[item.id] || 0;
                    const correctAnswerForItem = normalizeCorrectAnswer(item.correct_answer);
                    const isQuestionCorrect = selected === correctAnswerForItem;
                    const correctOption = getQuestionOptions(item).find(
                      (option) => option.letter === correctAnswerForItem
                    );

                    return (
                      <div
                        key={item.id}
                        className="min-w-0 max-w-full rounded-[1.35rem] border border-white/[0.09] bg-white/[0.045] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-xl sm:p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <h5 className="min-w-0 flex-1 break-words text-base font-semibold leading-6 text-cyan-200 sm:text-lg">
                            {index + 1}. {item.question}
                          </h5>

                          {submitted ? (
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-bold ${getHeatmapClass(
                                isQuestionCorrect,
                                confidence,
                                seconds
                              )}`}
                            >
                              {getHeatmapLabel(isQuestionCorrect, confidence, seconds)}
                            </span>
                          ) : null}
                        </div>

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
                                onClick={() => handleAnswer(item.id, option.letter)}
                                className={`min-w-0 max-w-full break-words rounded-xl border px-3 py-3 text-left text-white [overflow-wrap:anywhere] transition sm:px-4 ${
                                  isCorrect
                                    ? "border-green-500 bg-green-500/10"
                                    : isWrong
                                    ? "border-red-500 bg-red-500/10"
                                    : isSelected
                                    ? "border-cyan-400 bg-cyan-400/10"
                                    : "border-white/20 bg-black hover:bg-white/5"
                                } ${submitted ? "cursor-default" : ""}`}
                              >
                                <span className="font-bold text-cyan-300">
                                  {option.letter}.
                                </span>{" "}
                                {option.text}
                              </button>
                            );
                          })}
                        </div>

                        {!submitted ? (
                          <div className="mt-4 grid gap-2 sm:grid-cols-3">
                            {(["guessed", "unsure", "confident"] as ConfidenceLevel[]).map((level) => (
                              <button
                                key={level}
                                type="button"
                                onClick={() => handleConfidence(item.id, level)}
                                className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
                                  confidence === level
                                    ? "border-yellow-300 bg-yellow-300/15 text-yellow-100"
                                    : "border-white/10 bg-black/30 text-slate-300 hover:bg-white/5"
                                }`}
                              >
                                {confidenceLabels[level]}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        {submitted ? (
                          <div
                            className={`mt-4 rounded-xl border p-4 ${
                              isQuestionCorrect
                                ? "border-green-500/25 bg-green-500/10"
                                : "border-red-500/25 bg-red-500/10"
                            }`}
                          >
                            <p className="text-sm font-bold text-white">
                              {isQuestionCorrect ? "Correct" : "Needs review"}
                            </p>

                            <p className="mt-2 break-words text-sm leading-6 text-white/70 [overflow-wrap:anywhere]">
                              Your answer:{" "}
                              <span className="font-bold text-white">
                                {selected || "Not answered"}
                              </span>
                              {" · "}
                              Correct answer:{" "}
                              <span className="font-bold text-green-300">
                                {correctAnswerForItem}
                                {correctOption ? ` — ${correctOption.text}` : ""}
                              </span>
                            </p>

                            <p className="mt-2 break-words text-sm leading-6 text-white/60">
                              Confidence: {confidenceLabels[confidence]} · Time: {seconds || 0}s
                            </p>

                            {!isQuestionCorrect ? (
                              <p className="mt-3 text-sm leading-6 text-red-100">
                                Why you missed this: your selected answer did not match the correct concept. Review the explanation, then use Smart Retry or More Practice.
                              </p>
                            ) : null}

                            {item.explanation ? (
                              <p className="mt-3 text-sm leading-6 text-white/70">
                                {item.explanation}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="studysnap-glass-panel min-w-0 max-w-full rounded-[1.5rem] p-4 sm:p-6">
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
                {quizzes.map((quiz, index) => (
                  <div
                    key={`${quiz.id}-${index}`}
                    className="min-w-0 max-w-full rounded-[1.35rem] border border-white/[0.08] bg-black/30 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] backdrop-blur-xl sm:p-5"
                  >
                    <h4 className="line-clamp-2 break-words text-base font-semibold text-cyan-200">
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
      </div>
    </AppShell>
  );
}
