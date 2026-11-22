import * as React from "react";
import { cn } from "@/ui/lib/utils";
import { MontrealSkyline } from "./MontrealSkyline";

export type BackdropVariant = "arena" | "track" | "plain";

export interface BackdropProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BackdropVariant;
  /** Render inside the parent (absolute) instead of fixed to the viewport. */
  contained?: boolean;
}

/** Full-screen page background: limestone, with a faint Montreal skyline along the bottom
 *  ("arena") or a stronger one ("track", landing and leaderboard). "plain" is the colour only. */
export const Backdrop = React.forwardRef<HTMLDivElement, BackdropProps>(
  ({ variant = "arena", contained = false, className, children, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        contained ? "absolute" : "fixed",
        "inset-0 -z-10 overflow-hidden bg-bg",
        className,
      )}
      {...props}
    >
      {variant !== "plain" && (
        <MontrealSkyline
          className={cn(
            "absolute inset-x-0 bottom-0 h-[18vh] max-h-[200px] w-full text-text",
            variant === "track" ? "opacity-[0.1]" : "opacity-[0.06]",
          )}
        />
      )}
      {children}
    </div>
  ),
);
Backdrop.displayName = "Backdrop";
