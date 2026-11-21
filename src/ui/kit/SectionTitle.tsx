import * as React from "react";
import { cn } from "@/ui/lib/utils";
import { ACCENT_TEXT, type AccentKey } from "./tokens";

export interface EyebrowProps extends React.HTMLAttributes<HTMLParagraphElement> {
  accent?: AccentKey | "muted" | "neutral";
}

/**
 * Small wide-tracked uppercase label.
 *
 * Defaults to neutral. This used to default to `lime`, so every eyebrow on
 * every screen was painted in the brand accent — on the landing page alone
 * that put lime in four places and left nothing for the accent to single out.
 * An eyebrow names the section below it; it is the quietest thing on screen.
 * Pass an accent only where the label itself is the signal.
 */
export const Eyebrow = React.forwardRef<HTMLParagraphElement, EyebrowProps>(
  ({ accent = "neutral", className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        "eyebrow",
        accent === "neutral"
          ? "text-text-dim"
          : accent === "muted"
            ? "text-text-muted"
            : ACCENT_TEXT[accent],
        className,
      )}
      {...props}
    />
  ),
);
Eyebrow.displayName = "Eyebrow";

export interface SectionTitleProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  size?: "sm" | "md" | "lg";
  accent?: AccentKey | "muted" | "neutral";
  /** Right-aligned slot (actions, meta). */
  right?: React.ReactNode;
  as?: "h1" | "h2" | "h3";
}

const TITLE_SIZE = {
  sm: "text-title",
  md: "text-display-sm",
  lg: "text-display-sm md:text-display-md",
} as const;

/** Eyebrow + big italic condensed title, with an optional right-side slot. */
export const SectionTitle = React.forwardRef<HTMLDivElement, SectionTitleProps>(
  (
    { eyebrow, title, size = "md", accent = "neutral", right, as: Tag = "h2", className, ...props },
    ref,
  ) => (
    <div ref={ref} className={cn("flex flex-wrap items-end justify-between gap-6", className)} {...props}>
      <div className="flex min-w-0 flex-col gap-3">
        {eyebrow ? <Eyebrow accent={accent}>{eyebrow}</Eyebrow> : null}
        <Tag className={cn("font-display-italic pr-[0.06em] text-text", TITLE_SIZE[size])}>{title}</Tag>
      </div>
      {right ? <div className="flex shrink-0 items-center gap-3">{right}</div> : null}
    </div>
  ),
);
SectionTitle.displayName = "SectionTitle";
