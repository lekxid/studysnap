import Link from "next/link";

import PremiumCard from "@/components/ui/PremiumCard";
import SectionHeader from "@/components/ui/SectionHeader";

type Action = {
  title: string;
  description: string;
  icon: string;
  href?: string;
  onClick?: () => void;
};

export default function ProjectQuickActions({
  actions,
}: {
  actions: Action[];
}) {
  return (
    <PremiumCard>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader
          eyebrow="⚡ Quick Actions"
          title="Your study command center"
          subtitle="Jump to the exact StudySnap tool you need."
        />

        <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black text-slate-300">
          One-click workflow
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((action, index) => {
          const content = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-2xl">
                  {action.icon}
                </div>

                <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-black text-slate-400">
                  0{index + 1}
                </span>
              </div>

              <p className="mt-5 break-words text-base font-black leading-tight text-white">
                {action.title}
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                {action.description}
              </p>

              <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-yellow-200">
                Open →
              </p>
            </>
          );

          const className =
            "rounded-[1.4rem] border border-white/10 bg-black/25 p-5 text-left transition hover:-translate-y-1 hover:border-yellow-400/40 hover:bg-yellow-400/10";

          if (action.href) {
            return (
              <Link key={action.title} href={action.href} className={className}>
                {content}
              </Link>
            );
          }

          return (
            <button
              key={action.title}
              type="button"
              onClick={action.onClick}
              className={className}
            >
              {content}
            </button>
          );
        })}
      </div>
    </PremiumCard>
  );
}
