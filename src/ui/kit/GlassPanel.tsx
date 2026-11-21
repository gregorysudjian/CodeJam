import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/ui/lib/utils";

export const glassPanelVariants = cva("glass relative rounded-[24px] text-text", {
  variants: {
    glow: {
      none: "",
      lime: "glow-edge-lime",
      cyan: "glow-edge-cyan",
      magenta: "glow-edge-magenta",
    },
    padding: {
      none: "p-0",
      sm: "p-4",
      md: "p-6",
      lg: "p-8 md:p-10",
    },
  },
  defaultVariants: { glow: "none", padding: "md" },
});

export interface GlassPanelProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof glassPanelVariants> {
  as?: "div" | "section" | "article" | "aside";
}

/** The default floating glass surface, with an optional coloured glow edge. */
export const GlassPanel = React.forwardRef<HTMLElement, GlassPanelProps>(
  ({ as = "div", glow, padding, className, ...props }, ref) =>
    React.createElement(as, {
      ref,
      className: cn(glassPanelVariants({ glow, padding }), className),
      ...props,
    }),
);
GlassPanel.displayName = "GlassPanel";
