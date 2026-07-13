"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  createRoomEmailInvitation,
  createRoomInviteLink,
  createRoomMessage,
  deleteRoomMessage,
  getCurrentUser,
  getRoomInvitations,
  getRoomMessages,
  revokeRoomEmailInvitation,
  revokeRoomInviteLink,
  updateRoomMessage,
  type RoomEmailInvitation,
  type RoomInvitationRole,
  type RoomInviteLink,
  type RoomMessage,
  type UserProfile,
} from "@/lib/api";

type PendingInvite = {
  id: number;
  email: string;
  role: RoomInvitationRole;
  status: "pending";
  createdAt: string;
};

type StudyTogetherWorkspaceProps = {
  studyRoomId: number;
  roomTitle: string;
  currentUserRole: string;
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

async function copyTextToClipboard(
  value: string
) {
  if (
    navigator.clipboard &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(
      value
    );
    return;
  }

  const textarea =
    document.createElement("textarea");

  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  textarea.select();

  const copied =
    document.execCommand("copy");

  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error(
      "Clipboard copy failed."
    );
  }
}

export default function StudyTogetherWorkspace({
  studyRoomId,
  roomTitle,
  currentUserRole,
  materialsCount,
  notesCount,
  conceptCardsCount,
  quizzesCount,
  onOpenMaterials,
  onOpenNotes,
  onOpenAiTutor,
}: StudyTogetherWorkspaceProps) {
  const normalizedRole =
    currentUserRole.trim().toLowerCase();

  const canManageInvitations =
    normalizedRole === "owner" ||
    normalizedRole === "admin";

  const canSendMessages =
    normalizedRole === "owner" ||
    normalizedRole === "admin" ||
    normalizedRole === "member";

  const currentRoleLabel =
    normalizedRole === "ai_tutor"
      ? "AI Tutor"
      : normalizedRole
          .split("_")
          .map(
            (part) =>
              part.charAt(0).toUpperCase() +
              part.slice(1)
          )
          .join(" ");

  const [inviteEmail, setInviteEmail] =
    useState("");

  const [inviteError, setInviteError] =
    useState("");

  const [
    invitationLoadError,
    setInvitationLoadError,
  ] = useState("");

  const [inviteNotice, setInviteNotice] =
    useState("");

  const [
    latestEmailInviteUrl,
    setLatestEmailInviteUrl,
  ] = useState("");

  const [
    emailInvitations,
    setEmailInvitations,
  ] = useState<RoomEmailInvitation[]>([]);

  const [
    shareLinks,
    setShareLinks,
  ] = useState<RoomInviteLink[]>([]);

  const [
    latestShareUrl,
    setLatestShareUrl,
  ] = useState("");

  const [
    shareLinkNotice,
    setShareLinkNotice,
  ] = useState("");

  const [
    shareLinkError,
    setShareLinkError,
  ] = useState("");

  const [inviteLoading, setInviteLoading] =
    useState(true);

  const [inviteAction, setInviteAction] =
    useState<string | null>(null);

  const [chatDraft, setChatDraft] =
    useState("");

  const [currentUser, setCurrentUser] =
    useState<UserProfile | null>(null);

  const [roomMessages, setRoomMessages] =
    useState<RoomMessage[]>([]);

  const [messageLoading, setMessageLoading] =
    useState(true);

  const [messageError, setMessageError] =
    useState("");

  const [messageSending, setMessageSending] =
    useState(false);

  const [
    editingMessageId,
    setEditingMessageId,
  ] = useState<number | null>(null);

  const [
    editMessageDraft,
    setEditMessageDraft,
  ] = useState("");

  const [
    pendingDeleteMessageId,
    setPendingDeleteMessageId,
  ] = useState<number | null>(null);

  const [
    messageActionId,
    setMessageActionId,
  ] = useState<number | null>(null);

  const pendingInvites =
    useMemo<PendingInvite[]>(
      () =>
        emailInvitations
          .filter(
            (
              invitation
            ): invitation is RoomEmailInvitation & {
              status: "pending";
            } =>
              invitation.status === "pending"
          )
          .map((invitation) => ({
            id: invitation.id,
            email: invitation.invited_email,
            role: invitation.role,
            status: "pending",
            createdAt:
              invitation.created_at ||
              new Date().toISOString(),
          })),
      [emailInvitations]
    );

  const activeShareLinks =
    useMemo(
      () =>
        shareLinks.filter(
          (link) =>
            link.status === "active"
        ),
      [shareLinks]
    );

  useEffect(() => {
    if (!canManageInvitations) {
      setInviteLoading(false);
      setInvitationLoadError("");
      setEmailInvitations([]);
      setShareLinks([]);
      return;
    }

    let cancelled = false;

    async function loadInvitations() {
      setInviteLoading(true);
      setInvitationLoadError("");

      try {
        const result =
          await getRoomInvitations(
            studyRoomId
          );

        if (cancelled) return;

        setEmailInvitations(
          result.email_invitations
        );

        setShareLinks(
          result.share_links
        );
      } catch (error) {
        if (cancelled) return;

        setInvitationLoadError(
          error instanceof Error
            ? error.message
            : "Could not load room invitations."
        );
      } finally {
        if (!cancelled) {
          setInviteLoading(false);
        }
      }
    }

    void loadInvitations();

    return () => {
      cancelled = true;
    };
  }, [
    canManageInvitations,
    studyRoomId,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadSharedChat() {
      setMessageLoading(true);
      setMessageError("");

      try {
        const [user, messages] =
          await Promise.all([
            getCurrentUser(),
            getRoomMessages(
              studyRoomId,
              { limit: 100 }
            ),
          ]);

        if (cancelled) return;

        setCurrentUser(user);
        setRoomMessages(
          Array.isArray(messages)
            ? messages
            : []
        );
      } catch (error) {
        if (cancelled) return;

        setMessageError(
          error instanceof Error
            ? error.message
            : "Could not load the shared chat."
        );
      } finally {
        if (!cancelled) {
          setMessageLoading(false);
        }
      }
    }

    async function refreshSharedChat() {
      try {
        const messages =
          await getRoomMessages(
            studyRoomId,
            { limit: 100 }
          );

        if (!cancelled) {
          setRoomMessages(
            Array.isArray(messages)
              ? messages
              : []
          );
        }
      } catch {
        // Keep the current conversation visible
        // during a temporary refresh failure.
      }
    }

    void loadSharedChat();

    const refreshTimer =
      window.setInterval(
        () => {
          void refreshSharedChat();
        },
        4000
      );

    return () => {
      cancelled = true;
      window.clearInterval(
        refreshTimer
      );
    };
  }, [studyRoomId]);

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

  async function prepareInvite(
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
        "This classmate already has a pending invitation."
      );
      return;
    }

    setInviteAction("create-email");
    setInviteError("");
    setInviteNotice("");
    setLatestEmailInviteUrl("");

    try {
      const result =
        await createRoomEmailInvitation(
          studyRoomId,
          cleanEmail,
          "member",
          7
        );

      setEmailInvitations((current) => [
        result.invitation,
        ...current.filter(
          (invitation) =>
            invitation.id !==
            result.invitation.id
        ),
      ]);

      setInviteEmail("");
      setLatestEmailInviteUrl(
        `${window.location.origin}/study-rooms/invite/${encodeURIComponent(
          result.accept_token
        )}`
      );
      setInviteNotice(
        "Invitation saved securely. Email delivery is not connected yet, so copy the link and send it to your classmate."
      );
    } catch (error) {
      setInviteError(
        error instanceof Error
          ? error.message
          : "Could not create the invitation."
      );
    } finally {
      setInviteAction(null);
    }
  }

  async function removeInvite(
    email: string
  ) {
    const invitation =
      emailInvitations.find(
        (item) =>
          item.status === "pending" &&
          item.invited_email === email
      );

    if (!invitation) return;

    const actionKey =
      `revoke-email-${invitation.id}`;

    setInviteAction(actionKey);
    setInviteError("");
    setInviteNotice("");

    try {
      const result =
        await revokeRoomEmailInvitation(
          studyRoomId,
          invitation.id
        );

      setEmailInvitations((current) =>
        current.map((item) =>
          item.id === invitation.id
            ? result.invitation
            : item
        )
      );

      setInviteNotice(
        "Invitation revoked."
      );
    } catch (error) {
      setInviteError(
        error instanceof Error
          ? error.message
          : "Could not revoke the invitation."
      );
    } finally {
      setInviteAction(null);
    }
  }

  async function copyLatestEmailInviteLink() {
    if (!latestEmailInviteUrl) return;

    try {
      await copyTextToClipboard(
        latestEmailInviteUrl
      );

      setInviteNotice(
        "Secure invitation link copied."
      );
      setInviteError("");
    } catch {
      setInviteError(
        "Could not copy the link. Select and copy it manually."
      );
    }
  }

  async function createShareLink() {
    setInviteAction("create-share-link");
    setShareLinkError("");
    setShareLinkNotice("");
    setLatestShareUrl("");

    try {
      const result =
        await createRoomInviteLink(
          studyRoomId,
          "member",
          7,
          10
        );

      setShareLinks((current) => [
        result.link,
        ...current.filter(
          (link) =>
            link.id !== result.link.id
        ),
      ]);

      setLatestShareUrl(
        `${window.location.origin}/study-rooms/join/${encodeURIComponent(
          result.share_token
        )}`
      );

      setShareLinkNotice(
        "Secure room link created. Up to 10 classmates can use it before it closes."
      );
    } catch (error) {
      setShareLinkError(
        error instanceof Error
          ? error.message
          : "Could not create the room link."
      );
    } finally {
      setInviteAction(null);
    }
  }

  async function revokeShareLink(
    linkId: number
  ) {
    const actionKey =
      `revoke-link-${linkId}`;

    setInviteAction(actionKey);
    setShareLinkError("");
    setShareLinkNotice("");

    try {
      const result =
        await revokeRoomInviteLink(
          studyRoomId,
          linkId
        );

      setShareLinks((current) =>
        current.map((link) =>
          link.id === linkId
            ? result.link
            : link
        )
      );

      setShareLinkNotice(
        "Room link revoked. It can no longer be used."
      );

      setLatestShareUrl("");
    } catch (error) {
      setShareLinkError(
        error instanceof Error
          ? error.message
          : "Could not revoke the room link."
      );
    } finally {
      setInviteAction(null);
    }
  }

  async function copyLatestShareLink() {
    if (!latestShareUrl) return;

    try {
      await copyTextToClipboard(
        latestShareUrl
      );

      setShareLinkNotice(
        "Room link copied."
      );
      setShareLinkError("");
    } catch {
      setShareLinkError(
        "Could not copy the link. Select and copy it manually."
      );
    }
  }

  async function sendSharedMessage(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanMessage =
      chatDraft.trim();

    if (
      !cleanMessage ||
      !canSendMessages ||
      messageSending
    ) {
      return;
    }

    setMessageSending(true);
    setMessageError("");

    try {
      const created =
        await createRoomMessage(
          studyRoomId,
          cleanMessage
        );

      setRoomMessages((current) => {
        const next = [
          ...current.filter(
            (message) =>
              message.id !== created.id
          ),
          created,
        ];

        return next.sort(
          (left, right) =>
            left.id - right.id
        );
      });

      setChatDraft("");
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : "Could not send the message."
      );
    } finally {
      setMessageSending(false);
    }
  }

  function startEditingMessage(
    message: RoomMessage
  ) {
    if (
      message.is_deleted ||
      currentUser?.id !== message.sender_id
    ) {
      return;
    }

    setEditingMessageId(message.id);
    setEditMessageDraft(message.content);
    setPendingDeleteMessageId(null);
    setMessageError("");
  }

  function cancelEditingMessage() {
    setEditingMessageId(null);
    setEditMessageDraft("");
  }

  function requestDeleteMessage(
    messageId: number
  ) {
    setPendingDeleteMessageId(messageId);
    setEditingMessageId(null);
    setEditMessageDraft("");
    setMessageError("");
  }

  function cancelDeleteMessage() {
    setPendingDeleteMessageId(null);
  }

  async function saveEditedMessage(
    messageId: number
  ) {
    const cleanMessage =
      editMessageDraft.trim();

    if (
      !cleanMessage ||
      messageActionId !== null
    ) {
      return;
    }

    setMessageActionId(messageId);
    setMessageError("");

    try {
      const updated =
        await updateRoomMessage(
          studyRoomId,
          messageId,
          cleanMessage
        );

      setRoomMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? updated
            : message
        )
      );

      setEditingMessageId(null);
      setEditMessageDraft("");
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : "Could not update the message."
      );
    } finally {
      setMessageActionId(null);
    }
  }

  async function removeSharedMessage(
    messageId: number
  ) {
    if (messageActionId !== null) {
      return;
    }

    setMessageActionId(messageId);
    setMessageError("");

    try {
      const deleted =
        await deleteRoomMessage(
          studyRoomId,
          messageId
        );

      setRoomMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? deleted
            : message
        )
      );

      setPendingDeleteMessageId(null);

      if (editingMessageId === messageId) {
        setEditingMessageId(null);
        setEditMessageDraft("");
      }
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : "Could not delete the message."
      );
    } finally {
      setMessageActionId(null);
    }
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
                {currentRoleLabel || "Member"}
              </span>

              {canManageInvitations ? (
                <>
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-slate-300">
                    {pendingInvites.length} pending invitation
                    {pendingInvites.length === 1
                      ? ""
                      : "s"}
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-slate-300">
                    {activeShareLinks.length} active room link
                    {activeShareLinks.length === 1
                      ? ""
                      : "s"}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4">
            {canManageInvitations ? (
              <>
                <p className="text-sm font-black text-yellow-100">
                  Grow this focused study group
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Invite one or two classmates to study from the same room.
                </p>

                <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-slate-400">
                  Durable invitations are connected. Email delivery is still
                  coming, so StudySnap gives you a secure link to share manually.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-black text-yellow-100">
                  You joined this Study Room
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-300">
                  You can now learn from the room content and use the tools
                  available to your role.
                </p>

                <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-slate-400">
                  Your room role is {currentRoleLabel || "Member"}. Invitation
                  management stays with the room owner or an admin.
                </p>
              </>
            )}
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

          <section className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/80">
            <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-yellow-300 text-lg font-black text-slate-950">
                  {roomTitle
                    .trim()
                    .charAt(0)
                    .toUpperCase() || "S"}
                </div>

                <div>
                  <p className="font-black text-white">
                    {roomTitle}
                  </p>
                  <p className="text-xs text-slate-400">
                    Shared study conversation
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-black text-emerald-100">
                  Shared chat
                </span>

                <button
                  type="button"
                  onClick={onOpenAiTutor}
                  className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15"
                >
                  ✨ Ask AI
                </button>
              </div>
            </div>

            <div className="min-h-[28rem] max-h-[62vh] overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.05),transparent_38%)] px-4 py-5 sm:px-5">
              {messageLoading ? (
                <div className="flex min-h-72 items-center justify-center text-sm font-semibold text-slate-400">
                  Opening the shared conversation...
                </div>
              ) : roomMessages.length ? (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Today
                    </span>
                  </div>

                  {roomMessages.map(
                    (message) => {
                      const isMine =
                        currentUser?.id ===
                        message.sender_id;

                      const senderName =
                        isMine
                          ? "You"
                          : message.sender
                              ?.full_name ||
                            "Study Room member";

                      const senderInitial =
                        senderName
                          .trim()
                          .charAt(0)
                          .toUpperCase() ||
                        "S";

                      return (
                        <div
                          key={message.id}
                          className={`flex items-end gap-2 ${
                            isMine
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          {!isMine ? (
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cyan-300/15 text-xs font-black text-cyan-100">
                              {senderInitial}
                            </div>
                          ) : null}

                          <div
                            className={`max-w-[86%] rounded-2xl border px-3.5 py-3 sm:max-w-[72%] ${
                              isMine
                                ? "rounded-br-md border-yellow-300/20 bg-yellow-300/10"
                                : "rounded-bl-md border-white/10 bg-white/[0.06]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <p
                                className={`text-[10px] font-black uppercase tracking-[0.15em] ${
                                  isMine
                                    ? "text-yellow-100"
                                    : "text-cyan-100"
                                }`}
                              >
                                {senderName}
                              </p>

                              <p className="text-[10px] text-slate-500">
                                {formatActivityTime(
                                  message.created_at ||
                                    ""
                                )}
                              </p>
                            </div>

                            {editingMessageId ===
                              message.id &&
                            !message.is_deleted ? (
                              <div className="mt-2">
                                <textarea
                                  autoFocus
                                  value={
                                    editMessageDraft
                                  }
                                  onChange={(event) =>
                                    setEditMessageDraft(
                                      event.target
                                        .value
                                    )
                                  }
                                  onKeyDown={(
                                    event
                                  ) => {
                                    if (
                                      event.key ===
                                      "Escape"
                                    ) {
                                      cancelEditingMessage();
                                    }

                                    if (
                                      event.key ===
                                        "Enter" &&
                                      (event.ctrlKey ||
                                        event.metaKey)
                                    ) {
                                      event.preventDefault();

                                      void saveEditedMessage(
                                        message.id
                                      );
                                    }
                                  }}
                                  rows={3}
                                  disabled={
                                    messageActionId ===
                                    message.id
                                  }
                                  className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-cyan-300/35 disabled:opacity-60"
                                />

                                <div className="mt-2 flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={
                                      cancelEditingMessage
                                    }
                                    disabled={
                                      messageActionId ===
                                      message.id
                                    }
                                    className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      void saveEditedMessage(
                                        message.id
                                      )
                                    }
                                    disabled={
                                      !editMessageDraft.trim() ||
                                      messageActionId ===
                                        message.id
                                    }
                                    className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {messageActionId ===
                                    message.id
                                      ? "Saving..."
                                      : "Save"}
                                  </button>
                                </div>

                                <p className="mt-2 text-right text-[10px] text-slate-500">
                                  Ctrl or Cmd + Enter
                                  saves · Esc cancels
                                </p>
                              </div>
                            ) : message.is_deleted ? (
                              <p className="mt-2 text-sm italic text-slate-500">
                                This message was
                                deleted.
                              </p>
                            ) : (
                              <>
                                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">
                                  {message.content}
                                </p>

                                <div className="mt-2 flex min-h-5 items-center justify-between gap-3">
                                  {message.edited_at ? (
                                    <p className="text-[10px] text-slate-500">
                                      Edited
                                    </p>
                                  ) : (
                                    <span />
                                  )}

                                  {isMine ? (
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          startEditingMessage(
                                            message
                                          )
                                        }
                                        disabled={
                                          messageActionId ===
                                          message.id
                                        }
                                        className="rounded-md px-2 py-1 text-[10px] font-black text-slate-400 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
                                      >
                                        Edit
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          requestDeleteMessage(
                                            message.id
                                          )
                                        }
                                        disabled={
                                          messageActionId ===
                                          message.id
                                        }
                                        className="rounded-md px-2 py-1 text-[10px] font-black text-red-300/80 transition hover:bg-red-300/10 hover:text-red-200 disabled:opacity-50"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  ) : null}
                                </div>

                                {isMine &&
                                pendingDeleteMessageId ===
                                  message.id ? (
                                  <div className="mt-2 rounded-xl border border-red-300/20 bg-red-300/10 p-3">
                                    <p className="text-xs font-bold text-red-100">
                                      Delete this
                                      message?
                                    </p>

                                    <p className="mt-1 text-[10px] leading-4 text-red-100/70">
                                      The conversation
                                      will show that the
                                      message was deleted.
                                    </p>

                                    <div className="mt-2 flex justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={
                                          cancelDeleteMessage
                                        }
                                        disabled={
                                          messageActionId ===
                                          message.id
                                        }
                                        className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50"
                                      >
                                        Cancel
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          void removeSharedMessage(
                                            message.id
                                          )
                                        }
                                        disabled={
                                          messageActionId ===
                                          message.id
                                        }
                                        className="rounded-lg border border-red-300/20 bg-red-300/10 px-3 py-1.5 text-[10px] font-black text-red-100 transition hover:bg-red-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {messageActionId ===
                                        message.id
                                          ? "Deleting..."
                                          : "Delete message"}
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              ) : (
                <div className="flex min-h-72 items-center justify-center text-center">
                  <div className="max-w-md">
                    <p className="text-4xl">
                      💬
                    </p>

                    <p className="mt-3 text-base font-black text-white">
                      Start the group conversation
                    </p>

                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Ask a classmate a question, choose what to study, or bring StudySnap AI in when the group needs help.
                    </p>

                    {canSendMessages ? (
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {starterPrompts.map(
                          (prompt) => (
                            <button
                              key={prompt}
                              type="button"
                              onClick={() =>
                                setChatDraft(
                                  prompt
                                )
                              }
                              className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-yellow-300/25 hover:text-white"
                            >
                              {prompt}
                            </button>
                          )
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-white/10 bg-slate-950/95 p-3 sm:p-4">
              {messageError ? (
                <p className="mb-3 rounded-xl border border-red-300/20 bg-red-300/10 px-3 py-2 text-xs font-semibold text-red-200">
                  {messageError}
                </p>
              ) : null}

              <form
                onSubmit={sendSharedMessage}
                className="flex items-end gap-2"
              >
                <button
                  type="button"
                  title="Shared learning attachments are coming next"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-xl text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
                >
                  ＋
                </button>

                <textarea
                  value={chatDraft}
                  onChange={(event) =>
                    setChatDraft(
                      event.target.value
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey
                    ) {
                      event.preventDefault();
                      event.currentTarget.form
                        ?.requestSubmit();
                    }
                  }}
                  disabled={
                    !canSendMessages ||
                    messageSending
                  }
                  placeholder={
                    canSendMessages
                      ? "Message the study group..."
                      : "Your room role can read this conversation."
                  }
                  rows={1}
                  className="min-h-11 flex-1 resize-none rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-5 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
                />

                <button
                  type="button"
                  onClick={onOpenAiTutor}
                  title="Bring StudySnap AI into your study"
                  className="hidden h-11 shrink-0 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15 sm:block"
                >
                  ✨ AI
                </button>

                <button
                  type="submit"
                  disabled={
                    !canSendMessages ||
                    !chatDraft.trim() ||
                    messageSending
                  }
                  className="grid h-11 min-w-11 shrink-0 place-items-center rounded-xl bg-yellow-300 px-3 text-sm font-black text-slate-950 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {messageSending
                    ? "..."
                    : "➤"}
                </button>
              </form>

              <p className="mt-2 px-1 text-[10px] leading-4 text-slate-500">
                StudySnap AI stays quiet unless someone chooses Ask AI. Press Shift + Enter for a new line.
              </p>
            </div>
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
                    {currentRoleLabel || "Member"} · Active now
                  </p>
                </div>

                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              </div>
            </div>

            {canManageInvitations &&
            pendingInvites.length ? (
              <div className="mt-3 space-y-2">
                {pendingInvites.map(
                  (invite) => (
                    <div
                      key={invite.id}
                      className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">
                            {invite.email}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {invite.role === "ai_tutor"
                              ? "AI Tutor"
                              : invite.role.charAt(0).toUpperCase() +
                                invite.role.slice(1)}{" "}
                            · Pending
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            void removeInvite(
                              invite.email
                            )
                          }
                          disabled={
                            inviteAction ===
                            `revoke-email-${invite.id}`
                          }
                          className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black text-slate-400 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {inviteAction ===
                          `revoke-email-${invite.id}`
                            ? "Revoking..."
                            : "Revoke"}
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : null}
          </section>

          {canManageInvitations ? (
            <>
          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
              Invite classmates
            </p>

            <h3 className="mt-2 text-lg font-black text-white">
              Build a small study group
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Create a durable invitation for a classmate. Until email delivery
              is connected, copy the secure link and send it yourself.
            </p>

            <form
              onSubmit={prepareInvite}
              className="mt-4"
            >
              <input
                type="email"
                value={inviteEmail}
                disabled={
                  inviteAction ===
                  "create-email"
                }
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
                disabled={
                  inviteAction ===
                  "create-email"
                }
                className="mt-3 w-full rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {inviteAction ===
                "create-email"
                  ? "Creating invitation..."
                  : "Create secure invitation"}
              </button>
            </form>

            {inviteLoading ? (
              <p className="mt-3 text-xs font-semibold text-slate-500">
                Loading room invitations...
              </p>
            ) : null}

            {invitationLoadError ? (
              <p className="mt-3 rounded-xl border border-red-300/20 bg-red-300/10 px-3 py-2 text-xs font-semibold text-red-200">
                {invitationLoadError}
              </p>
            ) : null}

            {inviteNotice ? (
              <p className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-semibold leading-5 text-emerald-100">
                {inviteNotice}
              </p>
            ) : null}

            {latestEmailInviteUrl ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Secure invite link
                </p>

                <p className="mt-2 break-all text-xs leading-5 text-slate-300">
                  {latestEmailInviteUrl}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    void copyLatestEmailInviteLink()
                  }
                  className="mt-3 w-full rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-300/15"
                >
                  Copy invitation link
                </button>
              </div>
            ) : null}
          </section>

          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-200">
                  Shareable room link
                </p>

                <h3 className="mt-2 text-lg font-black text-white">
                  Invite classmates with one link
                </h3>
              </div>

              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-black text-emerald-100">
                Secure
              </span>
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Create a link that up to 10 classmates can use. You can revoke it at any time.
            </p>

            <button
              type="button"
              onClick={() =>
                void createShareLink()
              }
              disabled={
                inviteAction ===
                "create-share-link"
              }
              className="mt-4 w-full rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {inviteAction ===
              "create-share-link"
                ? "Creating room link..."
                : "Create shareable room link"}
            </button>

            {shareLinkError ? (
              <p className="mt-3 rounded-xl border border-red-300/20 bg-red-300/10 px-3 py-2 text-xs font-semibold leading-5 text-red-200">
                {shareLinkError}
              </p>
            ) : null}

            {shareLinkNotice ? (
              <p className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-semibold leading-5 text-emerald-100">
                {shareLinkNotice}
              </p>
            ) : null}

            {latestShareUrl ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  New room link
                </p>

                <p className="mt-2 break-all text-xs leading-5 text-slate-300">
                  {latestShareUrl}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    void copyLatestShareLink()
                  }
                  className="mt-3 w-full rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15"
                >
                  Copy room link
                </button>

                <p className="mt-2 text-[10px] leading-4 text-slate-500">
                  Save this link now. For security, StudySnap does not show the full link again after refresh.
                </p>
              </div>
            ) : null}

            {activeShareLinks.length ? (
              <div className="mt-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Active links
                </p>

                {activeShareLinks.map(
                  (link) => {
                    const maximumUses =
                      link.max_uses;

                    const remainingUses =
                      maximumUses === null
                        ? null
                        : Math.max(
                            maximumUses -
                              link.use_count,
                            0
                          );

                    return (
                      <div
                        key={link.id}
                        className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-white">
                              Member room link
                            </p>

                            <p className="mt-1 text-xs leading-5 text-slate-400">
                              Used {link.use_count}
                              {maximumUses === null
                                ? " times"
                                : ` of ${maximumUses} times`}
                              {remainingUses === null
                                ? ""
                                : ` · ${remainingUses} remaining`}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              void revokeShareLink(
                                link.id
                              )
                            }
                            disabled={
                              inviteAction ===
                              `revoke-link-${link.id}`
                            }
                            className="rounded-lg border border-red-300/15 bg-red-300/5 px-2.5 py-1.5 text-[10px] font-black text-red-200 transition hover:bg-red-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {inviteAction ===
                            `revoke-link-${link.id}`
                              ? "Revoking..."
                              : "Revoke"}
                          </button>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-slate-500">
                No active room links yet.
              </p>
            )}
          </section>

            </>
          ) : (
            <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-200">
                Your room access
              </p>

              <h3 className="mt-2 text-lg font-black text-white">
                You are connected as {currentRoleLabel || "Member"}
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                You can use the shared learning tools allowed by your role.
                Only the room owner or an admin can invite or remove classmates.
              </p>

              <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-3 text-xs font-semibold leading-5 text-emerald-100">
                No invitation controls are needed here. Open the shared
                materials, notes, Concept Cards, quizzes, or room AI to begin.
              </div>
            </section>
          )}

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
          Shared collaboration is connected
        </p>

        <p className="mt-2 text-sm leading-6 text-slate-300">
          Secure invitations, room links, member roles, and durable shared
          messages are now connected. Live member presence, attachments, and
          the room activity feed are the next collaboration upgrades.
        </p>
      </section>
    </div>
  );
}
