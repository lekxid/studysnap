import PremiumButton from "@/components/ui/PremiumButton";
import PremiumCard from "@/components/ui/PremiumCard";

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
    <PremiumCard className="overflow-hidden border-yellow-400/25 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.18),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))]">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-sm font-black text-yellow-100 transition hover:bg-yellow-400/20"
            >
              ← Projects
            </button>

            <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-yellow-100">
              AI Project Room
            </span>

            <span className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-bold text-slate-300">
              {subject}
            </span>
          </div>

          <h1 className="max-w-5xl text-4xl font-black tracking-tight text-white sm:text-5xl">
            {title}
          </h1>

          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
            {description ||
              "Your PDFs, notes, flashcards, quizzes, planner, AI Tutor, search, and StudySnap Brain now work together inside one connected learning workspace."}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <PremiumButton type="button" onClick={onAskAI}>
              🤖 Ask Project AI
            </PremiumButton>

            <PremiumButton type="button" variant="secondary" onClick={onUploadPDF}>
              📄 Open PDF Workspace
            </PremiumButton>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-2xl font-black text-white">{pdfCount}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">PDFs connected</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-2xl font-black text-white">Live</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">Project search</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-2xl font-black text-white">AI</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">Tutor ready</p>
            </div>
          </div>
        </div>

        <aside className="rounded-[2rem] border border-yellow-400/20 bg-black/30 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-200">
                Smart Status
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Project Brain
              </h2>
            </div>

            <div className="grid h-16 w-16 place-items-center rounded-3xl border border-yellow-400/30 bg-yellow-400/10 text-3xl">
              🧠
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-black text-yellow-100">Ranking engine active</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Search results are ranked before opening notes, PDFs, flashcards, or AI.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-black text-cyan-100">Connected workspace</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Actions now keep the student inside the correct project context.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-black text-emerald-100">Next best action</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Upload, review, ask, or search without jumping between disconnected pages.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </PremiumCard>
  );
}
