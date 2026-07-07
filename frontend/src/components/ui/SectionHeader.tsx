export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      {eyebrow ? (
        <div className="mb-3 inline-flex rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-xs font-black text-yellow-200">
          {eyebrow}
        </div>
      ) : null}

      <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
        {title}
      </h2>

      {subtitle ? (
        <p className="mt-2 text-sm leading-6 text-slate-400">{subtitle}</p>
      ) : null}
    </div>
  );
}
