import * as React from "react";
import { animate, useReducedMotion } from "motion/react";
import { formatNumber } from "@/ui/lib/format";
import { cn } from "@/ui/lib/utils";
import { EASE_ARENA } from "./tokens";

export interface AnimatedNumberProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  value: number;
  format?: (n: number) => string;
  /** Seconds. */
  duration?: number;
  /** Count up from 0 on first mount. */
  fromZero?: boolean;
}

/** A number that tweens to its new value; instant under reduced motion. */
export const AnimatedNumber = React.forwardRef<HTMLSpanElement, AnimatedNumberProps>(
  ({ value, format = formatNumber, duration = 1.1, fromZero = true, className, ...props }, ref) => {
    const reduce = useReducedMotion();
    const start = reduce || !fromZero ? value : 0;
    const [display, setDisplay] = React.useState(start);
    const prev = React.useRef(start);

    React.useEffect(() => {
      if (reduce) {
        prev.current = value;
        setDisplay(value);
        return;
      }
      const controls = animate(prev.current, value, {
        duration,
        ease: EASE_ARENA,
        onUpdate: (v) => {
          prev.current = v;
          setDisplay(v);
        },
      });
      return () => controls.stop();
    }, [value, duration, reduce]);

    return (
      <span ref={ref} className={cn("tabular-nums", className)} {...props}>
        {format(display)}
      </span>
    );
  },
);
AnimatedNumber.displayName = "AnimatedNumber";
