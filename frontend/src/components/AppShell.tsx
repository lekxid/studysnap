"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";

import CommandBar from "@/components/CommandBar";
import NotificationBell from "@/components/NotificationBell";
import {
  getSavedProjectRoomId,
  PROJECT_ROOM_CHANGED_EVENT,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";
import { getStudyRooms, signOutCurrentSession } from "@/lib/api";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

type RoomSummary = {
  id: number;
  name: string;
};

const primaryNavItems: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/study-rooms", label: "Study Rooms", icon: "📁" },
  {
    href: "/study-rooms/organize",
    label: "Smart Organizer",
    icon: "🗂️",
  },
];

const studyToolNavItems: NavItem[] = [
  { href: "/notes", label: "Notes", icon: "▣" },
  { href: "/flashcards", label: "Concept Cards", icon: "◫" },
  { href: "/quizzes", label: "Quizzes", icon: "▤" },
  { href: "/planner", label: "Planner", icon: "◷" },
  { href: "/progress", label: "Progress", icon: "▲" },
  { href: "/ai-tutor", label: "AI Tutor", icon: "✦" },
];

const moreNavItems: NavItem[] = [
  { href: "/onboarding", label: "Learning Setup", icon: "◎" },
  { href: "/brain", label: "AI Memory", icon: "🧠" },
  { href: "/groups", label: "Study Groups", icon: "👥" },
];

const projectAwareNavHrefs = new Set([
  "/notes",
  "/flashcards",
  "/quizzes",
  "/planner",
]);

