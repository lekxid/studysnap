export default function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-yellow-400/30 bg-yellow-400/10 p-6 text-yellow-100">
      <p className="font-black">{title}</p>
      <p className="mt-2 text-sm leading-6 text-yellow-100/80">{message}</p>
    </div>
  );
}
