import PremiumCard from "@/components/ui/PremiumCard";
import SectionHeader from "@/components/ui/SectionHeader";

export default function ProjectProgress({
  percent,
  pdfCount,
}: {
  percent: number;
  pdfCount: number;
}) {
  return (
    <PremiumCard>
      <SectionHeader
        eyebrow="📊 Progress"
        title="Your project progress"
        subtitle="A simple snapshot of your learning activity."
      />

      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="grid h-36 w-36 shrink-0 place-items-center rounded-full border-[12px] border-yellow-400/80 bg-yellow-400/10">
          <div className="text-center">
            <p className="text-4xl font-black text-white">{percent}%</p>
            <p className="text-xs text-slate-400">Overall</p>
          </div>
        </div>

        <div className="grid flex-1 gap-3 text-sm">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-slate-300">
            📄 PDFs Uploaded <span className="font-black text-white">{pdfCount}</span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-slate-300">
            📝 Notes Added <span className="font-black text-white">Coming soon</span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-slate-300">
            🧠 Flashcards Reviewed <span className="font-black text-white">Coming soon</span>
          </div>
        </div>
      </div>
    </PremiumCard>
  );
}
