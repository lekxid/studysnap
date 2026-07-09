import { FormEvent } from "react";

type ProjectSearchProps = {
  placeholder?: string;
  onSearch: (query: string) => void;
};

export default function ProjectSearch({
  placeholder = "Search this project’s PDFs, notes, flashcards, and memory...",
  onSearch,
}: ProjectSearchProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const query = String(formData.get("projectSearch") || "").trim();

    if (!query) return;

    onSearch(query);
    event.currentTarget.reset();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-3 rounded-[1.5rem] border border-yellow-400/20 bg-black/30 px-4 py-3 shadow-2xl shadow-yellow-500/5"
    >
      <span className="text-xl text-yellow-300">🔎</span>

      <input
        name="projectSearch"
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
      />

      <button
        type="submit"
        className="rounded-2xl bg-yellow-400 px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-yellow-300"
      >
        Ask
      </button>
    </form>
  );
}
