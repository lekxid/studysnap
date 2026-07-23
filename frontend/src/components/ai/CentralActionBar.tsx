"use client";

import Link from "next/link";
import { useState } from "react";

import {
  executeCentralAction,
  getStudyRooms,
  previewCentralAction,
  undoCentralAction,
  type CentralActionRecord,
  type CentralActionType,
} from "@/lib/api";

type Props = {
  messageId: number;
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

const ACTIONS: Array<{
  type: CentralActionType;
  label: string;
}> = [
  {
    type: "save_note",
    label: "Save note",
  },
  {
    type: "create_flashcards",
    label: "Make cards",
  },
  {
    type: "create_quiz",
    label: "Make quiz",
  },
  {
    type: "add_to_planner",
    label: "Add to planner",
  },
];

function needsRoom(
  actionType: CentralActionType
): boolean {
  return actionType !== "add_to_planner";
}

function getLabel(
  actionType: CentralActionType
): string {
  return (
    ACTIONS.find(
      (item) => item.type === actionType
    )?.label ?? "Study action"
  );
}

function getDefaultPlannerDate(): string {
  const date = new Date();

  date.setDate(date.getDate() + 1);
  date.setHours(18, 0, 0, 0);

  const pad = (value: number) =>
    String(value).padStart(2, "0");

  return (
    `${date.getFullYear()}-`
    + `${pad(date.getMonth() + 1)}-`
    + `${pad(date.getDate())}T`
    + `${pad(date.getHours())}:`
    + pad(date.getMinutes())
  );
}

export default function CentralActionBar({
  messageId,
}: Props) {
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
    getDefaultPlannerDate
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

  async function loadRooms(): Promise<
    RoomOption[]
  > {
    if (roomsLoaded) {
      return rooms;
    }

    const response =
      await getStudyRooms();

    const nextRooms: RoomOption[] = (
      Array.isArray(response)
        ? response
        : []
    ).map((room) => ({
      id: room.id,
      name: room.name,
      subject: room.subject,
    }));

    setRooms(nextRooms);
    setRoomsLoaded(true);

    if (nextRooms.length === 1) {
      setSelectedRoomId(
        nextRooms[0].id
      );

      setPlannerSubject(
        nextRooms[0].subject
      );
    }

    return nextRooms;
  }

  function closePanels() {
    setSetupAction(null);
    setActionRecord(null);
    setError("");
    setNotice("");
  }

  function selectRoom(
    value: string
  ) {
    const roomId = value
      ? Number(value)
      : null;

    setSelectedRoomId(roomId);

    if (roomId !== null) {
      const room = rooms.find(
        (item) => item.id === roomId
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
  }

  function getPlannerPayload(): Record<
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
      !Number.isInteger(duration) ||
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
      duration_minutes: duration,
      priority: plannerPriority,
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
              ? getPlannerPayload()
              : {},
        });

      setSetupAction(null);
      setActionRecord(result);

      if (
        result.status === "executed"
      ) {
        setNotice(
          "This already exists. Open it or undo it."
        );
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "The action could not be prepared.";

      if (
        needsRoom(actionType) &&
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
          "Rooms could not be loaded. You can still create the planner item without a room."
        );
      } finally {
        setBusy(false);
      }

      return;
    }

    await prepareAction(
      actionType,
      null
    );
  }

  async function submitSetup() {
    if (!setupAction) {
      return;
    }

    if (
      needsRoom(setupAction) &&
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
          ? "This already existed, so StudySnap did not create a duplicate."
          : `${result.label} completed.`
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
          ? "This was already undone."
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
    <section
      className="mt-3 max-w-full"
      aria-label="Study actions"
    >
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <button
            key={action.type}
            type="button"
            disabled={busy}
            onClick={() =>
              void beginAction(
                action.type
              )
            }
            className="rounded-xl border border-white/[0.10] bg-white/[0.035] px-3 py-2 text-xs font-bold text-zinc-300 transition hover:border-[#c9ad50]/45 hover:bg-[#c9ad50]/[0.08] hover:text-[#ead77f] disabled:cursor-wait disabled:opacity-50"
          >
            {action.label}
          </button>
        ))}
      </div>

      {setupAction ? (
        <div className="mt-3 rounded-2xl border border-[#c9ad50]/25 bg-[#0b0d0f] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-white">
                {getLabel(
                  setupAction
                )}
              </p>

              <p className="mt-1 text-xs leading-5 text-zinc-400">
                Review before StudySnap
                creates anything.
              </p>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={closePanels}
              className="rounded-lg px-2 py-1 text-xs font-bold text-zinc-500 hover:bg-white/5 hover:text-white"
            >
              Close
            </button>
          </div>

          {rooms.length > 0 ? (
            <label className="mt-3 block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-zinc-500">
                Study Room
              </span>

              <select
                value={
                  selectedRoomId ?? ""
                }
                onChange={(event) =>
                  selectRoom(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-[#151515] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c9ad50]/55"
              >
                <option value="">
                  {needsRoom(
                    setupAction
                  )
                    ? "Choose a room"
                    : "No room"}
                </option>

                {rooms.map((room) => (
                  <option
                    key={room.id}
                    value={room.id}
                  >
                    {room.name}
                    {" — "}
                    {room.subject}
                  </option>
                ))}
              </select>
            </label>
          ) : needsRoom(
              setupAction
            ) ? (
            <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <p className="text-xs leading-5 text-zinc-400">
                A Study Room is required.
              </p>

              <Link
                href="/study-rooms"
                className="mt-2 inline-flex rounded-lg bg-[#c9ad50] px-3 py-2 text-xs font-black text-black"
              >
                Open Study Rooms
              </Link>
            </div>
          ) : null}

          {setupAction ===
          "add_to_planner" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-zinc-500">
                  Subject
                </span>

                <input
                  value={
                    plannerSubject
                  }
                  maxLength={160}
                  onChange={(event) =>
                    setPlannerSubject(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#151515] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c9ad50]/55"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-zinc-500">
                  Date and time
                </span>

                <input
                  type="datetime-local"
                  value={plannerDate}
                  onChange={(event) =>
                    setPlannerDate(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#151515] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c9ad50]/55"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-zinc-500">
                  Minutes
                </span>

                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={
                    plannerDuration
                  }
                  onChange={(event) =>
                    setPlannerDuration(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#151515] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c9ad50]/55"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-zinc-500">
                  Priority
                </span>

                <select
                  value={
                    plannerPriority
                  }
                  onChange={(event) =>
                    setPlannerPriority(
                      event.target
                        .value as Priority
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#151515] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c9ad50]/55"
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

          <div className="mt-3 flex flex-wrap gap-2">
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
              className="rounded-xl bg-[#c9ad50] px-4 py-2.5 text-xs font-black text-black disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy
                ? "Preparing…"
                : "Preview"}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={closePanels}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black text-zinc-300 hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {actionRecord ? (
        <div className="mt-3 rounded-2xl border border-[#c9ad50]/25 bg-[linear-gradient(145deg,rgba(25,24,17,0.94),rgba(8,9,10,0.98))] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-black text-white">
                  {
                    actionRecord.label
                  }
                </p>

                <span className="rounded-full bg-[#c9ad50]/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#e2ca68]">
                  {
                    actionRecord.status
                  }
                </span>
              </div>

              <p className="mt-1.5 text-xs leading-5 text-zinc-400">
                {
                  actionRecord
                    .preview.summary
                }
              </p>

              {actionRecord.preview
                .room_name ? (
                <p className="mt-1 text-[11px] font-bold text-zinc-500">
                  {
                    actionRecord
                      .preview
                      .room_name
                  }
                </p>
              ) : null}
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={closePanels}
              className="rounded-lg px-2 py-1 text-xs font-bold text-zinc-500 hover:bg-white/5 hover:text-white"
            >
              Close
            </button>
          </div>

          {actionRecord
            .error_message ? (
            <p className="mt-2 rounded-xl border border-red-300/15 bg-red-500/[0.07] px-3 py-2 text-xs leading-5 text-red-200">
              {
                actionRecord
                  .error_message
              }
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {actionRecord
              .can_execute ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void confirmAction()
                }
                className="rounded-xl bg-[#c9ad50] px-4 py-2.5 text-xs font-black text-black disabled:cursor-wait disabled:opacity-50"
              >
                {busy
                  ? "Working…"
                  : "Confirm"}
              </button>
            ) : null}

            {typeof openHref ===
              "string" &&
            openHref ? (
              <Link
                href={openHref}
                className="rounded-xl bg-[#c9ad50] px-4 py-2.5 text-xs font-black text-black"
              >
                Open
              </Link>
            ) : null}

            {actionRecord.can_undo ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void undoAction()
                }
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black text-zinc-300 hover:border-red-300/25 hover:bg-red-500/[0.07] hover:text-red-200 disabled:cursor-wait disabled:opacity-50"
              >
                {busy
                  ? "Undoing…"
                  : "Undo"}
              </button>
            ) : null}

            {actionRecord.status ===
            "preview" ? (
              <button
                type="button"
                disabled={busy}
                onClick={closePanels}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black text-zinc-300 hover:bg-white/5"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          className="mt-2 text-xs leading-5 text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          className="mt-2 text-xs leading-5 text-[#d8c46b]"
          aria-live="polite"
        >
          {notice}
        </p>
      ) : null}
    </section>
  );
}