function isNavItemActive(pathname: string, href: string) {
  if (href === "/study-rooms") {
    return pathname === "/study-rooms" || /^\/study-rooms\/\d+/.test(pathname);
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function isAnyNavItemActive(pathname: string, items: NavItem[]) {
  return items.some((item) => isNavItemActive(pathname, item.href));
}

function getRoomIdFromStudyRoomPath(pathname: string) {
  const match = pathname.match(/^\/study-rooms\/(\d+)/);
  const roomId = Number(match?.[1]);

  return Number.isFinite(roomId) && roomId > 0 ? roomId : null;
}

function getPageKicker(pathname: string) {
  if (pathname.startsWith("/study-rooms")) return "StudySnap Projects";
  if (pathname.startsWith("/notes")) return "Connected Notes";
  if (pathname.startsWith("/flashcards")) return "Concept Cards";
  if (pathname.startsWith("/quizzes")) return "Exam Practice";
  if (pathname.startsWith("/planner")) return "Study Planning";
  if (pathname.startsWith("/progress")) return "Learning Analytics";
  if (pathname.startsWith("/brain")) return "AI Memory";
  if (pathname.startsWith("/groups")) return "Study Together";
  if (pathname.startsWith("/settings")) return "Workspace Settings";
  if (pathname.startsWith("/ai-tutor")) return "AI Tutor";
  if (pathname.startsWith("/onboarding")) return "Learning Setup";

  return "Focus Mode";
}

function getStoredUserName() {
  if (typeof window === "undefined") return "StudySnap Learner";

  try {
    const possibleKeys = [
      "studysnap_user",
      "studysnap:user",
      "user",
      "auth_user",
    ];

    for (const key of possibleKeys) {
      const raw = localStorage.getItem(key);

      if (!raw) continue;

      const parsed = JSON.parse(raw);

      if (
        typeof parsed?.full_name === "string" &&
        parsed.full_name.trim()
      ) {
        return parsed.full_name.trim();
      }

      if (typeof parsed?.name === "string" && parsed.name.trim()) {
        return parsed.name.trim();
      }

      if (typeof parsed?.email === "string" && parsed.email.trim()) {
        return parsed.email.trim();
      }
    }
  } catch {
    return "StudySnap Learner";
  }

  return "StudySnap Learner";
}

function getInitials(name: string) {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "S";

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const [studyToolsOpen, setStudyToolsOpen] = useState(() =>
    isAnyNavItemActive(pathname, studyToolNavItems)
  );
  const [moreOpen, setMoreOpen] = useState(() =>
    isAnyNavItemActive(pathname, moreNavItems)
  );

  const [activeProjectRoomId, setActiveProjectRoomId] = useState<
    number | null
  >(null);

  const [studyRooms, setStudyRooms] = useState<RoomSummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState("");
  const [learnerName, setLearnerName] = useState("StudySnap Learner");

  useEffect(() => {
    setLearnerName(getStoredUserName());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStudyRooms() {
      try {
        setRoomsLoading(true);
        setRoomsError("");

        const rooms = await getStudyRooms();

        if (cancelled) return;

        setStudyRooms(
          rooms.map((room) => ({
            id: room.id,
            name: room.name?.trim() || `Room #${room.id}`,
          }))
        );
      } catch {
        if (!cancelled) {
          setRoomsError("Rooms could not be loaded.");
        }
      } finally {
        if (!cancelled) {
          setRoomsLoading(false);
        }
      }
    }

    void loadStudyRooms();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const roomIdFromPath = getRoomIdFromStudyRoomPath(pathname);

    if (roomIdFromPath !== null) {
      const savedRoomId = saveProjectRoomId(roomIdFromPath);
      setActiveProjectRoomId(savedRoomId);
    } else {
      setActiveProjectRoomId(getSavedProjectRoomId());
    }

    if (isAnyNavItemActive(pathname, studyToolNavItems)) {
      setStudyToolsOpen(true);
    }

    if (isAnyNavItemActive(pathname, moreNavItems)) {
      setMoreOpen(true);
    }

    setRoomMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleProjectRoomChanged(event: Event) {
      const roomEvent = event as CustomEvent<{ roomId?: number }>;
      const nextRoomId =
        roomEvent.detail?.roomId ?? getSavedProjectRoomId();

      setActiveProjectRoomId(nextRoomId);
    }

    window.addEventListener(
      PROJECT_ROOM_CHANGED_EVENT,
      handleProjectRoomChanged
    );

    return () => {
      window.removeEventListener(
        PROJECT_ROOM_CHANGED_EVENT,
        handleProjectRoomChanged
      );
    };
  }, []);

  const learnerInitials = useMemo(() => {
    return getInitials(learnerName);
  }, [learnerName]);

  const activeRoom = useMemo(() => {
    if (activeProjectRoomId === null) return null;

    return (
      studyRooms.find((room) => room.id === activeProjectRoomId) ?? null
    );
  }, [activeProjectRoomId, studyRooms]);

  const recentRooms = useMemo(() => {
    const currentRoom = studyRooms.find(
      (room) => room.id === activeProjectRoomId
    );

    const otherRooms = studyRooms.filter(
      (room) => room.id !== activeProjectRoomId
    );

    return [
      ...(currentRoom ? [currentRoom] : []),
      ...otherRooms,
    ].slice(0, 6);
  }, [activeProjectRoomId, studyRooms]);

  const currentRoomLabel =
    activeRoom?.name ||
    (activeProjectRoomId
      ? `Room #${activeProjectRoomId}`
      : "Choose a study room");

  function getConnectedHref(href: string) {
    if (
      !projectAwareNavHrefs.has(href) ||
      activeProjectRoomId === null
    ) {
      return href;
    }

    return `${href}?roomId=${activeProjectRoomId}`;
  }

  function handleChooseRoom(room: RoomSummary) {
    const savedRoomId = saveProjectRoomId(room.id);

    setActiveProjectRoomId(savedRoomId);
    setRoomMenuOpen(false);
    setMobileMenuOpen(false);
    router.push(`/study-rooms/${room.id}`);
  }

  async function handleLogout() {
    await signOutCurrentSession();
    router.push("/login");
  }

  function renderNavItems(items: NavItem[], closeMobile = false) {
    return items.map((item) => {
      const active = isNavItemActive(pathname, item.href);
      const connectedHref = getConnectedHref(item.href);

      return (
        <Link
          key={item.href}
          href={connectedHref}
          aria-current={active ? "page" : undefined}
          onClick={() => {
            if (closeMobile) setMobileMenuOpen(false);
          }}
          className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-black transition ${
            active
              ? "border border-yellow-300/50 bg-yellow-300/20 text-yellow-100 shadow-[0_0_32px_rgba(250,204,21,0.18)]"
              : "text-slate-200 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg ${
              active
                ? "bg-yellow-300 text-black"
                : "bg-white/[0.06] text-slate-200"
            }`}
          >
            {item.icon}
          </span>

          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </Link>
      );
    });
  }

  function renderExpandableNav({
    title: sectionTitle,
    icon,
    items,
    open,
    onToggle,
    closeMobile = false,
  }: {
    title: string;
    icon: string;
    items: NavItem[];
    open: boolean;
    onToggle: () => void;
    closeMobile?: boolean;
  }) {
    const sectionActive = isAnyNavItemActive(pathname, items);

    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black transition ${
            sectionActive
              ? "bg-yellow-300/10 text-yellow-100"
              : "text-slate-300 hover:bg-white/[0.05] hover:text-white"
          }`}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.06]">
            {icon}
          </span>

          <span className="min-w-0 flex-1">{sectionTitle}</span>

          <span
            className={`text-xs transition-transform ${
              open ? "rotate-180" : ""
            }`}
          >
            ▾
          </span>
        </button>

        {open ? (
          <div className="mt-1 space-y-1">
            {renderNavItems(items, closeMobile)}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#05080d] text-white">
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[280px] overflow-hidden border-r border-white/10 bg-[#061018] px-4 py-5 lg:flex lg:flex-col">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-3">
          <span className="text-4xl text-yellow-300">★</span>

          <span className="text-2xl font-black tracking-tight text-white">
            StudySnap <span className="text-yellow-300">AI</span>
          </span>
        </Link>

        <div className="relative mt-5 shrink-0">
          <button
            type="button"
            aria-expanded={roomMenuOpen}
            aria-haspopup="menu"
            onClick={() => setRoomMenuOpen((current) => !current)}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-yellow-300/25 hover:bg-white/[0.06]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Current room
                </p>

                <p className="mt-1 truncate text-sm font-black text-white">
                  {currentRoomLabel}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  {activeProjectRoomId
                    ? "Your study tools stay connected here."
                    : "Choose where you want to study."}
                </p>
              </div>

              <span
                className={`shrink-0 text-sm text-slate-400 transition-transform ${
                  roomMenuOpen ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            </div>
          </button>

          {roomMenuOpen ? (
            <div
              role="menu"
              className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#08131d] p-2 shadow-2xl shadow-black/60"
            >
              <p className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Switch study room
              </p>

              {roomsLoading ? (
                <p className="rounded-xl px-3 py-3 text-xs text-slate-400">
                  Loading your rooms...
                </p>
              ) : roomsError ? (
                <p className="rounded-xl px-3 py-3 text-xs text-red-200">
                  {roomsError}
                </p>
              ) : recentRooms.length ? (
                <div className="space-y-1">
                  {recentRooms.map((room) => {
                    const selected = room.id === activeProjectRoomId;

                    return (
                      <button
                        key={room.id}
                        type="button"
                        role="menuitem"
                        onClick={() => handleChooseRoom(room)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-black transition ${
                          selected
                            ? "bg-yellow-300 text-black"
                            : "text-slate-200 hover:bg-white/[0.07] hover:text-white"
                        }`}
                      >
                        <span
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                            selected
                              ? "bg-black/15"
                              : "bg-white/[0.06]"
                          }`}
                        >
                          📚
                        </span>

                        <span className="min-w-0 flex-1 truncate">
                          {room.name}
                        </span>

                        {selected ? <span>✓</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl px-3 py-3 text-xs text-slate-400">
                  No study rooms yet.
                </p>
              )}

              <div className="mt-2 border-t border-white/10 pt-2">
                <Link
                  href="/study-rooms"
                  onClick={() => setRoomMenuOpen(false)}
                  className="flex items-center justify-center rounded-xl bg-white/[0.06] px-3 py-2.5 text-xs font-black text-white transition hover:bg-white/[0.1]"
                >
                  View all study rooms →
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <nav className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            {renderNavItems(primaryNavItems)}
          </div>

          <div className="mt-3">
            {renderExpandableNav({
              title: "Study Tools",
              icon: "✦",
              items: studyToolNavItems,
              open: studyToolsOpen,
              onToggle: () =>
                setStudyToolsOpen((current) => !current),
            })}
          </div>

          <div className="mt-2">
            {renderExpandableNav({
              title: "More",
              icon: "•••",
              items: moreNavItems,
              open: moreOpen,
              onToggle: () => setMoreOpen((current) => !current),
            })}
          </div>
        </nav>

        <div className="shrink-0 border-t border-white/10 pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-xl border border-yellow-300/15 bg-yellow-300/10 px-3 py-2.5 text-left transition hover:bg-yellow-300/15"
          >
            <span>
              <span className="block text-xs font-black text-yellow-100">
                StudySnap Premium
              </span>

              <span className="mt-0.5 block text-[10px] text-slate-400">
                More AI and study tools
              </span>
            </span>

            <span className="text-yellow-200">→</span>
          </button>

          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-yellow-300 text-sm font-black text-black">
                {learnerInitials}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-white">
                  {learnerName}
                </p>

                <p className="text-[11px] font-bold text-slate-500">
                  Learning profile
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href="/settings"
                className={`rounded-xl px-3 py-2 text-center text-xs font-black transition ${
                  pathname.startsWith("/settings")
                    ? "bg-yellow-300 text-black"
                    : "bg-white/[0.06] text-slate-200 hover:bg-white/[0.09]"
                }`}
              >
                Settings
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-red-500/15 hover:text-red-100"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:ml-[280px]">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#05080d]/86 backdrop-blur-xl">
          <div className="mx-auto max-w-[1380px] px-5 py-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() =>
                    setMobileMenuOpen((current) => !current)
                  }
                  className="mb-3 inline-flex rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-black text-white lg:hidden"
                >
                  ☰ Menu
                </button>

                <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-300">
                  {getPageKicker(pathname)}
                </p>

                <h1 className="mt-2 text-[2.35rem] font-black leading-none tracking-tight text-white">
                  {title}
                </h1>

                {subtitle ? (
                  <p className="mt-2 max-w-4xl text-base leading-7 text-slate-400">
                    {subtitle}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                <CommandBar />

                <div className="grid h-12 min-w-12 place-items-center rounded-xl border border-white/10 bg-white/[0.04] px-3">
                  <NotificationBell />
                </div>

                <Link
                  href="/settings"
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white transition hover:bg-white/[0.08]"
                >
                  Settings
                </Link>
              </div>
            </div>
          </div>

          {mobileMenuOpen ? (
            <div className="max-h-[72vh] overflow-y-auto border-t border-white/10 bg-[#061018] px-4 py-4 lg:hidden">
              <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Current room
                </p>

                <p className="mt-1 text-sm font-black text-white">
                  {currentRoomLabel}
                </p>

                <Link
                  href={
                    activeProjectRoomId
                      ? `/study-rooms/${activeProjectRoomId}`
                      : "/study-rooms"
                  }
                  onClick={() => setMobileMenuOpen(false)}
                  className="mt-3 inline-flex rounded-xl bg-yellow-300 px-3 py-2 text-xs font-black text-black"
                >
                  {activeProjectRoomId
                    ? "Open room"
                    : "Choose a room"}
                </Link>
              </div>

              <nav className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  {renderNavItems(primaryNavItems, true)}
                </div>

                {renderExpandableNav({
                  title: "Study Tools",
                  icon: "✦",
                  items: studyToolNavItems,
                  open: studyToolsOpen,
                  onToggle: () =>
                    setStudyToolsOpen((current) => !current),
                  closeMobile: true,
                })}

                {renderExpandableNav({
                  title: "More",
                  icon: "•••",
                  items: moreNavItems,
                  open: moreOpen,
                  onToggle: () =>
                    setMoreOpen((current) => !current),
                  closeMobile: true,
                })}

                <div className="grid gap-2 pt-2 sm:grid-cols-2">
                  <Link
                    href="/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-black ${
                      pathname.startsWith("/settings")
                        ? "bg-yellow-300 text-black"
                        : "bg-white/[0.05] text-white"
                    }`}
                  >
                    <span>⚙</span>
                    <span>Settings</span>
                  </Link>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-3 text-left text-sm font-black text-white"
                  >
                    <span>↪</span>
                    <span>Logout</span>
                  </button>
                </div>
              </nav>
            </div>
          ) : null}
        </header>

        <main className="mx-auto max-w-[1380px] px-5 py-5">
          {children}
        </main>
      </div>
    </div>
  );
}
