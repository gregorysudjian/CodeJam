import * as React from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { cn } from "@/ui/lib/utils";
import { Backdrop, type BackdropVariant } from "./Backdrop";
import { DURATION, EASE_ARENA, STAGGER } from "./tokens";

export interface ScreenProps extends React.HTMLAttributes<HTMLDivElement> {
  backdrop?: BackdropVariant;
  /** Sticky bottom bar rendered outside the staggered column (stays pinned while scrolling). */
  footer?: React.ReactNode;
}

/** Layout wrapper for every non-game screen: backdrop + centred 1440px column with staggered child entrance. */
export const Screen = React.forwardRef<HTMLDivElement, ScreenProps>(
  ({ backdrop = "arena", footer, className, children, ...props }, ref) => {
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
      <div ref={ref} className={cn("screen-shell relative isolate flex min-h-screen flex-col overflow-clip text-text", footer && "has-footer", className)} {...props}>
        <Backdrop variant={backdrop} />
        {/* flex-1 keeps the footer on the bottom edge when the content is shorter than the screen;
            overflow-clip (not hidden: sticky still works) stops its slide-in from adding a scroll. */}
        <motion.main
          variants={container}
          initial="hidden"
          animate="show"
          className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-12 px-6 py-8 md:px-12 md:py-12"
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
