"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";
import { removeToken } from "@/lib/api";
import NotificationBell from "@/components/NotificationBell";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "◈" },
  { href: "/onboarding", label: "Onboarding", icon: "◎" },
  { href: "/study-rooms", label: "Study Rooms", icon: "⬢" },
  { href: "/ai-tutor", label: "AI Tutor", icon: "✦" },
  { href: "/notes", label: "Notes", icon: "▣" },
  { href: "/flashcards", label: "Flashcards", icon: "◫" },
  { href: "/quizzes", label: "Quizzes", icon: "✎" },
  { href: "/planner", label: "Planner", icon: "◷" },
  { href: "/groups", label: "Groups", icon: "◌" },
  { href: "/progress", label: "Progress", icon: "▲" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

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

  function handleLogout() {
    removeToken();
    router.push("/login");
  }

  return (
    <div className="premium-bg min-h-screen text-white">
      <div className="flex min-h-screen">
        <aside className="premium-card-strong soft-scroll sticky top-0 hidden h-screen w-80 flex-col overflow-y-auto border-r border-white/10 md:flex">
          <div className="border-b border-white/10 px-7 py-7">
            <Link href="/dashboard" className="block">
              <div className="mb-5 flex items-center gap-3">
                <div className="brand-mark" />
                <div className="gold-chip">Premium Study</div>
              </div>

              <h1 className="glow-title bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-300 bg-clip-text text-[2.45rem] font-black tracking-[-0.04em] text-transparent">
                StudySnap AI
              </h1>

              <p className="mt-3 max-w-xs text-sm leading-7 text-slate-300">
                Learn faster. Study smarter.
              </p>
            </Link>
          </div>

          <nav className="flex-1 space-y-3 px-5 py-6">
            {navItems.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center gap-4 rounded-[1.4rem] px-5 py-4 text-sm font-semibold transition ${
                    active
                      ? "bg-gradient-to-r from-amber-400/90 via-yellow-300/80 to-orange-400/80 text-black shadow-[0_12px_30px_rgba(244,185,66,0.3)]"
                      : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${
                      active
                        ? "bg-black/20 text-black"
                        : "bg-white/5 text-cyan-300 group-hover:bg-amber-400/10"
                    }`}
                  >
                    {item.icon}
                  </span>

                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-white/10 p-5">
            <div className="gold-card rounded-[1.6rem] p-5">
              <p className="text-sm font-bold gold-accent">Today’s Mission</p>

              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                <li>• Review flashcards</li>
                <li>• Ask AI one hard question</li>
                <li>• Study for 20 minutes</li>
              </ul>

              <div className="mt-5 text-xs leading-6 text-amber-100">
                Stay consistent. That’s how you win.
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="topbar-glass sticky top-0 z-40 border-b border-white/10">
            <div className="page-wrap py-4 sm:py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                  <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="premium-button-secondary mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl md:hidden"
                    type="button"
                    aria-label="Toggle menu"
                  >
                    ☰
                  </button>

                  <div className="min-w-0">
                    <div className="gold-chip mb-2 hidden md:inline-flex">
                      Focus Mode
                    </div>

                    <h2 className="section-heading break-words text-balance">
                      {title}
                    </h2>

                    {subtitle ? (
                      <p className="section-subtitle mt-2 max-w-3xl">
                        {subtitle}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                  <div className="gold-border rounded-[1rem] bg-black/35 px-2.5 py-2 sm:px-3">
                    <NotificationBell />
                  </div>

                  <button
                    onClick={handleLogout}
                    className="premium-button-secondary rounded-[1rem] px-4 py-2.5 text-sm font-semibold"
                    type="button"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>

            {mobileMenuOpen ? (
              <div className="border-t border-white/10 bg-black/90 px-4 py-4 md:hidden">
                <div className="mb-4 flex items-center gap-3 rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-4">
                  <div className="brand-mark h-10 w-10 shrink-0 rounded-[0.9rem]" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">StudySnap AI</p>
                    <p className="text-xs leading-6 text-slate-400">
                      Premium study flow
                    </p>
                  </div>
                </div>

                <nav className="space-y-2">
                  {navItems.map((item) => {
                    const active =
                      pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 rounded-[1rem] px-4 py-3 text-sm font-semibold ${
                          active
                            ? "bg-amber-400 text-black"
                            : "bg-white/5 text-white"
                        }`}
                      >
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-black/10">
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            ) : null}
          </header>

          <main className="page-wrap flex-1 py-6 sm:py-8 lg:py-10">
            <div className="app-content">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
