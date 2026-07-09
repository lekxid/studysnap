type ProjectToolTabsProps = {
  activeTool: "ai" | "pdf";
  onOpenAI: () => void;
  onOpenPDF: () => void;
  onOpenNotes: () => void;
  onOpenFlashcards: () => void;
  onOpenQuizzes: () => void;
  onOpenPlanner: () => void;
};

const tools = [
  {
    key: "ai",
    title: "Project AI",
    description: "Ask anything",
    icon: "🤖",
  },
  {
    key: "pdf",
    title: "PDF Workspace",
    description: "Upload and chat",
    icon: "📄",
  },
  {
    key: "notes",
    title: "Notes",
    description: "Write ideas",
    icon: "📝",
  },
  {
    key: "flashcards",
    title: "Flashcards",
    description: "Review cards",
    icon: "🧠",
  },
  {
    key: "quizzes",
    title: "Quizzes",
    description: "Test yourself",
    icon: "🧾",
  },
  {
    key: "planner",
    title: "Planner",
    description: "Plan study",
    icon: "📅",
  },
] as const;

export default function ProjectToolTabs({
  activeTool,
  onOpenAI,
  onOpenPDF,
  onOpenNotes,
  onOpenFlashcards,
  onOpenQuizzes,
  onOpenPlanner,
}: ProjectToolTabsProps) {
  function handleOpen(key: string) {
    if (key === "ai") onOpenAI();
    if (key === "pdf") onOpenPDF();
    if (key === "notes") onOpenNotes();
    if (key === "flashcards") onOpenFlashcards();
    if (key === "quizzes") onOpenQuizzes();
    if (key === "planner") onOpenPlanner();
  }

  return (
    <section className="rounded-[1.7rem] border border-white/10 bg-slate-950/80 p-4">
      <div className="mb-4 flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-200">
            StudySnap Workspace
          </p>
          <h2 className="mt-1 text-xl font-black text-white">
            Everything connected in this project
          </h2>
        </div>

        <p className="text-xs font-semibold text-slate-500">
          Choose a tool and StudySnap keeps the room context.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {tools.map((tool) => {
          const isActive = tool.key === activeTool;

          return (
            <button
              key={tool.key}
              type="button"
              onClick={() => handleOpen(tool.key)}
              className={`rounded-[1.25rem] border p-4 text-left transition hover:-translate-y-0.5 ${
                isActive
                  ? "border-yellow-400/40 bg-yellow-400/15"
                  : "border-white/10 bg-black/25 hover:border-yellow-400/30 hover:bg-yellow-400/10"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-2xl">{tool.icon}</span>

                {isActive ? (
                  <span className="rounded-full bg-yellow-300 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-950">
                    Open
                  </span>
                ) : null}
              </div>

              <p className="mt-4 text-sm font-black text-white">{tool.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {tool.description}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
