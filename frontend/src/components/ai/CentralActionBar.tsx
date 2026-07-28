"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  executeCentralAction,
  getStudyRooms,
  previewCentralAction,
  undoCentralAction,
  type CentralActionRecord,
  type CentralActionType,
} from "@/lib/api";

import { selectGeneralAIActionRoom } from "@/lib/generalAiActionRoom";

type Props = {
  messageId: number;
  messageContent?: string | null;
  preferredStudyRoomId?: number | null;
};

type RoomOption = {
  id: number;
  name: string;
  subject: string;
};

type Priority =
  | "Low"
  | "Medium"
  | "High";

type ActionOption = {
  type: CentralActionType;
  label: string;
  description: string;
};

const ACTIONS: ActionOption[] = [
  {
    type: "save_note",
    label: "Save note",
    description: "Keep this reply in Notes",
  },
  {
    type: "create_flashcards",
    label: "Make cards",
    description: "Turn this reply into flashcards",
  },
  {
    type: "create_quiz",
    label: "Make quiz",
    description: "Create practice questions",
  },
  {
    type: "add_to_planner",
    label: "Add to planner",
    description: "Schedule this topic for later",
  },
];

function needsRoom(
  actionType: CentralActionType
): boolean {
  return actionType !== "add_to_planner";
}

function getActionLabel(
  actionType: CentralActionType
): string {
  return (
    ACTIONS.find(
      (action) =>
        action.type === actionType
    )?.label ?? "Study action"
  );
}

function getStatusLabel(
  status: CentralActionRecord["status"]
): string {
  if (status === "preview") {
    return "Ready";
  }

  if (status === "executed") {
    return "Created";
  }

  if (status === "undone") {
    return "Undone";
  }

  return "Needs attention";
}

function defaultPlannerDate(): string {
  const date = new Date();

  date.setDate(
    date.getDate() + 1
  );

  date.setHours(
    18,
    0,
    0,
    0
  );

  const pad = (
    value: number
  ) =>
    String(value).padStart(
      2,
      "0"
    );

  return (
    `${date.getFullYear()}-`
    + `${pad(date.getMonth() + 1)}-`
    + `${pad(date.getDate())}T`
    + `${pad(date.getHours())}:`
    + pad(date.getMinutes())
  );
}

function canUseStudyActions(
  content?: string | null
): boolean {
  const normalized = (
    content ?? ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return false;
  }

  const greetings = [
    "how can i help you with your studies today",
    "what would you like to study",
    "what can i help you study",
    "ask me a study question",
    "send me your notes",
    "upload a file to get started",
  ];

  if (
    greetings.some(
      (greeting) =>
        normalized.includes(
          greeting
        )
    )
  ) {
    return false;
  }

  const failures = [
    "something went wrong",
    "please try again",
    "request failed",
    "i could not complete",
    "i couldn't complete",
  ];

  if (
    normalized.length < 240 &&
    failures.some(
      (failure) =>
        normalized.includes(
          failure
        )
    )
  ) {
    return false;
  }

  return true;
}

