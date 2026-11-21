import * as React from "react";
import { cn } from "@/ui/lib/utils";
import { AnimatedNumber } from "./AnimatedNumber";
import { ACCENT_TEXT, type AccentKey } from "./tokens";

export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  accent?: AccentKey;
  size?: "md" | "lg";
  /** Count up numeric values. */
  animate?: boolean;
  format?: (n: number) => string;
}

/** Scoreboard-style stat: eyebrow label, huge italic number, unit and hint. */
export const StatTile = React.forwardRef<HTMLDivElement, StatTileProps>(
  ({ label, value, unit, hint, accent = "lime", size = "md", animate = false, format, className, ...props }, ref) => (
    <div ref={ref} className={cn("glass flex flex-col gap-3 rounded-[24px] p-6", className)} {...props}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={cn("size-2 rounded-full bg-current", ACCENT_TEXT[accent])} />
        <span className="eyebrow text-text-muted">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-display-italic pr-[0.06em] tabular-nums",
            ACCENT_TEXT[accent],
            size === "lg" ? "text-display-md" : "text-display-sm",
          )}
        >
          {typeof value === "number" && animate ? (
            format ? <AnimatedNumber value={value} format={format} /> : <AnimatedNumber value={value} />
          ) : (
            value
          )}
        </span>
        {unit ? <span className="font-display text-title font-bold uppercase text-text-muted">{unit}</span> : null}
      </div>
      {hint ? <p className="text-caption text-text-muted">{hint}</p> : null}
    </div>
  ),
);
StatTile.displayName = "StatTile";
