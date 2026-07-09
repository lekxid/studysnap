import EmptyState from "@/components/ui/EmptyState";
import PremiumCard from "@/components/ui/PremiumCard";
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
  const hasItems = items.length > 0;

  return (
    <PremiumCard>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader
          eyebrow="📖 Continue Learning"
          title="Pick up where you stopped"
          subtitle="Open your most recent project materials instantly."
        />

        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="shrink-0 rounded-full border border-yellow-400/25 bg-yellow-400/10 px-4 py-2 text-sm font-black text-yellow-100 transition hover:bg-yellow-400/20"
          >
            View all →
          </button>
        ) : null}
      </div>

      <div className="mt-6 rounded-[1.35rem] border border-cyan-300/15 bg-cyan-300/10 p-4">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100">
          Daily Smart Action
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-200">
          {hasItems
            ? "Review one uploaded material, then ask Project AI to explain the hardest part in simple words."
            : "Upload your first PDF or create a note so StudySnap can start building your learning memory."}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {hasItems ? (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onOpen}
              className="group flex w-full items-center justify-between gap-4 rounded-[1.35rem] border border-white/10 bg-black/25 p-4 text-left transition hover:-translate-y-0.5 hover:border-yellow-400/40 hover:bg-yellow-400/10"
            >
              <div className="min-w-0">
                <p className="line-clamp-1 break-all font-black text-white">
                  {item.icon || "📘"} {item.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {item.subtitle}
                </p>
              </div>

              <span className="shrink-0 rounded-full bg-white/[0.06] px-3 py-1 text-xs font-black text-yellow-200 group-hover:bg-yellow-400/15">
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
