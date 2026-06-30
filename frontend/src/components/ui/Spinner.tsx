export default function Spinner() {
  return (
    <div className="flex items-center gap-2 text-cyan-400">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      <span>StudySnap AI is thinking...</span>
    </div>
  );
}
