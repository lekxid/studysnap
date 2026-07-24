"use client";

import Link from "next/link";
import {
  useParams,
  useRouter,
} from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import AuthShell from "@/components/auth/AuthShell";
import {
  acceptRoomEmailInvitation,
  declineRoomEmailInvitation,
  getToken,
  type RoomInvitationJoinResponse,
} from "@/lib/api";

type InvitationState =
  | "ready"
  | "accepting"
  | "declining"
  | "accepted"
  | "declined"
  | "error";

export default function RoomEmailInvitationPage() {
  const params = useParams();
  const router = useRouter();

  const rawToken = Array.isArray(params.token)
    ? params.token[0]
    : params.token;

  const token =
    typeof rawToken === "string"
      ? rawToken
      : "";

  const [state, setState] =
    useState<InvitationState>("ready");

  const [error, setError] =
    useState("");

  const [
    acceptedResult,
    setAcceptedResult,
  ] =
    useState<RoomInvitationJoinResponse | null>(
      null
    );

  const [authReady, setAuthReady] =
    useState(false);

  const [signedIn, setSignedIn] =
    useState(false);

  useEffect(() => {
    const isSignedIn = Boolean(getToken());

    const timer = window.setTimeout(() => {
      setSignedIn(isSignedIn);
      setAuthReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const returnPath = useMemo(
    () =>
      `/study-rooms/invite/${encodeURIComponent(
        token
      )}`,
    [token]
  );

  const loginHref =
    `/login?next=${encodeURIComponent(
      returnPath
    )}`;

  const signupHref =
    `/signup?next=${encodeURIComponent(
      returnPath
    )}`;

  async function acceptInvitation() {
    if (!token || state === "accepting") {
      return;
    }

    setState("accepting");
    setError("");

    try {
      const result =
        await acceptRoomEmailInvitation(
          token
        );

      setAcceptedResult(result);
      setState("accepted");
    } catch (inviteError) {
      setError(
        inviteError instanceof Error
          ? inviteError.message
          : "Could not accept this invitation."
      );
      setState("error");
    }
  }

  async function declineInvitation() {
    if (!token || state === "declining") {
      return;
    }

    setState("declining");
    setError("");

    try {
      await declineRoomEmailInvitation(
        token
      );

      setState("declined");
    } catch (inviteError) {
      setError(
        inviteError instanceof Error
          ? inviteError.message
          : "Could not decline this invitation."
      );
      setState("error");
    }
  }

  function openJoinedRoom() {
    const roomId =
      acceptedResult?.room.id;

    if (!roomId) {
      router.push("/study-rooms");
      return;
    }

    router.push(
      `/study-rooms/${roomId}?tab=together`
    );
  }

  if (!authReady) {
    return (
      <AuthShell
        badge="Study Together"
        title="Opening invitation"
        subtitle="Checking your StudySnap account..."
      >
        <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.05] px-4 py-4 text-center text-sm font-semibold text-slate-300">
          Loading secure room access...
        </div>
      </AuthShell>
    );
  }

  if (!token) {
    return (
      <AuthShell
        badge="Study Together"
        title="Invalid invitation"
        subtitle="This invitation link is missing its secure token."
      >
        <Link
          href="/study-rooms"
          className="premium-button block w-full rounded-[1.2rem] px-4 py-3.5 text-center text-sm font-black"
        >
          Open Study Rooms
        </Link>
      </AuthShell>
    );
  }

  if (!signedIn) {
    return (
      <AuthShell
        badge="Study Together invitation"
        title="Join this Study Room"
        subtitle="Sign in with the email address that received this invitation. StudySnap will bring you back here afterward."
      >
        <div className="space-y-4">
          <div className="rounded-[1.2rem] border border-cyan-300/20 bg-cyan-300/10 px-4 py-4 text-sm leading-6 text-cyan-50">
            This is a private email invitation.
            Only the invited StudySnap account can
            accept it.
          </div>

          <Link
            href={loginHref}
            className="premium-button block w-full rounded-[1.2rem] px-4 py-3.5 text-center text-sm font-black"
          >
            Sign in to respond
          </Link>

          <Link
            href={signupHref}
            className="block w-full rounded-[1.2rem] border border-white/10 bg-white/[0.05] px-4 py-3.5 text-center text-sm font-black text-white transition hover:bg-white/[0.08]"
          >
            Create a StudySnap account
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (state === "accepted") {
    return (
      <AuthShell
        badge="Invitation accepted"
        title={`You joined ${
          acceptedResult?.room.name ||
          "the Study Room"
        }`}
        subtitle="The room is now connected to your StudySnap account."
      >
        <div className="space-y-4">
          <div className="rounded-[1.2rem] border border-emerald-300/20 bg-emerald-300/10 px-4 py-4">
            <p className="font-black text-emerald-100">
              You are now a room member
            </p>

            <p className="mt-2 text-sm leading-6 text-emerald-50/80">
              You can open the shared materials,
              notes, Concept Cards, quizzes, and
              Study Together workspace allowed by
              your role.
            </p>
          </div>

          <button
            type="button"
            onClick={openJoinedRoom}
            className="premium-button w-full rounded-[1.2rem] px-4 py-3.5 text-sm font-black"
          >
            Open Study Room
          </button>
        </div>
      </AuthShell>
    );
  }

  if (state === "declined") {
    return (
      <AuthShell
        badge="Invitation declined"
        title="You declined this invitation"
        subtitle="You were not added to the Study Room."
      >
        <Link
          href="/study-rooms"
          className="block w-full rounded-[1.2rem] border border-white/10 bg-white/[0.05] px-4 py-3.5 text-center text-sm font-black text-white transition hover:bg-white/[0.08]"
        >
          Return to Study Rooms
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      badge="Study Together invitation"
      title="You were invited to a Study Room"
      subtitle="Accept to add the room to your StudySnap workspace, or decline if you do not recognize this invitation."
    >
      <div className="space-y-4">
        <div className="rounded-[1.2rem] border border-yellow-300/20 bg-yellow-300/10 px-4 py-4">
          <p className="font-black text-yellow-100">
            Private email invitation
          </p>

          <p className="mt-2 text-sm leading-6 text-slate-300">
            StudySnap checks that this invitation
            belongs to your signed-in account
            before granting room access.
          </p>
        </div>

        {error ? (
          <div className="rounded-[1.2rem] border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm font-semibold leading-6 text-red-200">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() =>
            void acceptInvitation()
          }
          disabled={
            state === "accepting" ||
            state === "declining"
          }
          className="premium-button w-full rounded-[1.2rem] px-4 py-3.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "accepting"
            ? "Joining Study Room..."
            : "Accept invitation"}
        </button>

        <button
          type="button"
          onClick={() =>
            void declineInvitation()
          }
          disabled={
            state === "accepting" ||
            state === "declining"
          }
          className="w-full rounded-[1.2rem] border border-white/10 bg-white/[0.05] px-4 py-3.5 text-sm font-black text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "declining"
            ? "Declining..."
            : "Decline invitation"}
        </button>
      </div>
    </AuthShell>
  );
}
