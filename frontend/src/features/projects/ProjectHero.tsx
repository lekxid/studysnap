import PremiumCard from "@/components/ui/PremiumCard";
import PremiumButton from "@/components/ui/PremiumButton";

type ProjectHeroProps = {
  title: string;
  subject: string;
  description?: string | null;
  pdfCount: number;
  onBack: () => void;
  onAskAI: () => void;
  onUploadPDF: () => void;
};

export default function ProjectHero({
  title,
  subject,
  description,
  pdfCount,
  onBack,
  onAskAI,
  onUploadPDF,
}: ProjectHeroProps) {
  return (
    <PremiumCard className="overflow-hidden border-yellow-400/25 bg-gradient-to-br from-yellow-400/10 via-slate-950 to-slate-950">
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-sm font-bold text-yellow-200 transition hover:bg-yellow-400/20"
            >
              ← Projects
            </button>

            <div className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-xs font-black text-yellow-200">
              📁 Project Workspace
            </div>

            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300">
              {subject}
            </div>
          </div>

          <h1 className="max-w-4xl text-4xl font-black tracking-tight text-white sm:text-5xl">
            {title}
          </h1>

          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
            {description ||
              "This project keeps your AI chats, PDFs, notes, flashcards, quizzes, planner, and learning memory together."}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <PremiumButton type="button" onClick={onAskAI}>
              🤖 Ask Project AI
            </PremiumButton>

            <PremiumButton type="button" variant="secondary" onClick={onUploadPDF}>
              📄 Upload PDF
            </PremiumButton>
          </div>
        </div>

        <div className="rounded-[2rem] border border-yellow-400/20 bg-black/30 p-6">
          <div className="relative mx-auto grid h-32 w-32 place-items-center rounded-full border-[10px] border-yellow-400/80 bg-yellow-400/10">
            <div className="text-center">
              <p className="text-3xl font-black text-white">{pdfCount}</p>
              <p className="text-xs text-slate-400">PDFs</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm font-black text-yellow-200">Project Brain</p>
            <p className="mt-2 text-xs leading-6 text-slate-400">
              Ranking engine is active. Learning memory and instructions are coming next.
            </p>
          </div>
        </div>
      </div>
    </PremiumCard>
  );
}
