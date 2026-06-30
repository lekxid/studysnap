import { ReactNode } from "react";

type CardProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export default function Card({
  title,
  children,
  className = "",
}: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-700 bg-slate-900 shadow-lg ${className}`}
    >
      {title && (
        <div className="border-b border-slate-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
      )}

      <div className="p-6">{children}</div>
    </div>
  );
}
