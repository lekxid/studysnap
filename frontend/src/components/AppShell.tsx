"use client";

import Link from "next/link";
import {
  usePathname,
  useRouter,
} from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";

import CommandBar from "@/components/CommandBar";
import NotificationBell from "@/components/NotificationBell";
import {
  clearProjectRoomId,
  getSavedProjectRoomId,
  PROJECT_ROOM_CHANGED_EVENT,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";
import {
  getCurrentUser,
  getCurrentUserAvatarBlob,
  getStudyRooms,
  PROFILE_UPDATED_EVENT,
  signOutCurrentSession,
  type UserProfile,
} from "@/lib/api";

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
  {
    href: "/dashboard",
    label: "Home",
    icon: "⌂",
  },
  {
    href: "/study-rooms",
    label: "Study Rooms",
    icon: "📁",
  },
  {
    href: "/study-rooms/organize",
    label: "Smart Organizer",
    icon: "🗂️",
  },
];

const studyToolNavItems: NavItem[] = [
  {
    href: "/notes",
    label: "Notes",
    icon: "▣",
  },
  {
    href: "/flashcards",
    label: "Concept Cards",
    icon: "◫",
  },
  {
    href: "/quizzes",
    label: "Quizzes",
    icon: "▤",
  },
  {
    href: "/planner",
    label: "Planner",
    icon: "◷",
  },
  {
    href: "/progress",
    label: "Progress",
    icon: "▲",
  },
  {
    href: "/ai-tutor",
    label: "AI Tutor",
    icon: "✦",
  },
];

const moreNavItems: NavItem[] = [
  {
    href: "/onboarding",
    label: "Learning Setup",
    icon: "◎",
  },
  {
    href: "/brain",
    label: "AI Memory",
    icon: "🧠",
  },
  {
    href: "/groups",
    label: "Study Groups",
    icon: "👥",
  },
];

const topNavItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    icon: "⌂",
  },
  {
    href: "/study-rooms",
    label: "Study Rooms",
    icon: "▣",
  },
  {
    href: "/study-together",
    label: "Study Together",
    icon: "👥",
  },
  {
    href: "/ai-tutor",
    label: "AI Tutor",
    icon: "✦",
  },
  {
    href: "/progress",
    label: "Progress",
    icon: "▲",
  },
];

type MobileNavIconName =
  | "home"
  | "rooms"
  | "ask"
  | "together"
  | "profile";

type MobileNavItem = {
  href: string;
  label: string;
  icon: MobileNavIconName;
};

const mobileNavItems: MobileNavItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    icon: "home",
  },
  {
    href: "/study-rooms",
    label: "Rooms",
    icon: "rooms",
  },
  {
    href: "/general-ai",
    label: "Ask",
    icon: "ask",
  },
  {
    href: "/study-together",
    label: "Together",
    icon: "together",
  },
  {
    href: "/settings",
    label: "Profile",
    icon: "profile",
  },
];

const projectAwareNavHrefs = new Set([
  "/notes",
  "/flashcards",
  "/quizzes",
  "/planner",
]);

