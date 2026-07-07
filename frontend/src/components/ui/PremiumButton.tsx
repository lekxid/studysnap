import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger";

export default function PremiumButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
}) {
  const styles = {
    primary: "bg-yellow-400 text-slate-950 hover:bg-yellow-300",
    secondary: "border border-white/10 bg-white/5 text-white hover:border-yellow-400/40",
    danger: "border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20",
  };

  return (
    <button
      {...props}
      className={`rounded-2xl px-5 py-3 text-sm font-black transition disabled:opacity-60 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
