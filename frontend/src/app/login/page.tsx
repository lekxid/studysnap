"use client";

import Link from "next/link";
import { useState } from "react";

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

      const response = await fetch(`${apiBase}/auth/login`, {
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

      // Save token if backend returns it
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
    <main className="premium-bg flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/40 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            Sign in
          </h1>
          <p className="mt-4 text-base leading-8 text-slate-300">
            Continue your study streak and jump back into your workspace.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-200">
              Email
            </label>
            <input
              type="email"
              className="w-full rounded-[1.2rem] border border-white/10 bg-slate-900/70 px-4 py-4 text-white outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-200">
              Password
            </label>
            <input
              type="password"
              className="w-full rounded-[1.2rem] border border-white/10 bg-slate-900/70 px-4 py-4 text-white outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
            />
          </div>

          {error ? (
            <div className="rounded-[1.2rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="premium-button w-full rounded-[1.2rem] px-4 py-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>

          <div className="premium-card gold-border rounded-[1.4rem] px-4 py-4 text-sm text-slate-300">
            New here?{" "}
            <Link
              href="/signup"
              className="font-semibold text-amber-200 hover:text-amber-100"
            >
              Create an account
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
