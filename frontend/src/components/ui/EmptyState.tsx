export default function EmptyState({
  title,
  message,
  description,
}: {
  title: string;
  message?: string;
  description?: string;
}) {
  const body = message || description || "";

  return (
    <div className="rounded-3xl border border-dashed border-yellow-400/30 bg-yellow-400/10 p-6 text-yellow-100">
      <p className="font-black">{title}</p>
      {body ? (
        <p className="mt-2 text-sm leading-6 text-yellow-100/80">{body}</p>
      ) : null}
    </div>
  );
}
