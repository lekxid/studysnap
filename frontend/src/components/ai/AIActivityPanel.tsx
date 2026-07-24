"use client";

import {
  useEffect,
  useState,
} from "react";

export type AIActivityStepStatus =
  | "active"
  | "complete"
  | "stopped"
  | "failed";

export type AIActivitySource = {
  label: string;
  href?: string;
};

export type AIActivityStep = {
  id: string;
  label: string;
  detail: string;
  progress?: number;
  startedAt: number;
  completedAt?: number;
  status: AIActivityStepStatus;
  sources?: AIActivitySource[];
};

type Props = {
  steps: AIActivityStep[];
  startedAt: number | null;
  active: boolean;
  onStop?: () => void;
};

function elapsedLabel(
  milliseconds: number,
) {
  const total = Math.max(
    0,
    Math.floor(milliseconds / 1000),
  );

  const hours =
    Math.floor(total / 3600);

  const minutes =
    Math.floor((total % 3600) / 60);

  const seconds =
    total % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function StepIcon({
  status,
}: {
  status: AIActivityStepStatus;
}) {
  if (status === "complete") {
    return (
      <span
        aria-hidden="true"
        className="grid h-6 w-6 place-items-center rounded-full border border-emerald-400/25 bg-emerald-400/10 text-[11px] font-black text-emerald-300"
      >
        ✓
      </span>
    );
  }

  if (status === "stopped") {
    return (
      <span
        aria-hidden="true"
        className="grid h-6 w-6 place-items-center rounded-full border border-amber-300/25 bg-amber-300/10 text-[9px] text-amber-200"
      >
        ■
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        aria-hidden="true"
        className="grid h-6 w-6 place-items-center rounded-full border border-red-400/25 bg-red-400/10 text-xs font-black text-red-300"
      >
        !
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="relative grid h-6 w-6 place-items-center"
    >
      <span className="absolute inset-0 animate-spin rounded-full border border-[#d8c36e]/20 border-t-[#eadf9f]" />
      <span className="h-2 w-2 rounded-full bg-[#d8c36e]" />
    </span>
  );
}

export default function AIActivityPanel({
  steps,
  startedAt,
  active,
  onStop,
}: Props) {
  const [open, setOpen] =
    useState(false);

  const [now, setNow] =
    useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer =
      window.setInterval(() => {
        setNow(Date.now());
      }, 1000);

    return () =>
      window.clearInterval(timer);
  }, [active, startedAt]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnEscape(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener(
      "keydown",
      closeOnEscape,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        closeOnEscape,
      );
  }, [open]);

  if (
    startedAt === null ||
    steps.length === 0
  ) {
    return null;
  }

  const lastStep =
    steps[steps.length - 1];

  const endTime =
    active
      ? now
      : (
          lastStep.completedAt ??
          lastStep.startedAt
        );

  const elapsed =
    elapsedLabel(
      endTime - startedAt,
    );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border border-white/[0.09] bg-[#171717] px-3 text-[11px] font-bold text-zinc-300 transition hover:border-[#d8c36e]/30 hover:bg-[#202020] hover:text-white"
        aria-label={`Open activity. Elapsed time ${elapsed}.`}
        aria-expanded={open}
      >
        <span
          aria-hidden="true"
          className={
            active
              ? "h-2 w-2 animate-pulse rounded-full bg-[#d8c36e]"
              : "h-2 w-2 rounded-full bg-emerald-400"
          }
        />

        <span className="hidden sm:inline">
          Activity
        </span>

        <span className="text-zinc-600">
          ·
        </span>

        <span>{elapsed}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-5">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Close activity"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label="StudySnap AI activity"
            className="relative flex max-h-[82dvh] w-full max-w-[620px] flex-col overflow-hidden rounded-t-[1.8rem] border border-white/[0.10] bg-[#202020] shadow-[0_30px_100px_rgba(0,0,0,0.75)] sm:rounded-[1.8rem]"
          >
            <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-white/[0.07] px-5 sm:px-7">
              <p className="min-w-0 flex-1 truncate text-base font-semibold text-zinc-200 sm:text-lg">
                Activity
                <span className="mx-2 text-zinc-600">
                  ·
                </span>
                <span className="text-zinc-400">
                  {elapsed}
                </span>
              </p>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-full text-2xl font-light text-zinc-300 transition hover:bg-white/[0.07] hover:text-white"
                aria-label="Close activity"
              >
                ×
              </button>
            </header>

            <div className="studysnap-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-zinc-100 sm:text-xl">
                  {active
                    ? "Working"
                    : "Completed"}
                </h2>

                {active ? (
                  <span className="rounded-full border border-[#d8c36e]/20 bg-[#d8c36e]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#eadf9f]">
                    Live
                  </span>
                ) : null}
              </div>

              <ol className="space-y-1">
                {steps.map(
                  (step, index) => {
                    const last =
                      index ===
                      steps.length - 1;

                    return (
                      <li
                        key={step.id}
                        className="grid grid-cols-[24px_minmax(0,1fr)] gap-3"
                      >
                        <div className="flex flex-col items-center">
                          <StepIcon
                            status={step.status}
                          />

                          {!last ? (
                            <span
                              aria-hidden="true"
                              className="my-1 min-h-8 w-px flex-1 bg-white/[0.12]"
                            />
                          ) : null}
                        </div>

                        <div className="min-w-0 pb-5">
                          <p className="text-[15px] font-medium leading-6 text-zinc-100 sm:text-base">
                            {step.label}
                          </p>

                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-400 sm:text-[15px]">
                            {step.detail}
                          </p>

                          {typeof step.progress ===
                          "number" ? (
                            <div className="mt-3">
                              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                                <div
                                  className="h-full rounded-full bg-[#d8c36e] transition-[width] duration-300"
                                  style={{
                                    width:
                                      `${Math.max(
                                        0,
                                        Math.min(
                                          100,
                                          step.progress,
                                        ),
                                      )}%`,
                                  }}
                                />
                              </div>

                              <p className="mt-1 text-right text-[10px] font-bold text-zinc-500">
                                {Math.round(
                                  step.progress,
                                )}
                                %
                              </p>
                            </div>
                          ) : null}

                          {step.sources?.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {step.sources.map(
                                (source) =>
                                  source.href ? (
                                    <a
                                      key={`${step.id}-${source.label}`}
                                      href={source.href}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-full border border-white/[0.09] bg-black/20 px-3 py-1 text-xs text-zinc-300 transition hover:border-[#d8c36e]/30 hover:text-white"
                                    >
                                      {source.label}
                                    </a>
                                  ) : (
                                    <span
                                      key={`${step.id}-${source.label}`}
                                      className="rounded-full border border-white/[0.09] bg-black/20 px-3 py-1 text-xs text-zinc-300"
                                    >
                                      {source.label}
                                    </span>
                                  ),
                              )}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  },
                )}
              </ol>
            </div>

            {active && onStop ? (
              <footer className="shrink-0 border-t border-white/[0.07] px-5 py-4 sm:px-7">
                <button
                  type="button"
                  onClick={onStop}
                  className="min-h-11 w-full rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 text-sm font-bold text-zinc-200 transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-100"
                >
                  Stop current response
                </button>
              </footer>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
