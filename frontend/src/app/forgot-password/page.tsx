"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import AuthShell from "@/components/auth/AuthShell";
import { forgotPassword } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await forgotPassword(email);
      setMessage(
        data?.message ||
          "If an account with that email exists, a reset link has been sent."
      );
      setSent(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to send reset link.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      badge="Account recovery"
      title="Reset password"
      subtitle="Enter your email and StudySnap will start the password reset flow."
      sideTitle="Recover access without losing your study flow."
      sideSubtitle="Get back into your connected rooms, notes, PDFs, quizzes, flashcards, progress, and AI Tutor workspace."
    >
      {sent ? (
        <div className="space-y-5">
          <div className="gold-card rounded-[1.5rem] p-5">
            <p className="text-sm font-black text-amber-100">
              Reset request accepted
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-200">{message}</p>
          </div>

          <Link
            href="/login"
            className="premium-button inline-flex w-full justify-center rounded-[1.2rem] px-4 py-4 text-sm font-black"
          >
            Back to login
          </Link>
        </div>
      ) : (
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
            {loading ? "Sending..." : "Send reset link"}
          </button>

          <div className="premium-card gold-border rounded-[1.4rem] px-4 py-4 text-center text-sm text-slate-300">
            Remember your password?{" "}
            <Link
              href="/login"
              className="font-bold text-amber-200 transition hover:text-amber-100"
            >
              Back to login
            </Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
