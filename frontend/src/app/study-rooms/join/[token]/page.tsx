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
  getToken,
  joinRoomWithInviteLink,
  type RoomInvitationJoinResponse,
} from "@/lib/api";

type JoinState =
  | "ready"
  | "joining"
  | "joined"
  | "error";

export default function RoomInviteLinkPage() {
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
    useState<JoinState>("ready");

  const [error, setError] =
    useState("");

  const [
    joinedResult,
    setJoinedResult,
  ] =
    useState<RoomInvitationJoinResponse | null>(
      null
    );

  const [authReady, setAuthReady] =
    useState(false);

  const [signedIn, setSignedIn] =
    useState(false);

  useEffect(() => {
    setSignedIn(Boolean(getToken()));
    setAuthReady(true);
  }, []);

  const returnPath = useMemo(
    () =>
      `/study-rooms/join/${encodeURIComponent(
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

  async function joinRoom() {
    if (!token || state === "joining") {
      return;
    }

    setState("joining");
    setError("");

    try {
      const result =
        await joinRoomWithInviteLink(
          token
        );

      setJoinedResult(result);
      setState("joined");

      router.replace(
        `/study-rooms/${result.room.id}?tab=together`
      );
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : "Could not join this Study Room."
      );
      setState("error");
    }
  }

  function openJoinedRoom() {
    const roomId =
      joinedResult?.room.id;

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
        title="Invalid room link"
        subtitle="This room link is missing its secure token."
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
        badge="Shared Study Room"
        title="Join this Study Room"
        subtitle="Sign in or create a StudySnap account. StudySnap will bring you back to this room link afterward."
      >
        <div className="space-y-4">
          <div className="rounded-[1.2rem] border border-emerald-300/20 bg-emerald-300/10 px-4 py-4 text-sm leading-6 text-emerald-50">
            This secure link grants the room role
            chosen by the room owner. Expired,
            exhausted, or revoked links cannot be
            used.
          </div>

          <Link
            href={loginHref}
            className="premium-button block w-full rounded-[1.2rem] px-4 py-3.5 text-center text-sm font-black"
          >
            Sign in to join
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

  if (state === "joined") {
    const alreadyMember =
      joinedResult?.already_member;

    return (
      <AuthShell
        badge={
          alreadyMember
            ? "Room already connected"
            : "Study Room joined"
        }
        title={
          alreadyMember
            ? `Welcome back to ${
                joinedResult?.room.name ||
                "this Study Room"
              }`
            : `You joined ${
                joinedResult?.room.name ||
                "the Study Room"
              }`
        }
        subtitle={
          alreadyMember
            ? "This room was already connected to your StudySnap account."
            : "The shared room is now connected to your StudySnap account."
        }
      >
        <div className="space-y-4">
          <div className="rounded-[1.2rem] border border-emerald-300/20 bg-emerald-300/10 px-4 py-4">
            <p className="font-black text-emerald-100">
              {alreadyMember
                ? "Your membership is active"
                : "You are now a room member"}
            </p>

            <p className="mt-2 text-sm leading-6 text-emerald-50/80">
              Open the room to study from its
              shared materials, notes, Concept
              Cards, quizzes, and connected AI.
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

  return (
    <AuthShell
      badge="Shared Study Room"
      title="Join this Study Room"
      subtitle="The room owner shared a secure Study Together link with you."
    >
      <div className="space-y-4">
        <div className="rounded-[1.2rem] border border-cyan-300/20 bg-cyan-300/10 px-4 py-4">
          <p className="font-black text-cyan-100">
            Connected group learning
          </p>

          <p className="mt-2 text-sm leading-6 text-slate-300">
            Joining adds the room to your
            StudySnap workspace using the role
            selected by the room owner.
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
            void joinRoom()
          }
          disabled={state === "joining"}
          className="premium-button w-full rounded-[1.2rem] px-4 py-3.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "joining"
            ? "Joining Study Room..."
            : "Join and open room"}
        </button>

        <Link
          href="/study-rooms"
          className="block w-full rounded-[1.2rem] border border-white/10 bg-white/[0.05] px-4 py-3.5 text-center text-sm font-black text-slate-200 transition hover:bg-white/[0.08]"
        >
          Not now
        </Link>
      </div>
    </AuthShell>
  );
}
