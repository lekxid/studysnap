export default function StatCard({
  label,
  value,
  hint,
  tone = "yellow",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "yellow" | "blue" | "emerald" | "pink" | "purple" | "orange";
}) {
  const tones = {
    yellow: "border-yellow-400/20 bg-yellow-400/10 text-yellow-200",
    blue: "border-blue-400/20 bg-blue-400/10 text-blue-200",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    pink: "border-pink-400/20 bg-pink-400/10 text-pink-200",
    purple: "border-purple-400/20 bg-purple-400/10 text-purple-200",
    orange: "border-orange-400/20 bg-orange-400/10 text-orange-200",
  };

  return (
    <div className={`rounded-3xl border p-5 ${tones[tone]}`}>
      <p className="text-sm font-bold">{label}</p>
      <p className="mt-2 text-4xl font-black text-white">{value}</p>
      {hint ? <p className="mt-1 text-sm text-slate-400">{hint}</p> : null}
    </div>
  );
}
