import PremiumCard from "@/components/ui/PremiumCard";
import EmptyState from "@/components/ui/EmptyState";
import SectionHeader from "@/components/ui/SectionHeader";

type ContinueItem = {
  id: number;
  title: string;
  subtitle: string;
  icon?: string;
  onOpen: () => void;
};

export default function ContinueLearning({
  items,
  onViewAll,
}: {
  items: ContinueItem[];
  onViewAll?: () => void;
}) {
  return (
    <PremiumCard>
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          eyebrow="📖 Continue Learning"
          title="Pick up where you stopped"
          subtitle="Resume recent materials, chats, and activities."
        />

        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="shrink-0 text-sm font-bold text-yellow-300 hover:text-yellow-100"
          >
            View all →
          </button>
        ) : null}
      </div>

      <div className="mt-6 space-y-3">
        {items.length ? (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onOpen}
              className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-left transition hover:border-yellow-400/40"
            >
              <div className="min-w-0">
                <p className="line-clamp-1 break-all font-bold text-white">
                  {item.icon || "📘"} {item.title}
                </p>
                <p className="mt-1 text-xs text-slate-400">{item.subtitle}</p>
              </div>

              <span className="shrink-0 text-sm font-bold text-yellow-300">
                Open →
              </span>
            </button>
          ))
        ) : (
          <EmptyState
            title="Nothing to continue yet"
            message="Upload a PDF, create a note, or ask the AI to begin."
          />
        )}
      </div>
    </PremiumCard>
  );
}
