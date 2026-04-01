"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken, removeToken } from "@/lib/api";

export default function Navbar() {
  const router = useRouter();
  const token = typeof window !== "undefined" ? getToken() : null;

  function handleLogout() {
    removeToken();
    router.push("/login");
  }

  return (
    <nav className="w-full border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold">
          StudySnap
        </Link>

        <div className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="hover:underline">
            Dashboard
          </Link>
          <Link href="/ai-tutor" className="hover:underline">
            AI Tutor
          </Link>

          {token ? (
            <button
              onClick={handleLogout}
              className="rounded-lg bg-black px-4 py-2 text-white"
            >
              Logout
            </button>
          ) : (
            <>
              <Link href="/login" className="hover:underline">
                Login
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-black px-4 py-2 text-white"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
