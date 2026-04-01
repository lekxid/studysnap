"use client";

import AppShell from "@/components/AppShell";
import useRequireAuth from "@/hooks/useRequireAuth";

export default function GroupsPage() {
  const ready = useRequireAuth();
  if (!ready) return <div className="min-h-screen bg-black text-white p-6">Checking authentication...</div>;

  return (
    <AppShell title="Groups" subtitle="Collaborate with friends, share notes, and study together">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-xl font-semibold text-cyan-300">Study Groups</h3>
          <div className="mt-4 space-y-3 text-white/80">
            <div className="rounded-xl bg-white/5 p-4">Networking Team — 4 members</div>
            <div className="rounded-xl bg-white/5 p-4">Biology Buddies — 3 members</div>
            <div className="rounded-xl bg-white/5 p-4">Math Warriors — 5 members</div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
          <h3 className="text-xl font-semibold text-cyan-300">Leaderboard</h3>
          <div className="mt-4 space-y-3 text-white/80">
            <div className="rounded-xl bg-white/5 p-4">1. Alex — 300 XP</div>
            <div className="rounded-xl bg-white/5 p-4">2. You — 250 XP</div>
            <div className="rounded-xl bg-white/5 p-4">3. Maria — 200 XP</div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
