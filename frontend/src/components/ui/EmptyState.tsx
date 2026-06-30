type Props = {
  title: string;
  description: string;
};

export default function EmptyState({
  title,
  description,
}: Props) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center">
      <h2 className="text-xl font-semibold text-white">
        {title}
      </h2>

      <p className="mt-3 text-slate-400">
        {description}
      </p>
    </div>
  );
}
