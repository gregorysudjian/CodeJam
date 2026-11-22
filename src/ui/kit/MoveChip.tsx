import * as React from "react";
import type { MoveType } from "@/contracts";
import { cn } from "@/ui/lib/utils";
import { MOVE_ACCENTS, MOVE_ICONS, MOVE_LABELS } from "./tokens";

export interface MoveChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  move: MoveType;
  size?: "sm" | "md";
  showIcon?: boolean;
}

/** Pill naming a move, tinted in that move's colour. */
export const MoveChip = React.forwardRef<HTMLSpanElement, MoveChipProps>(
  ({ move, size = "md", showIcon = true, className, style, ...props }, ref) => {
    const Icon = MOVE_ICONS[move];
    return (
      <span
        ref={ref}
        style={{ ["--chip" as string]: `var(--na-${MOVE_ACCENTS[move]})`, ...style }}
        className={cn(
          "chip-tint inline-flex items-center rounded-full font-display-italic leading-none tracking-[0.03em]",
          size === "sm" ? "h-8 gap-1.5 px-3 text-[16px]" : "h-11 gap-2 px-4 text-[20px]",
          className,
        )}
        {...props}
      >
        {showIcon ? <Icon aria-hidden="true" strokeWidth={2.75} className={size === "sm" ? "size-4" : "size-5"} /> : null}
        <span className="pr-[0.06em]">{MOVE_LABELS[move]}</span>
      </span>
    );
  },
);
MoveChip.displayName = "MoveChip";
