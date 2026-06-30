import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

export default function Button({
  children,
  loading,
  className = "",
  ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-900 transition hover:bg-cyan-400 disabled:opacity-50 ${className}`}
    >
      {loading ? "Loading..." : children}
    </button>
  );
}
