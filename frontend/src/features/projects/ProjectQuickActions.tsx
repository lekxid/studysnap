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
      <SectionHeader
        eyebrow="⚡ Quick Actions"
        title="Start studying fast"
        subtitle="Everything important should be one click away."
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => {
          const content = (
            <>
              <div className="text-3xl">{action.icon}</div>
              <p className="mt-4 break-words text-base font-black leading-tight text-white">
                {action.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {action.description}
              </p>
            </>
          );

          const className =
            "rounded-2xl border border-white/10 bg-black/25 p-4 text-left transition hover:-translate-y-1 hover:border-yellow-400/40 hover:bg-yellow-400/10";

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