function isNavItemActive(
  pathname: string,
  href: string,
  search?: string,
) {
  if (
    href === "/study-together" &&
    /^\/study-rooms\/\d+/.test(pathname) &&
    search === "together"
  ) {
    return true;
  }

  if (href === "/study-rooms") {
    if (
      /^\/study-rooms\/\d+/.test(pathname) &&
      search === "together"
    ) {
      return false;
    }

    return (
      pathname === "/study-rooms" ||
      /^\/study-rooms\/\d+/.test(pathname)
    );
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function isAnyNavItemActive(pathname: string, items: NavItem[]) {
  return items.some((item) => isNavItemActive(pathname, item.href));
}

function isMobileNavItemActive(
  pathname: string,
  item: MobileNavItem,
  search?: string,
) {
  if (item.icon === "ask") {
    return (
      pathname.startsWith("/ai-tutor") ||
      pathname.startsWith("/general-ai")
    );
  }

  if (item.icon === "together") {
    return (
      pathname.startsWith("/study-together") ||
      pathname.startsWith("/groups") ||
      (
        /^\/study-rooms\/\d+/.test(pathname) &&
        search === "together"
      )
    );
  }

  if (item.icon === "profile") {
    return (
      pathname.startsWith("/settings") ||
      pathname.startsWith("/onboarding")
    );
  }

  return isNavItemActive(pathname, item.href, search);
}

function getRoomIdFromStudyRoomPath(pathname: string) {
  const match = pathname.match(/^\/study-rooms\/(\d+)/);

  const roomId = Number(match?.[1]);

  return Number.isFinite(roomId) && roomId > 0 ? roomId : null;
}

function getPageKicker(pathname: string) {
  if (pathname.startsWith("/study-rooms")) {
    return "StudySnap Projects";
  }

  if (pathname.startsWith("/notes")) {
    return "Connected Notes";
  }

  if (pathname.startsWith("/flashcards")) {
    return "Concept Cards";
  }

  if (pathname.startsWith("/quizzes")) {
    return "Exam Practice";
  }

  if (pathname.startsWith("/planner")) {
    return "Study Planning";
  }

  if (pathname.startsWith("/progress")) {
    return "Learning Analytics";
  }

  if (pathname.startsWith("/brain")) {
    return "AI Memory";
  }

  if (
    pathname.startsWith("/study-together") ||
    pathname.startsWith("/groups")
  ) {
    return "Study Together";
  }

  if (pathname.startsWith("/settings")) {
    return "Workspace Settings";
  }

  if (pathname.startsWith("/ai-tutor")) {
    return "AI Tutor";
  }

  if (pathname.startsWith("/onboarding")) {
    return "Learning Setup";
  }

  return "Focus Mode";
}

function getStoredUserName() {
  if (typeof window === "undefined") {
    return "StudySnap Learner";
  }

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

  if (parts.length === 0) {
    return "S";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function MobileNavIcon({
  name,
}: {
  name: MobileNavIconName;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "home" ? (
        <>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
          <path d="M9 21v-7h6v7" />
        </>
      ) : null}

      {name === "rooms" ? (
        <>
          <path d="M3.5 6.5h6l2 2h9v10a2 2 0 0 1-2 2h-15z" />
          <path d="M3.5 6.5V5a2 2 0 0 1 2-2h3l2 2h8a2 2 0 0 1 2 2v1.5" />
        </>
      ) : null}

      {name === "ask" ? (
        <>
          <path d="m12 3 1.25 4.05L17 8.5l-3.75 1.45L12 14l-1.25-4.05L7 8.5l3.75-1.45z" />
          <path d="m18.5 14 .75 2.25L21.5 17l-2.25.75L18.5 20l-.75-2.25L15.5 17l2.25-.75z" />
          <path d="m5.5 14 .55 1.45 1.45.55-1.45.55L5.5 18l-.55-1.45L3.5 16l1.45-.55z" />
        </>
      ) : null}

      {name === "together" ? (
        <>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3.5 20c.3-4 2.2-6 5.5-6s5.2 2 5.5 6" />
          <path d="M14 14.5c3.9-.8 6.2 1 6.5 4.5" />
        </>
      ) : null}

      {name === "profile" ? (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21c.45-4.7 3-7 7.5-7s7.05 2.3 7.5 7" />
        </>
      ) : null}
    </svg>
  );
}

export default function AppShell({
  title,
  subtitle,
  children,
  rightPanel,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  rightPanel?: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [activeQueryTab, setActiveQueryTab] =
    useState<string | undefined>(undefined);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);

  const [roomMenuOpen, setRoomMenuOpen] = useState(false);

  const [studyToolsOpen, setStudyToolsOpen] = useState(() =>
    isAnyNavItemActive(pathname, studyToolNavItems),
  );

  const [moreOpen, setMoreOpen] = useState(() =>
    isAnyNavItemActive(pathname, moreNavItems),
  );

  const [activeProjectRoomId, setActiveProjectRoomId] = useState<number | null>(
    null,
  );

  const [studyRooms, setStudyRooms] = useState<RoomSummary[]>([]);

  const [roomsLoading, setRoomsLoading] = useState(true);

  const [roomsError, setRoomsError] = useState("");

  const [learnerName, setLearnerName] = useState("StudySnap Learner");
  const [learnerAvatarUrl, setLearnerAvatarUrl] =
    useState<string | null>(null);

  useEffect(() => {
    const savedSidebarState = window.localStorage.getItem(
      "studysnap:desktop-sidebar-open",
    );

    if (savedSidebarState !== null) {
      setDesktopSidebarOpen(savedSidebarState !== "false");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let activeObjectUrl: string | null = null;

    async function loadProfile(
      suppliedProfile?: UserProfile
    ) {
      try {
        const profile =
          suppliedProfile ?? await getCurrentUser();

        if (cancelled) return;

        setLearnerName(
          profile.full_name?.trim() ||
            getStoredUserName()
        );

        if (!profile.avatar_url) {
          setLearnerAvatarUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
          });
          return;
        }

        const avatarBlob =
          await getCurrentUserAvatarBlob();

        if (cancelled) return;

        const nextObjectUrl = avatarBlob
          ? URL.createObjectURL(avatarBlob)
          : null;

        activeObjectUrl = nextObjectUrl;

        setLearnerAvatarUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextObjectUrl;
        });
      } catch (error) {
        console.error(
          "Could not load shell profile.",
          error
        );

        if (!cancelled) {
          setLearnerName(getStoredUserName());
        }
      }
    }

    function handleProfileUpdated(event: Event) {
      const profileEvent =
        event as CustomEvent<UserProfile | undefined>;

      void loadProfile(profileEvent.detail);
    }

    void loadProfile();

    window.addEventListener(
      PROFILE_UPDATED_EVENT,
      handleProfileUpdated
    );

    return () => {
      cancelled = true;

      window.removeEventListener(
        PROFILE_UPDATED_EVENT,
        handleProfileUpdated
      );

      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStudyRooms() {
      try {
        setRoomsLoading(true);
        setRoomsError("");

        const rooms = await getStudyRooms();

        if (cancelled) return;

        const roomSummaries = rooms.map(
          (room) => ({
            id: room.id,
            name:
              room.name?.trim() ||
              `Room #${room.id}`,
          })
        );

        setStudyRooms(roomSummaries);

        const savedRoomId =
          getSavedProjectRoomId();

        if (
          savedRoomId !== null &&
          !roomSummaries.some(
            (room) => room.id === savedRoomId
          )
        ) {
          clearProjectRoomId();
          setActiveProjectRoomId(null);
        }
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
    const tab =
      typeof window !== "undefined"
        ? new URLSearchParams(
            window.location.search
          ).get("tab") ?? undefined
        : undefined;

    setActiveQueryTab(tab);
  }, [pathname]);

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
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleProjectRoomChanged(event: Event) {
      const roomEvent = event as CustomEvent<{
        roomId?: number | null;
      }>;

      const nextRoomId = roomEvent.detail?.roomId ?? getSavedProjectRoomId();

      setActiveProjectRoomId(nextRoomId);
    }

    window.addEventListener(
      PROJECT_ROOM_CHANGED_EVENT,
      handleProjectRoomChanged,
    );

    return () => {
      window.removeEventListener(
        PROJECT_ROOM_CHANGED_EVENT,
        handleProjectRoomChanged,
      );
    };
  }, []);

  const learnerInitials = useMemo(() => {
    return getInitials(learnerName);
  }, [learnerName]);

  function resolveTopNavHref(
    item: NavItem,
  ) {
    if (item.label === "Study Together") {
      return "/study-together";
    }

    return item.href;
  }

  const activeRoom = useMemo(() => {
    if (activeProjectRoomId === null) {
      return null;
    }

    return studyRooms.find((room) => room.id === activeProjectRoomId) ?? null;
  }, [activeProjectRoomId, studyRooms]);

  const recentRooms = useMemo(() => {
    const currentRoom = studyRooms.find(
      (room) => room.id === activeProjectRoomId,
    );

    const otherRooms = studyRooms.filter(
      (room) => room.id !== activeProjectRoomId,
    );

    return [...(currentRoom ? [currentRoom] : []), ...otherRooms].slice(0, 6);
  }, [activeProjectRoomId, studyRooms]);

  const currentRoomLabel =
    activeRoom?.name ||
    (activeProjectRoomId
      ? `Room #${activeProjectRoomId}`
      : "Choose a study room");

  function getConnectedHref(href: string) {
    if (!projectAwareNavHrefs.has(href) || activeProjectRoomId === null) {
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

  function toggleDesktopSidebar() {
    setDesktopSidebarOpen((current) => {
      const next = !current;

      window.localStorage.setItem(
        "studysnap:desktop-sidebar-open",
        String(next),
      );

      if (!next) {
        setRoomMenuOpen(false);
      }

      return next;
    });
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
            if (closeMobile) {
              setMobileMenuOpen(false);
            }
          }}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold transition ${
            active
              ? "border border-[#c9ad50]/[0.18] bg-[#c9ad50]/[0.09] text-[#ece8da]"
              : "text-slate-200 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base ${
              active
                ? "bg-[#c9ad50] text-[#111317]"
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
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black transition ${
            sectionActive
              ? "bg-[#c9ad50]/[0.09] text-[#ece8da]"
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

  function renderTopNavigation() {
    return topNavItems.map((item) => {
      const active = isNavItemActive(
        pathname,
        item.href,
        activeQueryTab
      );

      return (
        <Link
          key={item.href}
          href={resolveTopNavHref(item)}
          title={item.label}
          aria-current={
            active ? "page" : undefined
          }
          className={`group relative flex h-[72px] min-w-[72px] flex-col items-center justify-center gap-1 px-3 transition ${
            active
              ? "text-[#cec18d]"
              : "text-slate-400 hover:bg-white/[0.035] hover:text-white"
          }`}
        >
          <span
            className={`grid h-9 w-9 place-items-center rounded-xl text-base transition ${
              active
                ? "bg-[#c9ad50] text-[#111317] shadow-[0_8px_22px_rgba(0,0,0,0.18)]"
                : "bg-white/[0.04] group-hover:bg-white/[0.08]"
            }`}
          >
            {item.icon}
          </span>

          <span className="hidden text-[10px] font-black xl:block">
            {item.label}
          </span>

          <span
            className={`absolute bottom-0 left-3 right-3 h-[3px] rounded-full ${
              active
                ? "bg-[#c9ad50]"
                : "bg-transparent"
            }`}
          />
        </Link>
      );
    });
  }


  function renderMobileBottomNavigation() {
    return (
      <nav
        aria-label="Primary mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.08] bg-[#090d12]/[0.98] pb-[env(safe-area-inset-bottom)] shadow-[0_-16px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto grid h-[70px] max-w-lg grid-cols-5 items-end px-1.5">
          {mobileNavItems.map((item) => {
            const active = isMobileNavItemActive(
              pathname,
              item,
              activeQueryTab,
            );

            const primaryAction = item.icon === "ask";

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(event) => {
                  if (
                    item.icon === "home" &&
                    pathname === "/dashboard"
                  ) {
                    event.preventDefault();

                    window.scrollTo({
                      top: 0,
                      left: 0,
                      behavior: "smooth",
                    });
                  }
                }}
                aria-current={active ? "page" : undefined}
                className={`group relative flex min-w-0 flex-col items-center justify-end gap-1 rounded-2xl px-1 pb-2 pt-2 text-[10px] font-black transition ${
                  primaryAction ? "-mt-4" : ""
                } ${
                  active
                    ? "text-[#e5d99c]"
                    : "text-slate-500 active:bg-white/[0.06] active:text-slate-200"
                }`}
              >
                <span
                  className={`relative grid shrink-0 place-items-center transition ${
                    primaryAction
                      ? "h-12 w-12 rounded-2xl border border-[#d8bf62]/40 bg-[#c9ad50] text-[#111317] shadow-[0_10px_28px_rgba(0,0,0,0.42)]"
                      : active
                        ? "h-9 w-11 rounded-xl bg-[#c9ad50]/[0.13] text-[#ddcf8d]"
                        : "h-9 w-11 rounded-xl text-slate-400 group-active:bg-white/[0.07]"
                  }`}
                >
                  <MobileNavIcon name={item.icon} />

                  {primaryAction ? (
                    <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20" />
                  ) : null}
                </span>

                <span
                  className={`max-w-full truncate ${
                    primaryAction
                      ? "text-[#e4d89c]"
                      : ""
                  }`}
                >
                  {item.label}
                </span>

                {active && !primaryAction ? (
                  <span className="absolute bottom-0 h-0.5 w-5 rounded-full bg-[#c9ad50]" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0b0f14] text-white">
      <aside
        className={`fixed bottom-0 left-0 top-[72px] z-40 hidden w-[264px] overflow-hidden border-r border-white/[0.07] bg-[#0d1218] px-3 py-4 shadow-[12px_0_40px_rgba(0,0,0,0.18)] transition-transform duration-300 lg:flex lg:flex-col ${
          desktopSidebarOpen ? "lg:translate-x-0" : "lg:-translate-x-full"
        }`}
        aria-hidden={!desktopSidebarOpen}
      >
        <div className="hidden">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <span className="text-3xl text-[#c9ad50]">★</span>

            <span className="truncate text-xl font-black tracking-tight text-white">
              StudySnap <span className="text-[#c9ad50]">AI</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={toggleDesktopSidebar}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-sm font-black text-slate-300 transition hover:bg-white/[0.1] hover:text-white"
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            ←
          </button>
        </div>

        <div className="relative mt-1 shrink-0">
          <button
            type="button"
            aria-expanded={roomMenuOpen}
            aria-haspopup="menu"
            onClick={() => setRoomMenuOpen((current) => !current)}
            className="w-full rounded-xl border border-white/[0.07] bg-white/[0.035] p-3 text-left transition hover:border-[#c9ad50]/[0.18] hover:bg-white/[0.06]"
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
              className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#12181e] p-2 shadow-2xl shadow-black/60"
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
                            ? "bg-[#c9ad50] text-[#111317]"
                            : "text-slate-200 hover:bg-white/[0.07] hover:text-white"
                        }`}
                      >
                        <span
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                            selected ? "bg-black/15" : "bg-white/[0.06]"
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
          <div className="space-y-1.5">{renderNavItems(primaryNavItems)}</div>

          <div className="mt-3">
            {renderExpandableNav({
              title: "Study Tools",
              icon: "✦",
              items: studyToolNavItems,
              open: studyToolsOpen,
              onToggle: () => setStudyToolsOpen((current) => !current),
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
            className="flex w-full items-center justify-between rounded-xl border border-[#c9ad50]/[0.16] bg-[#c9ad50]/[0.075] px-3 py-2.5 text-left transition hover:bg-[#c9ad50]/[0.11]"
          >
            <span>
              <span className="block text-xs font-black text-[#ece8da]">
                StudySnap Premium
              </span>

              <span className="mt-0.5 block text-[10px] text-slate-400">
                More AI and study tools
              </span>
            </span>

            <span className="text-[#cec18d]">→</span>
          </button>

          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-[#c9ad50] text-sm font-black text-[#111317]">
                {learnerAvatarUrl ? (
                  <img
                    src={learnerAvatarUrl}
                    alt={`${learnerName} profile`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="place-self-center">
                    {learnerInitials}
                  </span>
                )}
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
                    ? "bg-[#c9ad50] text-[#111317]"
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

      <div
        className={`min-w-0 pt-[60px] transition-[margin] duration-300 lg:pt-[72px] ${
          desktopSidebarOpen ? "lg:ml-[264px]" : "lg:ml-0"
        }`}
      >
        <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.07] bg-[#090d12]/96 backdrop-blur-xl">
          <div className="flex h-[60px] items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:h-[72px]">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 lg:w-[390px] lg:flex-none">
              <button
                type="button"
                onClick={() =>
                  setMobileMenuOpen(
                    (current) => !current
                  )
                }
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-sm font-black tracking-[0.08em] transition lg:hidden ${
                  mobileMenuOpen
                    ? "border-[#c9ad50]/30 bg-[#c9ad50]/10 text-[#e6daa0]"
                    : "border-white/10 bg-white/[0.05] text-slate-200 active:bg-white/[0.1]"
                }`}
                aria-label={mobileMenuOpen ? "Close more menu" : "Open more menu"}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? "×" : "•••"}
              </button>

              <Link
                href="/dashboard"
                title="Go to Dashboard"
                className="flex shrink-0 items-center gap-2"
              >
                <span className="text-2xl text-[#c9ad50]">
                  ★
                </span>

                <span className="text-base font-black tracking-tight text-white sm:text-lg">
                  StudySnap{" "}
                  <span className="text-[#c9ad50]">
                    AI
                  </span>
                </span>
              </Link>

              <div className="min-w-0 flex-1">
                <CommandBar />
              </div>
            </div>

            <nav className="hidden min-w-0 flex-1 items-center justify-center lg:flex">
              {renderTopNavigation()}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <div className="grid h-11 min-w-11 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] px-2">
                <NotificationBell />
              </div>

              <Link
                href="/settings"
                title="Profile and settings"
                className="hidden h-11 w-11 overflow-hidden rounded-full border border-[#c9ad50]/[0.18] bg-[#c9ad50] text-xs font-black text-[#111317] transition hover:bg-[#d5bb63] lg:grid"
              >
                {learnerAvatarUrl ? (
                  <img
                    src={learnerAvatarUrl}
                    alt={`${learnerName} profile`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="place-self-center">
                    {learnerInitials}
                  </span>
                )}
              </Link>
            </div>
          </div>

          {mobileMenuOpen ? (
            <div className="max-h-[calc(100dvh-8.25rem-env(safe-area-inset-bottom))] overflow-y-auto border-t border-white/[0.07] bg-[#0b0f14] px-4 py-4 shadow-2xl lg:hidden">
              <div className="flex items-start justify-between gap-4 px-2">
                <div>
                  <p className="text-xs font-black text-white">
                    More in StudySnap
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Notes, practice, planning and learning tools.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-lg text-slate-300 active:bg-white/[0.1]"
                  aria-label="Close more menu"
                >
                  ×
                </button>
              </div>

              <p className="mt-5 px-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Study tools
              </p>

              <div className="mt-2">
                {renderExpandableNav({
                  title: "Study Tools",
                  icon: "✦",
                  items: studyToolNavItems,
                  open: studyToolsOpen,
                  onToggle: () =>
                    setStudyToolsOpen(
                      (current) => !current
                    ),
                  closeMobile: true,
                })}
              </div>

              <div className="mt-2">
                {renderExpandableNav({
                  title: "More",
                  icon: "•••",
                  items: moreNavItems,
                  open: moreOpen,
                  onToggle: () =>
                    setMoreOpen(
                      (current) => !current
                    ),
                  closeMobile: true,
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void handleLogout();
                }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 active:bg-red-500/20"
              >
                <span aria-hidden="true">↪</span>
                Sign out
              </button>
            </div>
          ) : null}
        </header>

        <main className="mx-auto min-w-0 w-full max-w-[1600px] overflow-x-clip px-3 pb-[calc(6.25rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pt-5 lg:pb-5">
          {pathname !== "/dashboard" && title ? (
            <div className="mb-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c9ad50]">
                {getPageKicker(pathname)}
              </p>

              <h1 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">
                {title}
              </h1>

              {subtitle ? (
                <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-400">
                  {subtitle}
                </p>
              ) : null}
            </div>
          ) : null}
          {rightPanel ? (
            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">{children}</div>

              <aside className="hidden min-w-0 xl:block">
                <div className="sticky top-[5.75rem]">{rightPanel}</div>
              </aside>
            </div>
          ) : (
            <div className="min-w-0 max-w-full">
              {children}
            </div>
          )}
        </main>
      </div>

      {renderMobileBottomNavigation()}
    </div>
  );
}
