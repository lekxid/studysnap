"use client";

import { useEffect, useState } from "react";
import { loadJSON, saveJSON } from "@/lib/storage";

type Notice = {
  id: number;
  text: string;
  createdAt: string;
};

const STORAGE_KEY = "studysnap_notifications";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);

  useEffect(() => {
    setItems(loadJSON<Notice[]>(STORAGE_KEY, []));
  }, []);

  function clearAll() {
    setItems([]);
    saveJSON(STORAGE_KEY, []);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-3 rounded-[1rem] border border-amber-300/20 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-100 shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition hover:bg-white/[0.06]"
      >
        <span className="text-amber-200">🔔</span>
        <span>Notifications</span>
        <span className="rounded-full border border-amber-300/25 bg-amber-400/12 px-2 py-0.5 text-xs font-bold text-amber-100">
          {items.length}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-3 w-[22rem] rounded-[1.5rem] border border-white/10 bg-[#0a1022]/95 p-4 text-white shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:w-96">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="gold-chip mb-3">Alerts</div>
              <h3 className="text-lg font-black text-white">Notifications</h3>
            </div>

            <button
              type="button"
              onClick={clearAll}
              className="text-sm font-semibold text-red-300 hover:text-red-200"
            >
              Clear all
            </button>
          </div>

          {items.length === 0 ? (
            <div className="empty-state mt-4">
              No notifications yet.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4"
                >
                  <p className="text-sm leading-7 text-white">{item.text}</p>
                  <p className="mt-2 text-xs text-slate-400">{item.createdAt}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
