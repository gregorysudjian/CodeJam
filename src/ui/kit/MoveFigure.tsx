import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { MoveType } from "@/contracts";
import { cn } from "@/ui/lib/utils";
import { FIGURE_POSES, STAND, type FigurePose, type Pt, type Skeleton } from "./figurePoses";
import { EASE_ARENA, MOVE_COLORS, MOVE_LABELS } from "./tokens";

export type { FigurePose } from "./figurePoses";

const figureLabel = (pose: FigurePose) =>
  pose === "stand"
    ? "Standing figure"
    : pose === "pause"
      ? "Figure crossing forearms in an X to pause"
      : `Figure doing ${MOVE_LABELS[pose].toLowerCase()}`;

const p = (pt: Pt) => `${pt[0]} ${pt[1]}`;
const bodyPath = (s: Skeleton) =>
  `M ${p(s.neck)} L ${p(s.hip)} M ${p(s.lHand)} L ${p(s.lElbow)} L ${p(s.neck)} L ${p(s.rElbow)} L ${p(s.rHand)} M ${p(s.lFoot)} L ${p(s.lKnee)} L ${p(s.hip)} L ${p(s.rKnee)} L ${p(s.rFoot)}`;

export interface MoveFigureProps extends Omit<React.SVGProps<SVGSVGElement>, "ref" | "color"> {
  pose: FigurePose;
  color?: string;
  /** Loop between 'stand' and the pose. */
  animate?: boolean;
  /** Height in px (width is 2/3 of it). */
  size?: number;
  /** Dashed guide outline instead of a solid stroke. */
  dashed?: boolean;
}

/** Neon stick-figure athlete showing a move, drawn as the player sees themselves (mirrored). */
export const MoveFigure = React.forwardRef<SVGSVGElement, MoveFigureProps>(
  ({ pose, color, animate = false, size = 240, dashed = false, className, style, ...props }, ref) => {
    const reduce = useReducedMotion();
    const c = color ?? (pose === "stand" || pose === "pause" ? "#F5F7FA" : MOVE_COLORS[pose]);
    const target = FIGURE_POSES[pose];
    const loop = animate && !reduce && pose !== "stand";
    const d = loop ? [bodyPath(STAND), bodyPath(target), bodyPath(target), bodyPath(STAND)] : bodyPath(target);
    const cx = loop ? [STAND.head[0], target.head[0], target.head[0], STAND.head[0]] : target.head[0];
    const cy = loop ? [STAND.head[1], target.head[1], target.head[1], STAND.head[1]] : target.head[1];
    const transition = loop
      ? { duration: 1.6, times: [0, 0.35, 0.65, 1], ease: EASE_ARENA, repeat: Infinity }
      : { duration: reduce ? 0 : 0.45, ease: EASE_ARENA };
    const airborne = pose === "jump";
    return (
      <svg
        ref={ref}
        viewBox="-10 -14 120 164"
        width={(size * 120) / 164}
        height={size}
        role="img"
        aria-label={figureLabel(pose)}
        className={cn("overflow-visible", className)}
        style={{ filter: `drop-shadow(0 0 6px ${c}aa) drop-shadow(0 0 18px ${c}55)`, ...style }}
        {...props}
      >
        <line x1={4} y1={144} x2={96} y2={144} stroke={c} strokeOpacity={0.35} strokeWidth={2} strokeLinecap="round" />
        {airborne ? (
          <ellipse cx={50} cy={144} rx={16} ry={3} fill={c} opacity={0.18} />
        ) : null}
        <motion.path
          initial={false}
          animate={{ d }}
          transition={transition}
          fill="none"
          stroke={c}
          strokeWidth={dashed ? 4 : 8}
          strokeDasharray={dashed ? "6 7" : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <motion.circle initial={false} animate={{ cx, cy }} transition={transition} r={10} fill="none" stroke={c} strokeWidth={dashed ? 4 : 7} strokeDasharray={dashed ? "5 5" : undefined} />
      </svg>
    );
  },
);
MoveFigure.displayName = "MoveFigure";

export interface MoveFigureCycleProps extends React.HTMLAttributes<HTMLDivElement> {
  moves: readonly MoveType[];
  size?: number;
  /** ms per move */
  interval?: number;
}

/** Cycles a MoveFigure through moves every 1.6 s with the coloured move label beneath. */
export const MoveFigureCycle = React.forwardRef<HTMLDivElement, MoveFigureCycleProps>(
  ({ moves, size = 320, interval = 1600, className, ...props }, ref) => {
    const reduce = useReducedMotion();
    const [i, setI] = React.useState(0);
    React.useEffect(() => {
      if (moves.length < 2) return;
      const id = window.setInterval(() => setI((n) => (n + 1) % moves.length), interval);
      return () => window.clearInterval(id);
    }, [moves.length, interval]);
    const move = moves[i % Math.max(1, moves.length)];
    if (!move) return null;
    return (
      <div ref={ref} className={cn("flex flex-col items-center gap-6", className)} {...props}>
        <MoveFigure pose={move} size={size} />
        <div className="relative h-14 w-full" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={move}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -14 }}
              transition={{ duration: reduce ? 0 : 0.32, ease: EASE_ARENA }}
              className="absolute inset-x-0 text-center font-display-italic pr-[0.06em] text-display-sm"
              style={{ color: MOVE_COLORS[move], textShadow: `0 0 24px ${MOVE_COLORS[move]}66` }}
            >
              {MOVE_LABELS[move]}
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="flex gap-2" aria-hidden="true">
          {moves.map((m, n) => (
            <span
              key={m}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{ width: n === i ? 28 : 8, background: n === i ? MOVE_COLORS[m] : "rgba(255,255,255,0.15)" }}
            />
          ))}
        </div>
      </div>
    );
  },
);
MoveFigureCycle.displayName = "MoveFigureCycle";
