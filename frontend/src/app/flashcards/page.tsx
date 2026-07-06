"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import {
  createFlashcard,
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

        if (roomList.length > 0) {
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
          <p className="text-sm text-white/50">Status</p>
          <p className="mt-2 text-xl font-bold text-white">
            {loadingCards ? "Loading..." : "Ready"}
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
          <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setShowAnswer((value) => !value)}
                className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!activeCard}
              >
                {showAnswer ? "Show Question" : "Flip"}
              </button>

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
                  <p className="text-sm text-white/50">
                    {showAnswer ? "Answer" : "Question"}
                  </p>

                  <p className="mt-4 whitespace-pre-wrap text-2xl font-semibold text-white">
                    {showAnswer ? activeCard.answer : activeCard.question}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
            <h3 className="text-xl font-semibold text-cyan-300">
              Saved Flashcards
            </h3>

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