function ActionIcon({
  actionType,
}: {
  actionType: CentralActionType;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap:
      "round" as const,
    strokeLinejoin:
      "round" as const,
  };

  if (
    actionType === "save_note"
  ) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        aria-hidden="true"
        {...common}
      >
        <path d="M6.5 3.75h8.75l2.25 2.2v14.3h-11z" />
        <path d="M14.75 3.75v2.7h2.75" />
        <path d="M9 10h6M9 13.5h6M9 17h4" />
      </svg>
    );
  }

  if (
    actionType ===
    "create_flashcards"
  ) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        aria-hidden="true"
        {...common}
      >
        <rect
          x="4.25"
          y="7"
          width="12.5"
          height="10"
          rx="2"
        />
        <path d="M8 4.75h9.2a2 2 0 0 1 2 2v7.5" />
        <path d="M7.5 11h6M7.5 14h4" />
      </svg>
    );
  }

  if (
    actionType ===
    "create_quiz"
  ) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        aria-hidden="true"
        {...common}
      >
        <circle
          cx="12"
          cy="12"
          r="8.25"
        />
        <path d="M9.8 9.5a2.35 2.35 0 0 1 4.55.8c0 1.8-2.35 2-2.35 3.55" />
        <path d="M12 17.1h.01" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden="true"
      {...common}
    >
      <rect
        x="4"
        y="5.5"
        width="16"
        height="14"
        rx="2.25"
      />
      <path d="M8 3.75v3.5M16 3.75v3.5M4 9.25h16" />
      <path d="M8 13h3M8 16h5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export default function CentralActionBar({
  messageId,
  messageContent,
  preferredStudyRoomId = null,
}: Props) {
  const [mounted, setMounted] =
    useState(false);

  const [open, setOpen] =
    useState(false);

  const [
    requestedRoomHint,
    setRequestedRoomHint,
  ] = useState<string | null>(
    null
  );

  const [
    setupAction,
    setSetupAction,
  ] = useState<
    CentralActionType | null
  >(null);

  const [
    actionRecord,
    setActionRecord,
  ] = useState<
    CentralActionRecord | null
  >(null);

  const [rooms, setRooms] =
    useState<RoomOption[]>([]);

  const [
    roomsLoaded,
    setRoomsLoaded,
  ] = useState(false);

  const [
    selectedRoomId,
    setSelectedRoomId,
  ] = useState<number | null>(
    null
  );

  const [
    plannerSubject,
    setPlannerSubject,
  ] = useState("Study");

  const [
    plannerDate,
    setPlannerDate,
  ] = useState(
    defaultPlannerDate
  );

  const [
    plannerDuration,
    setPlannerDuration,
  ] = useState("25");

  const [
    plannerPriority,
    setPlannerPriority,
  ] = useState<Priority>(
    "Medium"
  );

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const actionable =
    canUseStudyActions(
      messageContent
    );

  function openSheet() {
    if (!actionable) {
      return;
    }

    setRequestedRoomHint(null);
    setError("");
    setNotice("");
    setOpen(true);
  }

  function closeSheet() {
    setOpen(false);
    setRequestedRoomHint(null);
    setSetupAction(null);
    setActionRecord(null);
    setError("");
    setNotice("");
  }

  function showActionMenu() {
    setRequestedRoomHint(null);
    setSetupAction(null);
    setActionRecord(null);
    setError("");
    setNotice("");
  }

  useEffect(() => {
    if (
      typeof preferredStudyRoomId !== "number" ||
      Number.isNaN(preferredStudyRoomId) ||
      preferredStudyRoomId <= 0
    ) {
      return;
    }

    const timer = window.setTimeout(
      () => setSelectedRoomId(preferredStudyRoomId),
      0,
    );

    return () => window.clearTimeout(timer);
  }, [preferredStudyRoomId]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setMounted(true),
      0,
    );

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handleExternalOpen(
      event: Event
    ) {
      const customEvent =
        event as CustomEvent<{
          messageId?: number;
          actionType?:
            CentralActionType;
          roomHint?: string | null;
        }>;

      if (
        customEvent.detail
          ?.messageId !== messageId ||
        !actionable
      ) {
        return;
      }

      const requestedAction =
        customEvent.detail?.actionType ??
        null;

      const requestedRoomHintValue =
        customEvent.detail?.roomHint
          ?.trim() || null;

      setRequestedRoomHint(
        requestedRoomHintValue
      );
      setSetupAction(null);
      setActionRecord(null);
      setError("");
      setNotice("");
      setOpen(true);

      if (requestedAction) {
        setSetupAction(
          requestedAction
        );
        setBusy(true);

        void getStudyRooms()
          .then((response) => {
            const nextRooms:
              RoomOption[] =
              response.map(
                (room) => ({
                  id: room.id,
                  name: room.name,
                  subject:
                    room.subject,
                })
              );

            setRooms(
              nextRooms
            );
            setRoomsLoaded(
              true
            );

            const roomDecision =
              selectGeneralAIActionRoom(
                nextRooms,
                {
                  roomHint:
                    requestedRoomHintValue,
                  preferredStudyRoomId,
                }
              );

            const defaultRoom =
              roomDecision.room;

            setSelectedRoomId(
              defaultRoom?.id ?? null
            );

            if (defaultRoom) {
              setPlannerSubject(
                (current) =>
                  (
                    current.trim() &&
                    current !== "Study"
                  )
                    ? current
                    : defaultRoom.subject
              );
            }

            if (
              roomDecision.reason ===
              "ambiguous"
            ) {
              setError(
                "More than one Study Room matches. Choose the room you meant."
              );
            } else if (
              roomDecision.reason ===
              "unmatched"
            ) {
              setError(
                requestedRoomHintValue
                  ? (
                      `StudySnap could not find a Study Room matching "${requestedRoomHintValue}". Choose a room.`
                    )
                  : "Choose a Study Room."
              );
            }
          })
          .catch(() => {
            setError(
              requestedAction ===
                "add_to_planner"
                ? (
                    "Rooms could not be loaded. "
                    + "The planner item can still "
                    + "be created without a room."
                  )
                : (
                    "StudySnap could not load "
                    + "your Study Rooms."
                  )
            );
          })
          .finally(() => {
            setBusy(false);
          });
      }
    }

    window.addEventListener(
      "studysnap:open-study-actions",
      handleExternalOpen
    );

    return () => {
      window.removeEventListener(
        "studysnap:open-study-actions",
        handleExternalOpen
      );
    };
  }, [
    actionable,
    messageId,
    preferredStudyRoomId,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.key === "Escape"
      ) {
        closeSheet();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [open]);


  async function loadRooms(): Promise<
    RoomOption[]
  > {
    if (roomsLoaded) {
      return rooms;
    }

    const response =
      await getStudyRooms();

    const nextRooms: RoomOption[] =
      response.map(
        (room) => ({
          id: room.id,
          name: room.name,
          subject: room.subject,
        })
      );

    setRooms(nextRooms);
    setRoomsLoaded(true);

    const roomDecision =
      selectGeneralAIActionRoom(
        nextRooms,
        {
          roomHint:
            requestedRoomHint,
          preferredStudyRoomId,
        }
      );

    const defaultRoom =
      roomDecision.room;

    setSelectedRoomId(
      defaultRoom?.id ?? null
    );

    if (defaultRoom) {
      setPlannerSubject(
        (current) =>
          (
            current.trim() &&
            current !== "Study"
          )
            ? current
            : defaultRoom.subject
      );
    }

    if (
      roomDecision.reason ===
      "ambiguous"
    ) {
      setError(
        "More than one Study Room matches. Choose the room you meant."
      );
    } else if (
      roomDecision.reason ===
      "unmatched"
    ) {
      setError(
        requestedRoomHint
          ? (
              `StudySnap could not find a Study Room matching "${requestedRoomHint}". Choose a room.`
            )
          : "Choose a Study Room."
      );
    }

    return nextRooms;
  }

  function selectRoom(
    rawValue: string
  ) {
    const roomId = rawValue
      ? Number(rawValue)
      : null;

    setSelectedRoomId(roomId);

    if (roomId === null) {
      return;
    }

    const room = rooms.find(
      (candidate) =>
        candidate.id === roomId
    );

    if (
      room &&
      (
        !plannerSubject.trim() ||
        plannerSubject === "Study"
      )
    ) {
      setPlannerSubject(
        room.subject
      );
    }
  }

  function plannerPayload(): Record<
    string,
    unknown
  > {
    const subject =
      plannerSubject.trim();

    if (!subject) {
      throw new Error(
        "Enter a planner subject."
      );
    }

    const scheduledDate =
      new Date(plannerDate);

    if (
      Number.isNaN(
        scheduledDate.getTime()
      )
    ) {
      throw new Error(
        "Choose a valid date and time."
      );
    }

    const duration = Number(
      plannerDuration
    );

    if (
      !Number.isInteger(
        duration
      ) ||
      duration < 1 ||
      duration > 1440
    ) {
      throw new Error(
        "Duration must be between 1 and 1440 minutes."
      );
    }

    return {
      subject,
      scheduled_for:
        scheduledDate.toISOString(),
      duration_minutes:
        duration,
      priority:
        plannerPriority,
    };
  }

  async function prepareAction(
    actionType: CentralActionType,
    roomId: number | null
  ) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const result =
        await previewCentralAction({
          actionType,
          sourceMessageId:
            messageId,
          studyRoomId:
            roomId ?? undefined,
          payload:
            actionType ===
            "add_to_planner"
              ? plannerPayload()
              : {},
        });

      setSetupAction(null);
      setActionRecord(result);

      if (
        result.status ===
        "executed"
      ) {
        setNotice(
          "This already exists. StudySnap did not create a duplicate."
        );
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "The action could not be prepared.";

      if (
        needsRoom(
          actionType
        ) &&
        /choose a study room/i.test(
          message
        )
      ) {
        try {
          const availableRooms =
            await loadRooms();

          setSetupAction(
            actionType
          );

          setError(
            availableRooms.length
              ? "Choose where this should be saved."
              : "Create a Study Room first."
          );
        } catch {
          setError(
            "StudySnap could not load your Study Rooms."
          );
        }
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function beginAction(
    actionType: CentralActionType
  ) {
    setActionRecord(null);
    setError("");
    setNotice("");

    if (
      actionType ===
      "add_to_planner"
    ) {
      setSetupAction(
        actionType
      );

      setBusy(true);

      try {
        await loadRooms();
      } catch {
        setError(
          "Rooms could not be loaded. The planner item can still be created without a room."
        );
      } finally {
        setBusy(false);
      }

      return;
    }

    await prepareAction(
      actionType,
      selectedRoomId ??
        preferredStudyRoomId
    );
  }

  async function submitSetup() {
    if (!setupAction) {
      return;
    }

    if (
      needsRoom(
        setupAction
      ) &&
      selectedRoomId === null
    ) {
      setError(
        "Choose a Study Room."
      );

      return;
    }

    await prepareAction(
      setupAction,
      selectedRoomId
    );
  }

  async function confirmAction() {
    if (!actionRecord) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const result =
        await executeCentralAction(
          actionRecord.id
        );

      setActionRecord(result);

      setNotice(
        result.already_executed ||
          result.duplicate
          ? "This already existed, so StudySnap did not create another copy."
          : `${result.label} created.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The action could not be completed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function undoAction() {
    if (!actionRecord) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const result =
        await undoCentralAction(
          actionRecord.id
        );

      setActionRecord(result);

      setNotice(
        result.already_undone
          ? "This action was already undone."
          : "Action undone."
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The action could not be undone."
      );
    } finally {
      setBusy(false);
    }
  }

  const openHref =
    actionRecord?.result
      ?.open_href;

  return (
    <>
      {actionable ? (
        <button
          type="button"
          onClick={openSheet}
          className="group relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[18px] border border-[#d7bd62]/35 bg-[radial-gradient(circle_at_30%_20%,rgba(255,235,150,0.22),transparent_44%),linear-gradient(145deg,rgba(201,173,80,0.20),rgba(201,173,80,0.055))] text-[#f0dc7e] shadow-[0_12px_32px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-[#e3cb70]/55 hover:text-[#ffec92] active:translate-y-0 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5cd70]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090b0d]"
          aria-label="Open actions for this StudySnap reply"
          aria-haspopup="dialog"
          aria-controls={`study-actions-dialog-${messageId}`}
          title="Use this reply"
        >
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#f1d66f] shadow-[0_0_10px_rgba(241,214,111,0.9)]"
            aria-hidden="true"
          />

          <span
            className="grid h-8 w-8 place-items-center rounded-xl border border-[#e2ca72]/20 bg-black/15 text-[11px] font-black"
            aria-hidden="true"
          >
            S
          </span>
        </button>
      ) : (
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] border border-[#c9ad50]/20 bg-[#c9ad50]/[0.08] text-[11px] font-black text-[#d8c878]"
          aria-label="StudySnap"
          title="StudySnap"
        >
          S
        </span>
      )}

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[180] flex items-end justify-center bg-black/80 backdrop-blur-[7px] sm:items-center sm:p-5"
              onPointerDown={(
                event
              ) => {
                if (
                  event.target ===
                  event.currentTarget
                ) {
                  closeSheet();
                }
              }}
            >
              <section
                id={`study-actions-dialog-${messageId}`}
                role="dialog"
                aria-modal="true"
                aria-label="Study actions"
                className="w-full max-h-[92dvh] overscroll-contain overflow-y-auto rounded-t-[34px] border border-[#d4b95b]/15 bg-[radial-gradient(circle_at_top,rgba(201,173,80,0.075),transparent_28%),linear-gradient(180deg,#141719_0%,#090b0d_100%)] px-4 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-3 shadow-[0_-32px_100px_rgba(0,0,0,0.75)] sm:max-w-[500px] sm:rounded-[30px] sm:p-5"
                onPointerDown={(
                  event
                ) =>
                  event.stopPropagation()
                }
              >
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15 sm:hidden" />

                <header className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {setupAction ||
                    actionRecord ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={
                          showActionMenu
                        }
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
                        aria-label="Back to study actions"
                      >
                        <BackIcon />
                      </button>
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#c9ad50]/20 bg-[#c9ad50]/[0.08] text-sm font-black text-[#dfc968]">
                        S
                      </div>
                    )}

                    <div className="min-w-0">
                      <h2 className="truncate text-[15px] font-black text-white">
                        {setupAction
                          ? getActionLabel(
                              setupAction
                            )
                          : actionRecord
                            ? actionRecord.label
                            : "Study actions"}
                      </h2>

                      <p className="truncate text-xs text-zinc-500">
                        {setupAction ||
                        actionRecord
                          ? "Review before StudySnap creates anything"
                          : "Use this StudySnap reply"}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={closeSheet}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] text-zinc-500 transition hover:bg-white/[0.05] hover:text-white"
                    aria-label="Close study actions"
                  >
                    <CloseIcon />
                  </button>
                </header>

                {!setupAction &&
                !actionRecord ? (
                  <div className="mt-5 grid grid-cols-2 gap-2.5">
                    {ACTIONS.map(
                      (action) => (
                        <button
                          key={
                            action.type
                          }
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void beginAction(
                              action.type
                            )
                          }
                          className="group min-h-[112px] rounded-[18px] border border-white/[0.075] bg-white/[0.025] p-3.5 text-left transition duration-200 hover:border-[#c9ad50]/25 hover:bg-[#c9ad50]/[0.055] active:scale-[0.98] disabled:cursor-wait disabled:opacity-45"
                        >
                          <span className="flex h-10 w-10 items-center justify-center rounded-[13px] border border-white/[0.08] bg-white/[0.04] text-zinc-400 transition group-hover:border-[#c9ad50]/30 group-hover:text-[#e2cb6c]">
                            <ActionIcon
                              actionType={
                                action.type
                              }
                            />
                          </span>

                          <span className="mt-3 block text-sm font-black text-white">
                            {
                              action.label
                            }
                          </span>

                          <span className="mt-1 block text-[11px] leading-4 text-zinc-500">
                            {
                              action.description
                            }
                          </span>
                        </button>
                      )
                    )}
                  </div>
                ) : null}

                {setupAction ? (
                  <div className="mt-5">
                    {rooms.length >
                    0 ? (
                      <label className="block">
                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                          Study Room
                        </span>

                        <select
                          value={
                            selectedRoomId ??
                            ""
                          }
                          onChange={(
                            event
                          ) =>
                            selectRoom(
                              event
                                .target
                                .value
                            )
                          }
                          className="w-full rounded-[14px] border border-white/[0.09] bg-[#151719] px-3.5 py-3 text-sm text-white outline-none focus:border-[#c9ad50]/45"
                        >
                          <option value="">
                            {needsRoom(
                              setupAction
                            )
                              ? "Choose a room"
                              : "No room"}
                          </option>

                          {rooms.map(
                            (room) => (
                              <option
                                key={
                                  room.id
                                }
                                value={
                                  room.id
                                }
                              >
                                {
                                  room.name
                                }
                                {" — "}
                                {
                                  room.subject
                                }
                              </option>
                            )
                          )}
                        </select>
                      </label>
                    ) : needsRoom(
                        setupAction
                      ) ? (
                      <div className="rounded-[16px] border border-white/[0.08] bg-white/[0.025] p-3.5">
                        <p className="text-xs leading-5 text-zinc-400">
                          A Study Room is required for this action.
                        </p>

                        <Link
                          href="/study-rooms"
                          className="mt-3 inline-flex rounded-xl bg-[#c9ad50] px-3.5 py-2.5 text-xs font-black text-black"
                        >
                          Open Study Rooms
                        </Link>
                      </div>
                    ) : null}

                    {setupAction ===
                    "add_to_planner" ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="block sm:col-span-2">
                          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            Subject
                          </span>

                          <input
                            value={
                              plannerSubject
                            }
                            maxLength={
                              160
                            }
                            onChange={(
                              event
                            ) =>
                              setPlannerSubject(
                                event
                                  .target
                                  .value
                              )
                            }
                            className="w-full rounded-[14px] border border-white/[0.09] bg-[#151719] px-3.5 py-3 text-sm text-white outline-none focus:border-[#c9ad50]/45"
                          />
                        </label>

                        <label className="block sm:col-span-2">
                          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            Date and time
                          </span>

                          <input
                            type="datetime-local"
                            value={
                              plannerDate
                            }
                            onChange={(
                              event
                            ) =>
                              setPlannerDate(
                                event
                                  .target
                                  .value
                              )
                            }
                            className="w-full rounded-[14px] border border-white/[0.09] bg-[#151719] px-3.5 py-3 text-sm text-white outline-none focus:border-[#c9ad50]/45"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            Minutes
                          </span>

                          <input
                            type="number"
                            min={1}
                            max={1440}
                            value={
                              plannerDuration
                            }
                            onChange={(
                              event
                            ) =>
                              setPlannerDuration(
                                event
                                  .target
                                  .value
                              )
                            }
                            className="w-full rounded-[14px] border border-white/[0.09] bg-[#151719] px-3.5 py-3 text-sm text-white outline-none focus:border-[#c9ad50]/45"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            Priority
                          </span>

                          <select
                            value={
                              plannerPriority
                            }
                            onChange={(
                              event
                            ) =>
                              setPlannerPriority(
                                event
                                  .target
                                  .value as Priority
                              )
                            }
                            className="w-full rounded-[14px] border border-white/[0.09] bg-[#151719] px-3.5 py-3 text-sm text-white outline-none focus:border-[#c9ad50]/45"
                          >
                            <option value="Low">
                              Low
                            </option>
                            <option value="Medium">
                              Medium
                            </option>
                            <option value="High">
                              High
                            </option>
                          </select>
                        </label>
                      </div>
                    ) : null}

                    <div className="mt-5 flex gap-2">
                      <button
                        type="button"
                        disabled={
                          busy ||
                          (
                            needsRoom(
                              setupAction
                            ) &&
                            selectedRoomId ===
                              null
                          )
                        }
                        onClick={() =>
                          void submitSetup()
                        }
                        className="flex-1 rounded-[14px] bg-[#c9ad50] px-4 py-3 text-xs font-black text-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busy
                          ? "Preparing…"
                          : "Review"}
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={
                          showActionMenu
                        }
                        className="rounded-[14px] border border-white/[0.09] px-4 py-3 text-xs font-black text-zinc-300 hover:bg-white/[0.04]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {actionRecord ? (
                  <div className="mt-5">
                    <div className="rounded-[18px] border border-[#c9ad50]/18 bg-[linear-gradient(145deg,rgba(26,24,16,0.92),rgba(13,14,15,0.98))] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-white">
                          {
                            actionRecord.label
                          }
                        </p>

                        <span className="rounded-full bg-[#c9ad50]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#dfca6d]">
                          {getStatusLabel(
                            actionRecord.status
                          )}
                        </span>
                      </div>

                      <p className="mt-2 text-xs leading-5 text-zinc-400">
                        {
                          actionRecord
                            .preview
                            .summary
                        }
                      </p>

                      {actionRecord
                        .preview
                        .room_name ? (
                        <p className="mt-2 text-[11px] font-bold text-zinc-500">
                          {
                            actionRecord
                              .preview
                              .room_name
                          }
                        </p>
                      ) : null}
                    </div>

                    {actionRecord
                      .error_message ? (
                      <p className="mt-3 rounded-[14px] border border-red-300/15 bg-red-500/[0.07] px-3.5 py-3 text-xs leading-5 text-red-200">
                        {
                          actionRecord
                            .error_message
                        }
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {actionRecord
                        .can_execute ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void confirmAction()
                          }
                          className="rounded-[14px] bg-[#c9ad50] px-4 py-3 text-xs font-black text-black active:scale-[0.98] disabled:cursor-wait disabled:opacity-45"
                        >
                          {busy
                            ? "Creating…"
                            : "Create"}
                        </button>
                      ) : null}

                      {typeof openHref ===
                        "string" &&
                      openHref ? (
                        <Link
                          href={
                            openHref
                          }
                          className="rounded-[14px] bg-[#c9ad50] px-4 py-3 text-xs font-black text-black"
                        >
                          Open
                        </Link>
                      ) : null}

                      {actionRecord
                        .can_undo ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void undoAction()
                          }
                          className="rounded-[14px] border border-white/[0.09] px-4 py-3 text-xs font-black text-zinc-300 transition hover:border-red-300/20 hover:bg-red-500/[0.06] hover:text-red-200 disabled:cursor-wait disabled:opacity-45"
                        >
                          {busy
                            ? "Undoing…"
                            : "Undo"}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        disabled={busy}
                        onClick={
                          closeSheet
                        }
                        className="rounded-[14px] border border-white/[0.09] px-4 py-3 text-xs font-black text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <p
                    className="mt-3 text-xs leading-5 text-red-300"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}

                {notice ? (
                  <p
                    className="mt-3 text-xs leading-5 text-[#dbc86d]"
                    aria-live="polite"
                  >
                    {notice}
                  </p>
                ) : null}

              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
