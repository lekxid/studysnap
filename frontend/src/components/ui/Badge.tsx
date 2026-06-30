import { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export default function Badge({ children }: Props) {
  return (
    <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-semibold text-cyan-300">
      {children}
    </span>
  );
}
