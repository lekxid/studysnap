"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import AuthShell from "@/components/auth/AuthShell";
import { resetPassword } from "@/lib/api";

export default function ResetPasswordPage() {
  const [token, setToken] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

    setToken(
      params.get("token") || ""
    );

    setEmail(
      params.get("email") || ""
    );
  }, []);

  async function handleSubmit(
    event: FormEvent
  ) {
    event.preventDefault();
    setError("");

    if (!token) {
      setError(
        "This reset link is incomplete. Request a new link."
      );
      return;
    }

    if (password.length < 8) {
      setError(
        "Password must be at least 8 characters."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(
        "The passwords do not match."
      );
      return;
    }

    setLoading(true);

    try {
      await resetPassword(
        token,
        password
      );

      const params =
        new URLSearchParams();

      if (email) {
        params.set(
          "email",
          email
        );
      }

      params.set(
        "reset",
        "1"
      );

      window.location.replace(
        `/login?${params.toString()}`
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Password reset failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      badge="Secure account recovery"
      title="Choose a new password"
      subtitle="Enter a new password for your StudySnap account."
      sideTitle="Return to your study workspace."
      sideSubtitle="After the password changes, previous StudySnap sessions are signed out to help protect your account."
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <div>
          <label className="mb-2 block text-sm font-bold text-slate-200">
            New password
          </label>

          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
            placeholder="At least 8 characters"
            className="w-full rounded-[1.2rem] border border-white/10 bg-slate-900/75 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-200">
            Confirm new password
          </label>

          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) =>
              setConfirmPassword(
                event.target.value
              )
            }
            placeholder="Enter it again"
            className="w-full rounded-[1.2rem] border border-white/10 bg-slate-900/75 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
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
          {loading
            ? "Changing password..."
            : "Change password"}
        </button>

        <div className="premium-card gold-border rounded-[1.4rem] px-4 py-3.5 text-center text-sm text-slate-300">
          Need another link?{" "}
          <Link
            href="/forgot-password"
            className="font-bold text-amber-200 transition hover:text-amber-100"
          >
            Request a new one
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
