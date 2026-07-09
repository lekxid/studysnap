import { ReactNode } from "react";

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-black text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return part;
  });
}

export default function SimpleMarkdown({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const lines = content.split("\n");

  return (
    <div className={`space-y-4 text-sm leading-8 text-slate-100 ${className}`}>
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={index} className="h-1" />;
        }

        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={index} className="pt-2 text-xl font-black text-white">
              {trimmed.replace(/^###\s+/, "")}
            </h3>
          );
        }

        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={index} className="pt-3 text-2xl font-black text-white">
              {trimmed.replace(/^##\s+/, "")}
            </h2>
          );
        }

        if (trimmed.startsWith("# ")) {
          return (
            <h1 key={index} className="pt-3 text-3xl font-black text-white">
              {trimmed.replace(/^#\s+/, "")}
            </h1>
          );
        }

        if (/^\d+\.\s+/.test(trimmed)) {
          return (
            <p key={index} className="pl-2 font-semibold text-slate-100">
              {renderInline(trimmed)}
            </p>
          );
        }

        if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
          return (
            <p key={index} className="pl-5 text-slate-200">
              <span className="mr-2 text-cyan-300">•</span>
              {renderInline(trimmed.replace(/^[-•]\s+/, ""))}
            </p>
          );
        }

        return (
          <p key={index} className="text-slate-200">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}
