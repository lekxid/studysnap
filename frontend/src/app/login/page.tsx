"use client";

import Link from "next/link";
import { useState } from "react";

import AuthShell from "@/components/auth/AuthShell";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const apiBase =
        process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
        process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
        "";

      if (!apiBase) {
        throw new Error("API base URL is not set.");
      }

      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const raw = await response.text();
      let data: any = null;

      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = { message: raw || "Unexpected server response." };
      }

      if (!response.ok) {
        throw new Error(data?.detail || data?.message || "Login failed.");
      }

      if (data?.access_token) {
        localStorage.setItem("token", data.access_token);
      }

      window.location.href = "/dashboard";
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      badge="Welcome back"
      title="Sign in"
      subtitle="Continue your study streak and jump back into your connected StudySnap workspace."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-bold text-slate-200">
            Email
          </label>
          <input
            type="email"
            className="w-full rounded-[1.2rem] border border-white/10 bg-slate-900/75 px-4 py-4 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="block text-sm font-bold text-slate-200">
              Password
            </label>

            <Link
              href="/forgot-password"
              className="text-xs font-bold text-amber-200 transition hover:text-amber-100"
            >
              Forgot password?
            </Link>
          </div>

          <input
            type="password"
            className="w-full rounded-[1.2rem] border border-white/10 bg-slate-900/75 px-4 py-4 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
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
          className="premium-button w-full rounded-[1.2rem] px-4 py-4 text-base font-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>

        <div className="premium-card gold-border rounded-[1.4rem] px-4 py-4 text-center text-sm text-slate-300">
          New to StudySnap?{" "}
          <Link
            href="/signup"
            className="font-bold text-amber-200 transition hover:text-amber-100"
          >
            Create an account
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
