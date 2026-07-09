import PremiumCard from "@/components/ui/PremiumCard";
import SectionHeader from "@/components/ui/SectionHeader";

export default function ProjectProgress({
  percent,
  pdfCount,
}: {
  percent: number;
  pdfCount: number;
}) {
  const safePercent = Math.max(0, Math.min(100, percent));

  const items = [
    {
      label: "PDFs Uploaded",
      value: String(pdfCount),
      icon: "📄",
    },
    {
      label: "Notes Added",
      value: "Connected",
      icon: "📝",
    },
    {
      label: "Flashcards Reviewed",
      value: "Ready",
      icon: "🧠",
    },
  ];

  return (
    <PremiumCard>
      <SectionHeader
        eyebrow="📊 Progress"
        title="Learning snapshot"
        subtitle="A simple view of how active this project is right now."
      />

      <div className="mt-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-5xl font-black tracking-tight text-white">
              {safePercent}%
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Project readiness
            </p>
          </div>

          <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 px-4 py-3 text-right">
            <p className="text-sm font-black text-yellow-100">
              {pdfCount > 0 ? "Active" : "Start"}
            </p>
            <p className="text-xs text-slate-400">
              {pdfCount > 0 ? "Materials found" : "Upload first PDF"}
            </p>
          </div>
        </div>

        <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-yellow-300"
            style={{ width: `${safePercent}%` }}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/25 p-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">
                {item.icon} {item.label}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Tracked inside this project room
              </p>
            </div>

            <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black text-slate-200">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </PremiumCard>
  );
}
