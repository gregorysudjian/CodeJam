import * as React from "react";
import { cn } from "@/ui/lib/utils";

export interface BustOutlineProps extends Omit<React.SVGProps<SVGSVGElement>, "ref" | "color"> {
  color?: string;
  dashed?: boolean;
}

/** Head-and-shoulders guide outline (treadmill framing). Sizes to its container via className. */
export const BustOutline = React.forwardRef<SVGSVGElement, BustOutlineProps>(
  ({ color = "#F5F7FA", dashed = true, className, style, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 200 160"
      fill="none"
      role="img"
      aria-label="Head and shoulders guide"
      className={cn("overflow-visible", className)}
      style={{ filter: `drop-shadow(0 2px 10px ${color}33)`, ...style }}
      {...props}
    >
      <g stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray={dashed ? "8 8" : undefined}>
        <ellipse cx={100} cy={52} rx={30} ry={38} />
        <path d="M 84 88 L 82 104 Q 40 108 22 132 Q 14 144 12 158 M 116 88 L 118 104 Q 160 108 178 132 Q 186 144 188 158" />
      </g>
    </svg>
  ),
);
BustOutline.displayName = "BustOutline";
