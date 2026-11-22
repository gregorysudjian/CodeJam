import * as React from "react";
import { cn } from "@/ui/lib/utils";

export interface KeyHintProps extends React.HTMLAttributes<HTMLElement> {
  /** Key label, e.g. "K", "ESC", "ENTER". */
  keyLabel: string;
  tone?: "default" | "onLime";
}

/** A keyboard key cap. Hidden when the main pointer is a finger (a phone from the QR code). */
export const KeyHint = React.forwardRef<HTMLElement, KeyHintProps>(
  ({ keyLabel, tone = "default", className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        "inline-flex pointer-coarse:hidden h-7 min-w-7 items-center justify-center rounded-md border px-2 font-sans text-[13px] font-semibold not-italic leading-none tracking-[0.08em]",
        tone === "default"
          ? "border-text/20 bg-text/[0.05] text-text-muted shadow-[inset_0_-2px_0_color-mix(in_srgb,var(--na-text)_12%,transparent)]"
          : "border-bg/25 bg-bg/10 text-bg shadow-[inset_0_-2px_0_rgba(7,9,13,0.18)]",
        className,
      )}
      {...props}
    >
      {keyLabel}
    </kbd>
  ),
);
KeyHint.displayName = "KeyHint";
