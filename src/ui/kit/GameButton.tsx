import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/ui/components/ui/button";
import { cn } from "@/ui/lib/utils";
import { KeyHint } from "./KeyHint";

export const gameButtonVariants = cva(
  "group relative isolate overflow-hidden rounded-2xl font-display-italic leading-none tracking-[0.02em] transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-arena active:scale-[0.97] focus-ring disabled:opacity-40 disabled:saturate-50 disabled:shadow-none [&_svg]:size-[1em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /* One accent means one primary action per screen. The secondary used
           to be cyan-bordered, which made it read as a second, competing
           accent; it is now neutral and gains the accent edge only on hover,
           so the eye still lands on the primary first. */
        primary: "bg-lime-fill text-bg shadow-glow-lime hover:brightness-[1.04]",
        secondary:
          "border border-line-strong bg-bg-raised text-text shadow-raise hover:border-lime/60 hover:bg-hover",
        ghost: "bg-transparent text-text-muted hover:bg-hover hover:text-text",
        danger:
          "border border-danger/50 bg-danger/12 text-danger hover:bg-danger hover:text-bg",
      },
      /* Sizes step up at `sm`. Fixed at the desktop size, the xl button was
         443px wide inside a 390px viewport and pushed the landing page into
         53px of horizontal scroll. Every size stays at or above a 44px tap
         target at phone width. */
      size: {
        md: "h-11 gap-2 px-4 text-[18px] sm:h-14 sm:gap-2.5 sm:px-6 sm:text-[22px]",
        lg: "h-14 gap-2.5 px-5 text-[22px] sm:h-[72px] sm:gap-3 sm:px-8 sm:text-[28px]",
        xl: "h-16 gap-3 px-6 text-[26px] sm:h-[88px] sm:gap-3.5 sm:px-10 sm:text-[36px]",
      },
      pulse: { true: "animate-cta-pulse", false: "" },
    },
    defaultVariants: { variant: "primary", size: "lg", pulse: false },
  },
);

export interface GameButtonProps
  extends
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
    VariantProps<typeof gameButtonVariants> {
  children: React.ReactNode;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
  /** Keyboard shortcut shown as a key cap, e.g. "ENTER". */
  keyHint?: string;
}

/** The hero call-to-action button: italic condensed type, glow, sheen sweep and press scale. */
export const GameButton = React.forwardRef<HTMLButtonElement, GameButtonProps>(
  (
    {
      variant,
      size,
      pulse,
      leadingIcon: Lead,
      trailingIcon: Trail,
      keyHint,
      className,
      children,
      ...props
    },
    ref,
  ) => (
    <Button
      ref={ref}
      variant="unstyled"
      size="unstyled"
      className={cn(gameButtonVariants({ variant, size, pulse }), className)}
      {...props}
    >
      {variant === "primary" || variant == null ? (
        <span
          aria-hidden="true"
          className="sheen -z-10 group-hover:translate-x-[120%] group-focus-visible:translate-x-[120%]"
        />
      ) : null}
      {Lead ? <Lead aria-hidden="true" strokeWidth={2.75} /> : null}
      <span className="pr-[0.08em]">{children}</span>
      {Trail ? <Trail aria-hidden="true" strokeWidth={2.75} /> : null}
      {keyHint && ["ENTER", "ESC", "K"].includes(keyHint.toUpperCase()) ? (
        <KeyHint
          keyLabel={keyHint}
          tone={variant === "primary" || variant == null ? "onLime" : "default"}
          /* Hidden on phones: there is no keyboard to press, and the cap was
             part of what pushed this button past the viewport edge. */
          className="ml-1 hidden sm:inline-flex"
        />
      ) : null}
    </Button>
  ),
);
GameButton.displayName = "GameButton";
