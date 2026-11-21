import * as React from "react";
import { cn } from "@/ui/lib/utils";
import { ACCENT_HEX, type AccentKey } from "./tokens";

export interface ProgressRingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0..1 */
  value: number;
  size?: number;
  thickness?: number;
  accent?: AccentKey;
  trackOpacity?: number;
  label?: string;
}

/** Circular SVG progress with a glowing arc and centred content. */
export const ProgressRing = React.forwardRef<HTMLDivElement, ProgressRingProps>(
  ({ value, size = 160, thickness = 12, accent = "lime", trackOpacity = 0.08, label, className, children, ...props }, ref) => {
    const v = Math.min(1, Math.max(0, value));
    const r = (size - thickness) / 2;
    const c = 2 * Math.PI * r;
    const color = ACCENT_HEX[accent];
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
        aria-label={label}
        className={cn("relative inline-grid place-items-center", className)}
        style={{ width: size, height: size }}
        {...props}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="white" strokeOpacity={trackOpacity} strokeWidth={thickness} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v)}
            opacity={v === 0 ? 0 : 1}
            style={{ filter: `drop-shadow(0 0 8px ${color}99)` }}
            className="transition-[stroke-dashoffset] duration-[450ms] ease-arena"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
      </div>
    );
  },
);
ProgressRing.displayName = "ProgressRing";
