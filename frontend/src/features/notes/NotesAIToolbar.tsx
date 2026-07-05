type NotesAIToolbarProps = {
  onSummarize?: () => void;
  onExplain?: () => void;
  onLesson?: () => void;
  onFlashcards?: () => void;
  onQuiz?: () => void;
  onAskAI?: () => void;
};

export default function NotesAIToolbar({
  onSummarize,
  onExplain,
  onLesson,
  onFlashcards,
  onQuiz,
  onAskAI,
}: NotesAIToolbarProps) {
  const buttonClass =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700";

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">
          AI Study Tools
        </h3>
        <p className="text-xs text-slate-500">
          Turn your notes into summaries, lessons, flashcards, quizzes, and AI help.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onSummarize} className={buttonClass}>
          ✨ Summarize
        </button>

        <button type="button" onClick={onExplain} className={buttonClass}>
          💡 Explain
        </button>

        <button type="button" onClick={onLesson} className={buttonClass}>
          🎓 Lesson
        </button>

        <button type="button" onClick={onFlashcards} className={buttonClass}>
          📚 Flashcards
        </button>

        <button type="button" onClick={onQuiz} className={buttonClass}>
          ❓ Quiz
        </button>

        <button type="button" onClick={onAskAI} className={buttonClass}>
          🤖 Ask AI
        </button>
      </div>
    </div>
  );
}
