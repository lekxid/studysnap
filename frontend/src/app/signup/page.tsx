"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { signup, setToken } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const data = await signup(name, email, password);

      if (data?.access_token) {
        setToken(data.access_token);
      }

      setSuccess("Account created successfully.");
      router.push("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Signup failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="premium-bg flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/40 shadow-[0_24px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl lg:grid-cols-[0.98fr_1.02fr]">
        <section className="hidden border-r border-white/10 p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <div className="brand-mark" />
              <div className="gold-chip">Build your study system</div>
            </div>

            <h1 className="max-w-xl text-5xl font-black leading-tight tracking-tight text-white">
              Start strong with
              <span className="glow-title mt-2 block bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-300 bg-clip-text text-transparent">
                StudySnap AI
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-8 text-slate-300">
              Create your account and organize your study rooms, AI help,
              flashcards, quizzes, and planner in one premium workspace.
            </p>
          </div>

          <div className="content-grid mt-10">
            <div className="premium-card gold-border rounded-[1.75rem] p-6">
              <p className="text-sm font-semibold text-amber-200">
                What you unlock
              </p>

              <div className="mt-5 grid gap-3">
                <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                  Personalized study workflow
                </div>
                <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                  Flashcards, quizzes, and planner tools
                </div>
                <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                  AI guidance built into your study flow
                </div>
              </div>
            </div>

            <div className="gold-card rounded-[1.75rem] p-6">
              <p className="text-sm font-semibold text-amber-100">
                Clean start
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-200">
                Set up your account, choose your learning preferences, and start
                building your study streak.
              </p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-8 lg:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <div className="gold-chip mb-4">Create account</div>
              <h2 className="text-3xl font-black tracking-tight text-white">
                Sign up
              </h2>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                Build your workspace and start studying smarter from day one.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-200">
                  Name
                </label>
                <input
                  type="text"
                  className="rounded-[1.2rem] px-4 py-3.5"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </div>

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

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-200">
                  Password
                </label>
                <input
                  type="password"
                  className="rounded-[1.2rem] px-4 py-3.5"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  required
                />
              </div>

              {error ? (
                <div className="rounded-[1.2rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="rounded-[1.2rem] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {success}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="premium-button w-full rounded-[1.2rem] px-4 py-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Creating account..." : "Sign up"}
              </button>
            </form>

            <div className="premium-card gold-border mt-6 rounded-[1.4rem] px-4 py-4 text-sm text-slate-300">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-amber-200 hover:text-amber-100"
              >
                Log in
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
