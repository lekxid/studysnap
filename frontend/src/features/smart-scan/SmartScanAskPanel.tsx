"use client";

import type { FormEvent } from "react";

export default function SmartScanAskPanel({
  question,
  answer,
  asking,
  disabled,
  disabledReason,
  onQuestionChange,
  onAsk,
}: {
  question: string;
  answer: string;
  asking: boolean;
  disabled: boolean;
  disabledReason: string;
  onQuestionChange: (value: string) => void;
  onAsk: () => void;
}) {
  function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      disabled ||
      asking ||
      !question.trim()
    ) {
      return;
    }

    onAsk();
  }

  return (
    <section className="rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(17,22,27,0.94),rgba(4,7,10,0.92))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.24)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#c9ad50]/20 bg-[#c9ad50]/10 text-sm font-black text-[#dfce8c]">
          AI
        </span>

        <div className="min-w-0">
          <h3 className="text-sm font-black text-white">
            Ask this scan
          </h3>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Answers use only text StudySnap successfully
            read from these pages.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4">
        <textarea
          value={question}
          onChange={(event) =>
            onQuestionChange(event.target.value)
          }
          maxLength={4000}
          disabled={disabled || asking}
          rows={3}
          placeholder="Explain the main ideas, create review questions, or clarify a difficult section..."
          className="w-full resize-none rounded-xl border border-white/[0.09] bg-black/25 px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-[#c9ad50]/35 disabled:cursor-not-allowed disabled:opacity-55"
        />

        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] leading-4 text-slate-500">
            {disabled
              ? disabledReason
              : `${question.length}/4000`}
          </p>

          <button
            type="submit"
            disabled={
              disabled ||
              asking ||
              !question.trim()
            }
            className="min-h-10 rounded-xl bg-[#c9ad50] px-4 py-2.5 text-xs font-black text-[#111317] transition hover:bg-[#d5bb63] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {asking
              ? "Thinking..."
              : "Ask StudySnap"}
          </button>
        </div>
      </form>

      {answer ? (
        <div
          aria-live="polite"
          className="mt-4 rounded-xl border border-white/[0.075] bg-black/25 p-4"
        >
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#d7c57e]">
            StudySnap answer
          </p>

          <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">
            {answer}
          </div>
        </div>
      ) : null}
    </section>
  );
}
