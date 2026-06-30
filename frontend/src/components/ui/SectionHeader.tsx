type Props = {
  title: string;
  subtitle?: string;
};

export default function SectionHeader({
  title,
  subtitle,
}: Props) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold text-white">
        {title}
      </h1>

      {subtitle && (
        <p className="mt-2 text-slate-400">
          {subtitle}
        </p>
      )}
    </div>
  );
}
