"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import CommandBar from "@/components/CommandBar";
import NotificationBell from "@/components/NotificationBell";
import {
  getSavedProjectRoomId,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";
import { removeToken } from "@/lib/api";

const navItems = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/onboarding", label: "Onboarding", icon: "◎" },
  { href: "/study-rooms", label: "Study Rooms", icon: "📁" },
  { href: "/notes", label: "Notes", icon: "▣" },
  { href: "/flashcards", label: "Flashcards", icon: "◫" },
  { href: "/quizzes", label: "Quizzes", icon: "▤" },
  { href: "/planner", label: "Planner", icon: "◷" },
  { href: "/progress", label: "Progress", icon: "?" },
  { href: "/ai-tutor", label: "AI Tutor", icon: "✦" },
  { href: "/brain", label: "Brain", icon: "🧠" },
  { href: "/groups", label: "Groups", icon: "👥" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

const projectAwareNavHrefs = new Set([
  "/notes",
  "/flashcards",
  "/quizzes",
  "/planner",
]);

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
  return "Focus Mode";
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

  useEffect(() => {
    const roomIdFromPath = getRoomIdFromStudyRoomPath(pathname);

    if (roomIdFromPath !== null) {
      const savedRoomId = saveProjectRoomId(roomIdFromPath);
      setActiveProjectRoomId(savedRoomId);
      return;
    }

    setActiveProjectRoomId(getSavedProjectRoomId());
  }, [pathname]);

  function getConnectedHref(href: string) {
    if (!projectAwareNavHrefs.has(href) || activeProjectRoomId === null) {
      return href;
    }

    return `${href}?roomId=${activeProjectRoomId}`;
  }

  function handleLogout() {
    removeToken();
    router.push("/login");
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#05080d] text-white">
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[280px] overflow-y-auto border-r border-white/10 bg-[#061018] px-4 py-5 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="text-4xl text-yellow-300">★</span>
          <span className="text-2xl font-black tracking-tight text-white">
            StudySnap <span className="text-yellow-300">AI</span>
          </span>
        </Link>

        <nav className="mt-7 space-y-1.5">
          {navItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            const connectedHref = getConnectedHref(item.href);

            return (
              <Link
                key={item.href}
                href={connectedHref}
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

                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-8 border-t border-white/10 pt-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
            Starred Rooms
          </p>

          <div className="mt-4 rounded-2xl border border-yellow-300/15 bg-yellow-300/10 p-4">
            <p className="font-black text-yellow-100">Upgrade to Premium</p>

            <p className="mt-2 text-sm leading-6 text-slate-300">
              Unlock advanced AI features, visual study tools, and smarter progress.
            </p>

            <button
              type="button"
              className="mt-4 w-full rounded-xl border border-yellow-300/35 bg-black/30 px-4 py-3 text-sm font-black text-yellow-200"
            >
              Upgrade Now →
            </button>
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

                <button
                  onClick={handleLogout}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white transition hover:bg-white/[0.08]"
                  type="button"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>

          {mobileMenuOpen ? (
            <div className="border-t border-white/10 bg-[#061018] px-4 py-4 lg:hidden">
              <nav className="grid gap-2 sm:grid-cols-2">
                {navItems.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

                  const connectedHref = getConnectedHref(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={connectedHref}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-black ${
                        active
                          ? "bg-yellow-300 text-black"
                          : "bg-white/[0.05] text-white"
                      }`}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
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
