import * as React from "react";
import { cn } from "@/ui/lib/utils";

export type BackdropVariant = "arena" | "track" | "plain";

export interface BackdropProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BackdropVariant;
  /** Render inside the parent (absolute) instead of fixed to the viewport. */
  contained?: boolean;
}

/** Full-screen stadium background: base colour, drifting neon pools, grain and an optional track floor. */
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
          <div className="pool animate-drift-a -left-[10%] -top-[20%] h-[70%] w-[60%] bg-lime/[0.16]" />
          <div className="pool animate-drift-b -right-[15%] top-[5%] h-[75%] w-[55%] bg-cyan/[0.16]" />
          <div className="pool animate-drift-c bottom-[-30%] left-[25%] h-[60%] w-[50%] bg-magenta/[0.08]" />
        </>
      )}
      {variant === "track" && (
        <>
          <div className="horizon-glow" />
          <div className="track-floor animate-grid-scroll" />
          <div className="absolute inset-x-0 top-0 h-[38%] bg-gradient-to-b from-bg via-bg/60 to-transparent" />
        </>
      )}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,var(--na-bg)_100%)]" />
      <div className="grain absolute inset-0" />
      {children}
    </div>
  ),
);
Backdrop.displayName = "Backdrop";
