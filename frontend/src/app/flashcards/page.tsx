"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import ConnectedProjectBanner from "@/features/projects/ConnectedProjectBanner";
import {
  ensureProjectRoomIdInUrl,
  getActiveProjectRoomId,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";
import useRequireAuth from "@/hooks/useRequireAuth";
import {
  createFlashcard,
  createLearningEvent,
  deleteFlashcard,
  getFlashcards,
  getStudyRooms,
} from "@/lib/api";

type StudyRoom = {
  id: number;
  name: string;
  subject: string;
  description?: string;
};

type Card = {
  id: number;
  question: string;
  answer: string;
  study_room_id: number;
  owner_id?: number;
  created_at?: string;
};

export default function FlashcardsPage() {
  const ready = useRequireAuth();

  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionWrong, setSessionWrong] = useState(0);
  const [sessionReviewed, setSessionReviewed] = useState(0);
  const [error, setError] = useState("");
  const reviewSectionRef = useRef<HTMLDivElement | null>(null);

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

    async function loadCards() {
      try {
        setLoadingCards(true);
        setError("");

        const data = await getFlashcards(roomId);
        const cardList: Card[] = Array.isArray(data) ? data : [];

        setCards(cardList);
        setActiveId(cardList.length > 0 ? cardList[0].id : null);
        setShowAnswer(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load flashcards.");
      } finally {
        setLoadingCards(false);
      }
    }

    loadCards();
  }, [ready, selectedRoomId]);

  async function addCard() {
    if (selectedRoomId === null) {
      setError("Create or select a study room first.");
      return;
    }

    if (!question.trim() || !answer.trim()) {
      setError("Enter both question and answer.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const newCard = await createFlashcard(
        selectedRoomId,
        question.trim(),
        answer.trim()
      );

      setCards((current) => [newCard, ...current]);
      setQuestion("");
      setAnswer("");
      setActiveId(newCard.id);
      setShowAnswer(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save flashcard.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCard(id: number) {
    const confirmed = window.confirm("Delete this flashcard? This cannot be undone.");

    if (!confirmed) return;

    try {
      setDeletingId(id);
      setError("");

      await deleteFlashcard(id);

      setCards((current) => {
        const next = current.filter((card) => card.id !== id);

        if (activeId === id) {
          setActiveId(next.length > 0 ? next[0].id : null);
          setShowAnswer(false);
        }

        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete flashcard.");
    } finally {
      setDeletingId(null);
    }
  }

  function goToNextCard() {
    if (cards.length === 0 || activeId === null) return;

    const currentIndex = cards.findIndex((card) => card.id === activeId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % cards.length : 0;

    setActiveId(cards[nextIndex].id);
    setShowAnswer(false);
  }

  async function recordFlashcardReview(result: "correct" | "partial" | "wrong", confidence: number) {
    if (!activeCard) return;

    try {
      setReviewing(true);
      setError("");

      await createLearningEvent({
        study_room_id: activeCard.study_room_id,
        activity_type: "flashcard",
        reference_id: activeCard.id,
        result,
        confidence,
      });

      setSessionReviewed((current) => current + 1);

      if (result === "correct") {
        setSessionCorrect((current) => current + 1);
      } else {
        setSessionWrong((current) => current + 1);
      }

      goToNextCard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record review.");
    } finally {
      setReviewing(false);
    }
  }

  function shuffleCards() {
    const next = [...cards].sort(() => Math.random() - 0.5);
    setCards(next);

    if (next.length > 0) {
      setActiveId(next[0].id);
      setShowAnswer(false);
    }
  }

  const selectedRoom = useMemo(() => {
    return rooms.find((room) => room.id === selectedRoomId) || null;
  }, [rooms, selectedRoomId]);

  const activeCard = cards.find((card) => card.id === activeId) || null;

  if (!ready) {
    return (
      <div className="min-h-screen bg-black p-6 text-white">
        Checking authentication...
      </div>
    );
  }

  return (
    <AppShell
      title="Flashcards"
      subtitle="Review smarter with database-backed flashcards linked to your study rooms"
    >

      <ConnectedProjectBanner
        toolName="Flashcards"
        toolIcon="🧠"
        description="Your flashcards are opened inside this project context, so review progress and weak concepts can connect back to the correct study room."
      />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-5">
          <p className="text-sm text-white/50">Flashcards</p>
          <p className="mt-2 text-3xl font-bold text-white">{cards.length}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-5">
          <p className="text-sm text-white/50">Current Room</p>
          <p className="mt-2 text-xl font-bold text-cyan-300">
            {selectedRoom ? selectedRoom.name : "No room selected"}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-5">
          <p className="text-sm text-white/50">Today Reviewed</p>
          <p className="mt-2 text-3xl font-bold text-white">{sessionReviewed}</p>
          <p className="mt-1 text-sm text-white/50">
            ✅ {sessionCorrect} correct · ❌ {sessionWrong} needs review
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-xl font-semibold text-cyan-300">
            Create Flashcard
          </h3>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Study Room
              </span>

              <select
                className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                value={selectedRoomId ?? ""}
                onChange={(event) => setSelectedRoomId(Number(event.target.value))}
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

            <textarea
              className="min-h-[110px] w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-cyan-300"
              placeholder="Question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />

            <textarea
              className="min-h-[110px] w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-cyan-300"
              placeholder="Answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
            />

            <button
              type="button"
              onClick={addCard}
              disabled={saving || selectedRoomId === null}
              className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Flashcard"}
            </button>

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
  <div
    ref={reviewSectionRef}
    className="rounded-2xl border border-white/10 bg-[#0a1022] p-6"
  >
    <div className="flex flex-wrap items-center justify-between gap-3"></div>
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h3 className="text-xl font-semibold text-cyan-300">Smart Review</h3>
      <p className="mt-1 text-sm text-white/50">
        Answer first, reveal the answer, then tell StudySnap how well you knew it.
      </p>
    </div>

    <button
      type="button"
      onClick={shuffleCards}
      className="rounded-xl border border-white/20 px-4 py-2 font-semibold text-white transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={cards.length < 2}
    >
      Shuffle
    </button>
  </div>

  <div className="mt-6 rounded-2xl border border-white/10 bg-black p-8">
    {loadingCards ? (
      <p className="text-white/70">Loading flashcards...</p>
    ) : !activeCard ? (
      <p className="text-white/70">
        No flashcards yet. Create one or generate flashcards from your notes.
      </p>
    ) : (
      <>
        <p className="text-sm text-white/50">Question</p>

        <p className="mt-4 whitespace-pre-wrap text-2xl font-semibold text-white">
          {activeCard.question}
        </p>

        {!showAnswer ? (
          <button
            type="button"
            onClick={() => setShowAnswer(true)}
            className="mt-6 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-black transition hover:bg-cyan-300"
          >
            Show Answer
          </button>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-white/50">Answer</p>
              <p className="mt-3 whitespace-pre-wrap text-lg font-semibold text-white">
                {activeCard.answer}
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-white/70">
                How well did you know this?
              </p>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => recordFlashcardReview("correct", 90)}
                  disabled={reviewing}
                  className="rounded-xl border border-green-400/30 bg-green-500/10 px-4 py-3 text-sm font-semibold text-green-300 hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  ✅ I knew it
                </button>

                <button
                  type="button"
                  onClick={() => recordFlashcardReview("partial", 60)}
                  disabled={reviewing}
                  className="rounded-xl border border-yellow-400/30 bg-yellow-500/10 px-4 py-3 text-sm font-semibold text-yellow-300 hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  🟡 Almost
                </button>

                <button
                  type="button"
                  onClick={() => recordFlashcardReview("wrong", 25)}
                  disabled={reviewing}
                  className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  ❌ Didn’t know
                </button>
              </div>

              {reviewing ? (
                <p className="mt-3 text-sm text-cyan-300">
                  Recording review...
                </p>
              ) : null}
            </div>
          </div>
        )}
      </>
    )}
  </div>
</div>

<div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
  <h3 className="text-xl font-semibold text-cyan-300">Saved Flashcards</h3>

  {loadingCards ? (
    <div className="mt-6 rounded-xl bg-white/5 p-6 text-white/70">
      Loading flashcards...
    </div>
  ) : cards.length === 0 ? (
    <div className="mt-6 rounded-xl bg-white/5 p-6 text-white/70">
      No flashcards saved yet.
    </div>
  ) : (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {cards.map((card) => (
        <div
          key={card.id}
          className="rounded-2xl border border-white/10 bg-black p-5"
        >
          <h4 className="line-clamp-2 text-base font-semibold text-cyan-300">
            {card.question}
          </h4>

          <p className="mt-3 line-clamp-3 text-sm text-white/70">
            {card.answer}
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setActiveId(card.id);
                setShowAnswer(false);

                setTimeout(() => {
                  reviewSectionRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }, 100);
              }}
              className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-cyan-300"
            >
              Study
            </button>

            <button
              type="button"
              onClick={() => handleDeleteCard(card.id)}
              disabled={deletingId === card.id}
              className="rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletingId === card.id ? "Deleting..." : "Delete"}
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