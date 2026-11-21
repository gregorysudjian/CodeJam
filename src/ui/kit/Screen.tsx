import * as React from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { cn } from "@/ui/lib/utils";
import { Backdrop, type BackdropVariant } from "./Backdrop";
import { DURATION, EASE_ARENA, STAGGER } from "./tokens";

export interface ScreenProps extends React.HTMLAttributes<HTMLDivElement> {
  backdrop?: BackdropVariant;
  /** Sticky bottom bar rendered outside the staggered column (stays pinned while scrolling). */
  footer?: React.ReactNode;
  /**
   * Centre the column in the viewport instead of letting it hang from the top.
   *
   * `main` had no height, so a short screen sat in the top third and left the
   * rest of the page empty — which is how the backdrop ended up carrying the
   * composition on the single-focus screens. Use this for screens with one
   * idea on them (a tutorial step, an empty state); leave it off for screens
   * that scroll.
   */
  center?: boolean;
}

/** Layout wrapper for every non-game screen: backdrop + centred 1440px column with staggered child entrance. */
export const Screen = React.forwardRef<HTMLDivElement, ScreenProps>(
  ({ backdrop = "arena", footer, center = false, className, children, ...props }, ref) => {
    const reduce = useReducedMotion();
    const footerRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
      const bar = footerRef.current;
      const shell = bar?.parentElement;
      if (!bar || !shell) return;
      const measure = () => shell.style.setProperty("--screen-footer-height", `${bar.offsetHeight}px`);
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(bar);
      return () => observer.disconnect();
    }, [footer]);
    const container: Variants = {
      hidden: {},
      show: { transition: { staggerChildren: reduce ? 0 : STAGGER } },
    };
    const item: Variants = {
      hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 16 },
      show: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : DURATION.slow, ease: EASE_ARENA } },
    };
    return (
      <div ref={ref} className={cn("screen-shell relative isolate min-h-screen text-text", footer && "has-footer", className)} {...props}>
        <Backdrop variant={backdrop} />
        <motion.main
          variants={container}
          initial="hidden"
          animate="show"
          className={cn(
            "mx-auto flex w-full max-w-[1440px] flex-col gap-12 px-6 py-8 md:px-12 md:py-12",
            center && "min-h-[100dvh] justify-center",
          )}
        >
          {React.Children.map(children, (child) =>
            child == null || child === false ? null : <motion.div variants={item}>{child}</motion.div>,
          )}
        </motion.main>
        {footer ? (
          <motion.div
            ref={footerRef}
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : DURATION.slow, ease: EASE_ARENA, delay: reduce ? 0 : 0.3 }}
            className="screen-bottom-bar sticky bottom-0 z-30 w-full bg-bg backdrop-blur-xl"
          >
            <div className="screen-bottom-inner mx-auto w-full max-w-[1440px] px-6 md:px-12">{footer}</div>
          </motion.div>
        ) : null}
      </div>
    );
  },
);
Screen.displayName = "Screen";
