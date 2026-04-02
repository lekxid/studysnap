"use client";

import { useEffect, useState } from "react";

type TokenPayload = {
  sub?: string;
  user_id?: number;
  full_name?: string;
  exp?: number;
};

function parseJwt(token: string): TokenPayload | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );

    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const [checked, setChecked] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    const payload = parseJwt(token);

    if (!payload) {
      localStorage.removeItem("token");
      window.location.href = "/login";
      return;
    }

    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem("token");
      window.location.href = "/login";
      return;
    }

    setFullName(payload.full_name || "User");
    setEmail(payload.sub || "");
    setChecked(true);
  }, []);

  if (!checked) {
    return (
      <main className="premium-bg flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-slate-950/40 p-6 text-center text-white shadow-[0_24px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8">
          Checking login...
        </div>
      </main>
    );
  }

  return (
    <main className="premium-bg flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-5xl rounded-[2rem] border border-white/10 bg-slate-950/40 p-6 text-white shadow-[0_24px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="gold-chip mb-4">Dashboard</div>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              Welcome, {fullName}
            </h1>
            <p className="mt-4 text-base leading-8 text-slate-300">
              Logged in as: {email}
            </p>
            <p className="mt-2 text-base leading-8 text-slate-300">
              You are logged in successfully.
            </p>
          </div>

          <button
            onClick={() => {
              localStorage.removeItem("token");
              window.location.href = "/login";
            }}
            className="rounded-[1.2rem] border border-red-400/20 bg-red-500/10 px-5 py-3 text-sm font-bold text-red-200"
          >
            Logout
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-xl font-bold text-white">Study Rooms</h2>
            <p className="mt-2 text-sm text-slate-300">
              Active spaces for your subjects.
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-xl font-bold text-white">Notes</h2>
            <p className="mt-2 text-sm text-slate-300">
              Your saved notes and summaries.
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-xl font-bold text-white">Quizzes</h2>
            <p className="mt-2 text-sm text-slate-300">
              Test your knowledge.
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-xl font-bold text-white">AI Tutor</h2>
            <p className="mt-2 text-sm text-slate-300">
              Ask anything and learn faster.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
