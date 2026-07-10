"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";

import CommandBar from "@/components/CommandBar";
import NotificationBell from "@/components/NotificationBell";
import {
  getSavedProjectRoomId,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";
import { signOutCurrentSession } from "@/lib/api";

const navItems = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/onboarding", label: "Onboarding", icon: "◎" },
  { href: "/study-rooms", label: "Study Rooms", icon: "📁" },
  { href: "/study-rooms/organize", label: "Smart Organizer", icon: "🗂️" },
  { href: "/notes", label: "Notes", icon: "▣" },
  { href: "/flashcards", label: "Flashcards", icon: "◫" },
  { href: "/quizzes", label: "Quizzes", icon: "▤" },
  { href: "/planner", label: "Planner", icon: "◷" },
  { href: "/progress", label: "Progress", icon: "▲" },
  { href: "/ai-tutor", label: "AI Tutor", icon: "✦" },
  { href: "/brain", label: "Brain", icon: "🧠" },
  { href: "/groups", label: "Groups", icon: "👥" },
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

function getRoomIdFromStudyRoomPath(pathname: string) {
  const match = pathname.match(/^\/study-rooms\/(\d+)/);
  const roomId = Number(match?.[1]);

  return Number.isFinite(roomId) && roomId > 0 ? roomId : null;
}

function getPageKicker(pathname: string) {
  if (pathname.startsWith("/study-rooms")) return "StudySnap Projects";
  if (pathname.startsWith("/notes")) return "Connected Notes";
  if (pathname.startsWith("/flashcards")) return "Smart Review";
  if (pathname.startsWith("/quizzes")) return "Exam Practice";
  if (pathname.startsWith("/planner")) return "Study Planning";
  if (pathname.startsWith("/progress")) return "Learning Analytics";
  if (pathname.startsWith("/brain")) return "Brain Memory";
  if (pathname.startsWith("/groups")) return "Collaboration";
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

      if (typeof parsed?.full_name === "string" && parsed.full_name.trim()) {
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
  const [activeProjectRoomId, setActiveProjectRoomId] = useState<number | null>(
    null
  );
  const [learnerName, setLearnerName] = useState("StudySnap Learner");

  useEffect(() => {
    setLearnerName(getStoredUserName());
  }, []);

  useEffect(() => {
    const roomIdFromPath = getRoomIdFromStudyRoomPath(pathname);

    if (roomIdFromPath !== null) {
      const savedRoomId = saveProjectRoomId(roomIdFromPath);
      setActiveProjectRoomId(savedRoomId);
      return;
    }

    setActiveProjectRoomId(getSavedProjectRoomId());
  }, [pathname]);

  const learnerInitials = useMemo(() => {
    return getInitials(learnerName);
  }, [learnerName]);

  function getConnectedHref(href: string) {
    if (!projectAwareNavHrefs.has(href) || activeProjectRoomId === null) {
      return href;
    }

    return `${href}?roomId=${activeProjectRoomId}`;
  }

  async function handleLogout() {
    await signOutCurrentSession();
    router.push("/login");
  }

  function renderNavItems(closeMobile = false) {
    return navItems.map((item) => {
      const active = isNavItemActive(pathname, item.href);
      const connectedHref = getConnectedHref(item.href);

      return (
        <Link
          key={item.href}
          href={connectedHref}
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
              active ? "bg-yellow-300 text-black" : "bg-white/[0.06] text-slate-200"
            }`}
          >
            {item.icon}
          </span>

          <span>{item.label}</span>
        </Link>
      );
    });
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#05080d] text-white">
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[280px] overflow-y-auto border-r border-white/10 bg-[#061018] px-4 py-5 lg:flex lg:flex-col">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="text-4xl text-yellow-300">★</span>
          <span className="text-2xl font-black tracking-tight text-white">
            StudySnap <span className="text-yellow-300">AI</span>
          </span>
        </Link>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
            Active workspace
          </p>
          <p className="mt-2 text-sm font-black text-white">
            {activeProjectRoomId ? `Room #${activeProjectRoomId}` : "All StudySnap"}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Notes, quizzes, flashcards, planner, and AI stay connected.
          </p>
        </div>

        <nav className="mt-5 space-y-1.5">{renderNavItems()}</nav>

        <div className="mt-auto border-t border-white/10 pt-5">
          <div className="rounded-2xl border border-yellow-300/15 bg-yellow-300/10 p-4">
            <p className="font-black text-yellow-100">Upgrade to Premium</p>

            <p className="mt-2 text-sm leading-6 text-slate-300">
              Unlock advanced AI features, visual study tools, and smarter progress.
            </p>

            <button
              type="button"
              className="mt-4 w-full rounded-xl border border-yellow-300/35 bg-black/30 px-4 py-3 text-sm font-black text-yellow-200 transition hover:bg-black/45"
            >
              Upgrade Now →
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-yellow-300 text-sm font-black text-black">
                {learnerInitials}
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">
                  {learnerName}
                </p>
                <p className="text-xs font-bold text-slate-500">
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
                onClick={handleLogout}
                className="rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-red-500/15 hover:text-red-100"
                type="button"
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
                  onClick={() => setMobileMenuOpen((current) => !current)}
                  className="mb-3 inline-flex rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-black text-white lg:hidden"
                  type="button"
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
            <div className="border-t border-white/10 bg-[#061018] px-4 py-4 lg:hidden">
              <nav className="grid gap-2 sm:grid-cols-2">
                {renderNavItems(true)}

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
                  onClick={handleLogout}
                  className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-3 text-left text-sm font-black text-white"
                  type="button"
                >
                  <span>↪</span>
                  <span>Logout</span>
                </button>
              </nav>
            </div>
          ) : null}
        </header>

        <main className="mx-auto max-w-[1380px] px-5 py-5">{children}</main>
      </div>
    </div>
  );
}
