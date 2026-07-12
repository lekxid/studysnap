type Props = {
  hasContent?: boolean;
  onSummarize: () => void;
  onExplain: () => void;
  onLesson: () => void;
  onFlashcards: () => void;
  onQuiz: () => void;
  onAskAI: () => void;
};

type StudyAction = {
  label: string;
  icon: string;
  onClick: () => void;
  primary?: boolean;
};

export default function NotesAIToolbar({
  hasContent = false,
  onSummarize,
  onExplain,
  onLesson,
  onFlashcards,
  onQuiz,
  onAskAI,
}: Props) {
  const actions: StudyAction[] = [
    {
      label: "Summarize",
      icon: "✨",
      onClick: onSummarize,
    },
    {
      label: "Explain",
      icon: "💡",
      onClick: onExplain,
    },
    {
      label: "Create a lesson",
      icon: "🎓",
      onClick: onLesson,
    },
    {
      label: "Concept Cards",
      icon: "🗂️",
      onClick: onFlashcards,
    },
    {
      label: "Generate practice",
      icon: "🧠",
      onClick: onQuiz,
    },
    {
      label: "Ask AI Tutor",
      icon: "🤖",
      onClick: onAskAI,
      primary: true,
    },
  ];

  return (
    <section className="rounded-2xl border border-yellow-300/20 bg-[linear-gradient(135deg,rgba(250,204,21,0.09),rgba(8,17,29,0.72))] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-yellow-200">
            Next step
          </p>

          <h4 className="mt-2 text-lg font-black text-white">
            {hasContent
              ? "Your note is ready to study"
              : "Start with a few ideas"}
          </h4>

          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            {hasContent
              ? "Choose what StudySnap should do next with this note."
              : "Write class notes, paste key points, or capture something you want to remember."}
          </p>
        </div>

        <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${
          hasContent
            ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
            : "border-white/10 bg-white/5 text-slate-400"
        }`}>
          {hasContent ? "Ready for AI" : "Waiting for your note"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            disabled={!hasContent}
            className={`rounded-xl border px-3.5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-35 ${
              action.primary
                ? "border-yellow-300 bg-yellow-300 text-slate-950 hover:bg-yellow-200"
                : "border-white/10 bg-black/25 text-slate-200 hover:border-yellow-300/30 hover:bg-yellow-300/10 hover:text-white"
            }`}
          >
            <span className="mr-2" aria-hidden="true">
              {action.icon}
            </span>
            {action.label}
          </button>
        ))}
      </div>

      {!hasContent ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          These study actions will become available as soon as you add content.
        </p>
      ) : null}
    </section>
  );
}
