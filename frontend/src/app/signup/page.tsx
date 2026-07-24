"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";

import AuthShell from "@/components/auth/AuthShell";
import { API_BASE } from "@/lib/apiBase";

type SignupPayload = {
  detail?: unknown;
  message?: unknown;
};

function readText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export default function SignupPage() {
  const [nextPath, setNextPath] =
    useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const requestedNext =
      new URLSearchParams(
        window.location.search,
      ).get("next");

    if (
      !requestedNext?.startsWith("/") ||
      requestedNext.startsWith("//")
    ) {
      return;
    }

    const timer = window.setTimeout(
      () => setNextPath(requestedNext),
      0,
    );

    return () => window.clearTimeout(timer);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: name,
          email,
          password,
          invite_code: inviteCode,
          learning_mode: "clear",
        }),
      });

      const raw = await response.text();
      let data: SignupPayload | null = null;

      try {
        data = raw
          ? (JSON.parse(raw) as SignupPayload)
          : null;
      } catch {
        data = { message: raw || "Unexpected server response." };
      }

      if (!response.ok) {
        throw new Error(
          readText(data?.detail) ||
            readText(data?.message) ||
            "Signup failed.",
        );
      }

      const loginParams =
        new URLSearchParams({
          email,
          created: "1",
        });

      if (nextPath) {
        loginParams.set(
          "next",
          nextPath
        );
      }

      window.location.href =
        `/login?${loginParams.toString()}`;
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      badge="Create account"
      title="Start learning smarter"
      subtitle="Create your StudySnap account and begin building your personal AI learning system."
      sideTitle="Build your connected AI study system."
      sideSubtitle="StudySnap is designed to help students move from scattered studying to one clear workspace with rooms, notes, PDFs, flashcards, quizzes, Brain, and AI Tutor working together."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-bold text-slate-200">
            Name
          </label>
          <input
            type="text"
            className="w-full rounded-[1.2rem] border border-white/10 bg-slate-900/75 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-200">
            Email
          </label>
          <input
            type="email"
            className="w-full rounded-[1.2rem] border border-white/10 bg-slate-900/75 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-200">
            Password
          </label>
          <input
            type="password"
            className="w-full rounded-[1.2rem] border border-white/10 bg-slate-900/75 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a password"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-200">
            Invite code
          </label>
          <input
            type="text"
            className="w-full rounded-[1.2rem] border border-white/10 bg-slate-900/75 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/50 focus:ring-4 focus:ring-amber-300/10"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Private beta code"
            autoComplete="off"
            required
          />
        </div>

        {error ? (
          <div className="rounded-[1.2rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="premium-button w-full rounded-[1.2rem] px-4 py-3.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>

        <div className="premium-card gold-border rounded-[1.4rem] px-4 py-3.5 text-center text-sm text-slate-300">
          Already have an account?{" "}
          <Link
            href={
              nextPath
                ? `/login?next=${encodeURIComponent(
                    nextPath
                  )}`
                : "/login"
            }
            className="font-bold text-amber-200 transition hover:text-amber-100"
          >
            Log in
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
