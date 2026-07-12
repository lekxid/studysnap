"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";

type PendingInvite = {
  email: string;
  createdAt: string;
};

type PreviewMessage = {
  id: string;
  content: string;
  createdAt: string;
};

type StudyTogetherWorkspaceProps = {
  studyRoomId: number;
  roomTitle: string;
  materialsCount: number;
  notesCount: number;
  conceptCardsCount: number;
  quizzesCount: number;
  onOpenMaterials: () => void;
  onOpenNotes: () => void;
  onOpenAiTutor: () => void;
};

const starterPrompts = [
  "What are we trying to pass in this course?",
  "What is the hardest topic right now?",
  "When should we do a group quiz?",
];

function makeId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function formatActivityTime(value: string) {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return "Just now";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

export default function StudyTogetherWorkspace({
  studyRoomId,
  roomTitle,
  materialsCount,
  notesCount,
  conceptCardsCount,
  quizzesCount,
  onOpenMaterials,
  onOpenNotes,
  onOpenAiTutor,
}: StudyTogetherWorkspaceProps) {
  const inviteStorageKey =
    `studysnap:room:${studyRoomId}:study-together-invites`;

  const messageStorageKey =
    `studysnap:room:${studyRoomId}:study-together-preview-messages`;

  const [inviteEmail, setInviteEmail] =
    useState("");

  const [inviteError, setInviteError] =
    useState("");

  const [pendingInvites, setPendingInvites] =
    useState<PendingInvite[]>([]);

  const [chatDraft, setChatDraft] =
    useState("");

  const [previewMessages, setPreviewMessages] =
    useState<PreviewMessage[]>([]);

  const [hydrated, setHydrated] =
    useState(false);

  useEffect(() => {
    try {
      const savedInvites =
        window.localStorage.getItem(
          inviteStorageKey
        );

      if (savedInvites) {
        const parsed = JSON.parse(
          savedInvites
        ) as PendingInvite[];

        if (Array.isArray(parsed)) {
          setPendingInvites(
            parsed.filter(
              (item) =>
                Boolean(item?.email) &&
                Boolean(item?.createdAt)
            )
          );
        }
      }

      const savedMessages =
        window.localStorage.getItem(
          messageStorageKey
        );

      if (savedMessages) {
        const parsed = JSON.parse(
          savedMessages
        ) as PreviewMessage[];

        if (Array.isArray(parsed)) {
          setPreviewMessages(
            parsed.filter(
              (item) =>
                Boolean(item?.id) &&
                Boolean(item?.content) &&
                Boolean(item?.createdAt)
            )
          );
        }
      }
    } catch {
      window.localStorage.removeItem(
        inviteStorageKey
      );

      window.localStorage.removeItem(
        messageStorageKey
      );
    } finally {
      setHydrated(true);
    }
  }, [
    inviteStorageKey,
    messageStorageKey,
  ]);

  useEffect(() => {
    if (!hydrated) return;

    window.localStorage.setItem(
      inviteStorageKey,
      JSON.stringify(pendingInvites)
    );
  }, [
    hydrated,
    inviteStorageKey,
    pendingInvites,
  ]);

  useEffect(() => {
    if (!hydrated) return;

    window.localStorage.setItem(
      messageStorageKey,
      JSON.stringify(previewMessages)
    );
  }, [
    hydrated,
    messageStorageKey,
    previewMessages,
  ]);

  const activityItems = useMemo(() => {
    const items: {
      icon: string;
      title: string;
      text: string;
    }[] = [];

    if (materialsCount > 0) {
      items.push({
        icon: "📚",
        title: "Room materials ready",
        text: `${materialsCount} material${
          materialsCount === 1 ? "" : "s"
        } available for the group.`,
      });
    }

    if (notesCount > 0) {
      items.push({
        icon: "📝",
        title: "Notes connected",
        text: `${notesCount} shared study note${
          notesCount === 1 ? "" : "s"
        } can support discussion.`,
      });
    }

    if (conceptCardsCount > 0) {
      items.push({
        icon: "🧠",
        title: "Concept Cards available",
        text: `${conceptCardsCount} card${
          conceptCardsCount === 1 ? "" : "s"
        } ready for group review.`,
      });
    }

    if (quizzesCount > 0) {
      items.push({
        icon: "🧾",
        title: "Quiz practice ready",
        text: `${quizzesCount} quiz${
          quizzesCount === 1 ? "" : "zes"
        } connected to this room.`,
      });
    }

    if (items.length === 0) {
      items.push({
        icon: "✨",
        title: "This room is ready",
        text: "Add a material or note to give your future study group something to work from.",
      });
    }

    return items.slice(0, 4);
  }, [
    conceptCardsCount,
    materialsCount,
    notesCount,
    quizzesCount,
  ]);

  function prepareInvite(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanEmail =
      inviteEmail.trim().toLowerCase();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        cleanEmail
      )
    ) {
      setInviteError(
        "Enter a valid classmate email."
      );
      return;
    }

    if (
      pendingInvites.some(
        (invite) =>
          invite.email === cleanEmail
      )
    ) {
      setInviteError(
        "This classmate is already in your prepared invite list."
      );
      return;
    }

    setPendingInvites((current) => [
      ...current,
      {
        email: cleanEmail,
        createdAt:
          new Date().toISOString(),
      },
    ]);

    setInviteEmail("");
    setInviteError("");
  }

  function removeInvite(email: string) {
    setPendingInvites((current) =>
      current.filter(
        (invite) =>
          invite.email !== email
      )
    );
  }

  function addPreviewMessage(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanMessage =
      chatDraft.trim();

    if (!cleanMessage) return;

    setPreviewMessages((current) => [
      ...current,
      {
        id: makeId(),
        content: cleanMessage,
        createdAt:
          new Date().toISOString(),
      },
    ]);

    setChatDraft("");
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[1.6rem] border border-cyan-300/15 bg-[linear-gradient(135deg,rgba(34,211,238,0.08),rgba(250,204,21,0.06),rgba(2,6,23,0.95))]">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">
              Study Together
            </p>

            <h2 className="mt-2 text-2xl font-black text-white md:text-3xl">
              Make {roomTitle} feel alive
            </h2>

            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Bring classmates into the same room, study from the same materials,
              discuss difficult topics, and turn room knowledge into group
              practice.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-black text-emerald-100">
                ● You are here
              </span>

              <span className="rounded-full border border-yellow-300/20 bg-yellow-300/10 px-3 py-1.5 text-xs font-black text-yellow-100">
                Room owner
              </span>

              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-slate-300">
                {pendingInvites.length} prepared invite
                {pendingInvites.length === 1
                  ? ""
                  : "s"}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4">
            <p className="text-sm font-black text-yellow-100">
              You are the first member in this room
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-300">
              Invite one or two classmates to start a focused study group.
            </p>

            <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-slate-400">
              Live invitations and real-time presence connect in the next backend
              phase.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-5">
          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-200">
                  Group actions
                </p>

                <h3 className="mt-2 text-xl font-black text-white">
                  Start something together
                </h3>
              </div>

              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-black text-cyan-100">
                Uses this room
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Link
                href={`/quizzes?roomId=${studyRoomId}`}
                className="rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4 transition hover:border-yellow-300/40 hover:bg-yellow-300/15"
              >
                <p className="text-2xl">🧾</p>
                <p className="mt-3 text-sm font-black text-white">
                  Start room quiz
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Open quizzes connected to this room.
                </p>
              </Link>

              <button
                type="button"
                onClick={onOpenAiTutor}
                className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-left transition hover:border-cyan-300/40 hover:bg-cyan-300/15"
              >
                <p className="text-2xl">🤖</p>
                <p className="mt-3 text-sm font-black text-white">
                  Ask room AI
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Ask from the room’s connected learning context.
                </p>
              </button>

              <Link
                href={`/flashcards?roomId=${studyRoomId}`}
                className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 transition hover:border-emerald-300/40 hover:bg-emerald-300/15"
              >
                <p className="text-2xl">🧠</p>
                <p className="mt-3 text-sm font-black text-white">
                  Review Concept Cards
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Practice the same room concepts.
                </p>
              </Link>
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
                  Shared study chat
                </p>

                <h3 className="mt-2 text-xl font-black text-white">
                  Give the room a heartbeat
                </h3>
              </div>

              <span className="rounded-full border border-orange-300/20 bg-orange-300/10 px-3 py-1.5 text-xs font-black text-orange-100">
                Private preview
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-400">
              Preview messages stay on this device for now. Real shared chat will
              replace this local preview when the collaboration backend is
              connected.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {starterPrompts.map(
                (prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() =>
                      setChatDraft(prompt)
                    }
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-cyan-300/25 hover:bg-cyan-300/10 hover:text-white"
                  >
                    {prompt}
                  </button>
                )
              )}
            </div>

            <div className="mt-5 min-h-52 space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4">
              {previewMessages.length ? (
                previewMessages.map(
                  (message) => (
                    <div
                      key={message.id}
                      className="ml-auto max-w-[88%] rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-yellow-100">
                          You · Owner
                        </p>

                        <p className="text-[10px] text-slate-500">
                          {formatActivityTime(
                            message.createdAt
                          )}
                        </p>
                      </div>

                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-100">
                        {message.content}
                      </p>
                    </div>
                  )
                )
              ) : (
                <div className="flex min-h-44 items-center justify-center text-center">
                  <div className="max-w-sm">
                    <p className="text-3xl">💬</p>
                    <p className="mt-3 text-sm font-black text-white">
                      No messages yet
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      Start the first study chat with a question, goal, or group
                      quiz plan.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={addPreviewMessage}
              className="mt-4"
            >
              <textarea
                value={chatDraft}
                onChange={(event) =>
                  setChatDraft(
                    event.target.value
                  )
                }
                placeholder="Write a preview study message..."
                rows={3}
                className="w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  This does not send to classmates yet.
                </p>

                <button
                  type="submit"
                  disabled={!chatDraft.trim()}
                  className="rounded-xl bg-yellow-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add preview message
                </button>
              </div>
            </form>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-200">
              Room members
            </p>

            <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-300 text-lg font-black text-slate-950">
                  Y
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-black text-white">
                    You
                  </p>
                  <p className="text-xs text-emerald-100/70">
                    Room owner · Active now
                  </p>
                </div>

                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              </div>
            </div>

            {pendingInvites.length ? (
              <div className="mt-3 space-y-2">
                {pendingInvites.map(
                  (invite) => (
                    <div
                      key={invite.email}
                      className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">
                            {invite.email}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Prepared locally · Not sent
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            removeInvite(
                              invite.email
                            )
                          }
                          className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black text-slate-400 hover:bg-white/[0.08] hover:text-white"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : null}
          </section>

          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
              Invite classmates
            </p>

            <h3 className="mt-2 text-lg font-black text-white">
              Build a small study group
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Prepare the classmates you want to invite. Email delivery connects
              in the next backend phase.
            </p>

            <form
              onSubmit={prepareInvite}
              className="mt-4"
            >
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(
                    event.target.value
                  );
                  setInviteError("");
                }}
                placeholder="classmate@email.com"
                className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/30"
              />

              {inviteError ? (
                <p className="mt-2 text-xs font-semibold text-red-300">
                  {inviteError}
                </p>
              ) : null}

              <button
                type="submit"
                className="mt-3 w-full rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15"
              >
                Prepare invite
              </button>
            </form>
          </section>

          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-200">
              Shared room content
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onOpenMaterials}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-yellow-300/25 hover:bg-yellow-300/10"
              >
                <p className="text-2xl font-black text-white">
                  {materialsCount}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  Materials
                </p>
              </button>

              <button
                type="button"
                onClick={onOpenNotes}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-cyan-300/25 hover:bg-cyan-300/10"
              >
                <p className="text-2xl font-black text-white">
                  {notesCount}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  Notes
                </p>
              </button>

              <Link
                href={`/flashcards?roomId=${studyRoomId}`}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-emerald-300/25 hover:bg-emerald-300/10"
              >
                <p className="text-2xl font-black text-white">
                  {conceptCardsCount}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  Concept Cards
                </p>
              </Link>

              <Link
                href={`/quizzes?roomId=${studyRoomId}`}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-yellow-300/25 hover:bg-yellow-300/10"
              >
                <p className="text-2xl font-black text-white">
                  {quizzesCount}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  Quizzes
                </p>
              </Link>
            </div>
          </section>
        </aside>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
              Room activity
            </p>

            <h3 className="mt-2 text-xl font-black text-white">
              What is happening in this room
            </h3>
          </div>

          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-400">
            Live activity log connects next
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {activityItems.map(
            (item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <p className="text-2xl">
                  {item.icon}
                </p>
                <p className="mt-3 text-sm font-black text-white">
                  {item.title}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  {item.text}
                </p>
              </div>
            )
          )}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-orange-300/15 bg-orange-300/10 p-5">
        <p className="text-sm font-black text-orange-100">
          Collaboration backend comes next
        </p>

        <p className="mt-2 text-sm leading-6 text-slate-300">
          The next focused phase adds real room members, emailed invitations,
          shared messages, member roles, and a durable group activity log.
        </p>
      </section>
    </div>
  );
}
