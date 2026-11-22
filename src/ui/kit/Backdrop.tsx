import * as React from "react";
import { cn } from "@/ui/lib/utils";
import { MontrealSkyline } from "./MontrealSkyline";

export type BackdropVariant = "arena" | "track" | "plain";

export interface BackdropProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BackdropVariant;
  /** Render inside the parent (absolute) instead of fixed to the viewport. */
  contained?: boolean;
}

/** Full-screen page background: near-black with static neon pools and a glowing Montreal skyline
 *  along the bottom ("arena"); "track" (landing and leaderboard) adds the runner's lane floor and
 *  a horizon line. "plain" is the colour only. Nothing here animates or blurs: cheap to paint. */
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
      {variant !== "plain" && <div className="pool" />}
      {variant === "track" && (
        <div className="absolute inset-x-0 bottom-0 h-[55%] overflow-hidden opacity-30">
          <div className="horizon-glow !top-0" />
          <div className="track-floor !bottom-0 !h-full" />
        </div>
      )}
      {variant !== "plain" && (
        <MontrealSkyline
          className={cn(
            "absolute inset-x-0 bottom-0 h-[18vh] max-h-[200px] w-full text-cyan",
            variant === "track" ? "opacity-[0.14]" : "opacity-[0.1]",
          )}
        />
      )}
      {children}
    </div>
  ),
);
Backdrop.displayName = "Backdrop";
