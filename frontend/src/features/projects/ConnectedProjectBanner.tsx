"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getStudyRooms } from "@/lib/api";
import {
  ensureProjectRoomIdInUrl,
  getActiveProjectRoomId,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";

type StudyRoom = {
  id: number;
  name: string;
  subject: string;
  description?: string | null;
};

type ConnectedProjectBannerProps = {
  toolName: string;
  toolIcon: string;
  description: string;
};

export default function ConnectedProjectBanner({
  toolName,
  toolIcon,
  description,
}: ConnectedProjectBannerProps) {
  const [roomId, setRoomId] = useState<number | null>(null);
  const [room, setRoom] = useState<StudyRoom | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const requestedRoomId = getActiveProjectRoomId();

    if (requestedRoomId === null) {
      return;
    }

    saveProjectRoomId(requestedRoomId);
    ensureProjectRoomIdInUrl(requestedRoomId);
    setRoomId(requestedRoomId);

    let mounted = true;

    async function loadConnectedRoom() {
      try {
        setLoading(true);

        const data = await getStudyRooms();
        const rooms: StudyRoom[] = Array.isArray(data) ? data : [];
        const foundRoom = rooms.find((item) => item.id === requestedRoomId) || null;

        if (mounted) {
          setRoom(foundRoom);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadConnectedRoom();

    return () => {
      mounted = false;
    };
  }, []);

  if (roomId === null) return null;

  const roomName = room?.name || `Project #${roomId}`;
  const roomSubject = room?.subject || "Study room";

  return (
    <section className="mb-6 overflow-hidden rounded-[1.7rem] border border-yellow-400/25 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.16),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-yellow-100">
              Connected Project
            </span>

            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-bold text-slate-300">
              {loading ? "Loading room..." : roomSubject}
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight text-white">
            {toolIcon} {toolName} is connected to {roomName}
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
            {description}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/study-rooms/${roomId}`}
            className="rounded-2xl border border-yellow-400/30 bg-yellow-400/15 px-4 py-3 text-center text-sm font-black text-yellow-100 transition hover:bg-yellow-400/25"
          >
            ← Back to Project
          </Link>

          <Link
            href={`/study-rooms/${roomId}`}
            className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-center text-sm font-black text-white transition hover:bg-white/[0.08]"
          >
            Open Project AI
          </Link>
        </div>
      </div>
    </section>
  );
}
