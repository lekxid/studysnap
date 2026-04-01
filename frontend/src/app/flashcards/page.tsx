"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";
import { loadJSON, saveJSON } from "@/lib/storage";

type Card = {
  id: number;
  question: string;
  answer: string;
};

const STORAGE_KEY = "studysnap_flashcards";

export default function FlashcardsPage() {
  const ready = useRequireAuth();

  const [cards, setCards] = useState<Card[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    const saved = loadJSON<Card[]>(STORAGE_KEY, []);
    setCards(saved);
    if (saved.length > 0) {
      setActiveId(saved[0].id);
    }
  }, [ready]);

  function persist(next: Card[]) {
    setCards(next);
    saveJSON(STORAGE_KEY, next);
    if (next.length > 0 && !next.find((c) => c.id === activeId)) {
      setActiveId(next[0].id);
      setShowAnswer(false);
    }
    if (next.length === 0) {
      setActiveId(null);
      setShowAnswer(false);
    }
  }

  function addCard() {
    if (!question.trim() || !answer.trim()) {
      setError("Enter both question and answer.");
      return;
    }
    setError("");

    const newCard: Card = {
      id: Date.now(),
      question: question.trim(),
      answer: answer.trim(),
    };

    const next = [newCard, ...cards];
    persist(next);
    setQuestion("");
    setAnswer("");
    setActiveId(newCard.id);
    setShowAnswer(false);
  }

  function deleteCard(id: number) {
    persist(cards.filter((card) => card.id !== id));
  }

  function shuffleCards() {
    const next = [...cards].sort(() => Math.random() - 0.5);
    persist(next);
  }

  const activeCard = cards.find((c) => c.id === activeId) || null;

  if (!ready) {
    return <div className="min-h-screen bg-black text-white p-6">Checking authentication...</div>;
  }

  return (
    <AppShell title="Flashcards" subtitle="Review smarter with saved cards and spaced repetition style practice">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-xl font-semibold text-cyan-300">Create Flashcard</h3>

          <div className="mt-4 space-y-4">
            <textarea
              className="min-h-[110px] w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30"
              placeholder="Question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <textarea
              className="min-h-[110px] w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white outline-none placeholder:text-white/30"
              placeholder="Answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />

            <button
              onClick={addCard}
              className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-black"
            >
              Save Flashcard
            </button>

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setShowAnswer((v) => !v)}
                className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-black"
                disabled={!activeCard}
              >
                {showAnswer ? "Show Question" : "Flip"}
              </button>
              <button
                onClick={shuffleCards}
                className="rounded-xl border border-white/20 px-4 py-2 font-semibold text-white"
                disabled={cards.length < 2}
              >
                Shuffle
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black p-8">
              {!activeCard ? (
                <p className="text-white/70">No flashcards yet.</p>
              ) : (
                <>
                  <p className="text-sm text-white/50">{showAnswer ? "Answer" : "Question"}</p>
                  <p className="mt-4 text-2xl font-semibold text-white">
                    {showAnswer ? activeCard.answer : activeCard.question}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
            <h3 className="text-xl font-semibold text-cyan-300">Saved Flashcards</h3>

            {cards.length === 0 ? (
              <div className="mt-6 rounded-xl bg-white/5 p-6 text-white/70">
                No flashcards saved yet.
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {cards.map((card) => (
                  <div key={card.id} className="rounded-2xl border border-white/10 bg-black p-5">
                    <h4 className="text-base font-semibold text-cyan-300">{card.question}</h4>
                    <p className="mt-3 text-sm text-white/70 line-clamp-3">{card.answer}</p>
                    <div className="mt-5 flex gap-3">
                      <button
                        onClick={() => {
                          setActiveId(card.id);
                          setShowAnswer(false);
                        }}
                        className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-black"
                      >
                        Study
                      </button>
                      <button
                        onClick={() => deleteCard(card.id)}
                        className="rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-300"
                      >
                        Delete
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
