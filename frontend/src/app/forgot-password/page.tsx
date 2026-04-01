"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
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
    <main className="premium-bg flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/40 shadow-[0_24px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl lg:grid-cols-[1.02fr_0.98fr]">
        <section className="hidden border-r border-white/10 p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <div className="brand-mark" />
              <div className="gold-chip">Account recovery</div>
            </div>

            <h1 className="max-w-xl text-5xl font-black leading-tight tracking-tight text-white">
              Reset access to
              <span className="glow-title mt-2 block bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-300 bg-clip-text text-transparent">
                StudySnap AI
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-8 text-slate-300">
              Enter your email to continue the password reset flow and get back
              into your rooms, notes, quizzes, and AI workspace.
            </p>
          </div>

          <div className="content-grid mt-10">
            <div className="premium-card gold-border rounded-[1.75rem] p-6">
              <p className="text-sm font-semibold text-amber-200">
                Quick recovery flow
              </p>

              <div className="mt-5 grid gap-3">
                <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                  Enter the email tied to your account
                </div>
                <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                  Receive a password reset link
                </div>
                <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                  Return to your study flow securely
                </div>
              </div>
            </div>

            <div className="gold-card rounded-[1.75rem] p-6">
              <p className="text-sm font-semibold text-amber-100">
                Backend connected
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-200">
                This page now uses your shared frontend API helper and your real
                backend auth router.
              </p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-8 lg:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <div className="gold-chip mb-4">Forgot password</div>
              <h2 className="text-3xl font-black tracking-tight text-white">
                Reset password
              </h2>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                Enter your email and we’ll send a reset link.
              </p>
            </div>

            {sent ? (
              <div className="content-grid">
                <div className="gold-card rounded-[1.5rem] p-5">
                  <p className="text-sm font-semibold text-amber-100">
                    Reset request accepted
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-200">
                    {message}
                  </p>
                </div>

                <Link
                  href="/login"
                  className="premium-button inline-flex justify-center rounded-[1.2rem] px-4 py-3.5 text-sm font-bold"
                >
                  Back to login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-200">
                    Email
                  </label>
                  <input
                    type="email"
                    className="rounded-[1.2rem] px-4 py-3.5"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
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
                  className="premium-button w-full rounded-[1.2rem] px-4 py-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Sending..." : "Send reset link"}
                </button>

                <div className="premium-card gold-border rounded-[1.4rem] px-4 py-4 text-sm text-slate-300">
                  Remember your password?{" "}
                  <Link
                    href="/login"
                    className="font-semibold text-amber-200 hover:text-amber-100"
                  >
                    Back to login
                  </Link>
                </div>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
