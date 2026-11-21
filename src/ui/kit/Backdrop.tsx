import * as React from "react";
import { cn } from "@/ui/lib/utils";

export type BackdropVariant = "arena" | "track" | "plain";

export interface BackdropProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BackdropVariant;
  /** Render inside the parent (absolute) instead of fixed to the viewport. */
  contained?: boolean;
}

/**
 * Full-screen stadium background.
 *
 * Previously three drifting colour pools (lime, cyan, magenta) over a scrolling
 * neon grid. Three hues at once meant the page had no single light source, and
 * the lime and magenta pools overlapped into a muddy brown band across the
 * lower third. This is now one warm-lime key light from above, which gives the
 * page a direction, plus an optional floor that recedes instead of competing.
 */
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
        <>
          {/* Key light: one source, top-centre, so every surface is lit the same way. */}
          <div className="pool -top-[38%] left-1/2 h-[80%] w-[90%] -translate-x-1/2 bg-lime/[0.07]" />
          {/* A cool counter-light at the far edge, barely there, to keep the
              neutrals from reading flat. */}
          <div className="pool -right-[20%] top-[18%] h-[60%] w-[45%] bg-cyan/[0.035]" />
        </>
      )}
      {variant === "track" && (
        <>
          <div className="horizon-glow" />
          <div className="track-floor" />
          <div className="absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-bg via-bg/70 to-transparent" />
        </>
      )}
      {/* Vignette: pulls the eye to the centre and stops the pools touching the edges. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,transparent_30%,var(--na-bg)_95%)]" />
      <div className="grain absolute inset-0" />
      {children}
    </div>
  ),
);
Backdrop.displayName = "Backdrop";
