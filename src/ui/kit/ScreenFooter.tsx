import type { ReactNode } from "react";
import { cn } from "@/ui/lib/utils";

/** Shared quiet footer: navigation left, round context centre, main action right. */
export function ScreenFooter({
  left,
  children,
  right,
  className,
}: {
  left?: ReactNode;
  children?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "screen-footer flex flex-wrap items-center justify-between gap-4 border-t border-glass-border bg-bg px-2 py-4 backdrop-blur-xl",
        className,
      )}
    >
      <div className="shrink-0">{left}</div>
      {children && <div className="min-w-0 flex-1 text-center">{children}</div>}
      <div className="ml-auto shrink-0">{right}</div>
    </div>
  );
}
