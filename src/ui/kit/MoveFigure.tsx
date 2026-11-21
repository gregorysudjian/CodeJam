import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { MoveType } from "@/contracts";
import { cn } from "@/ui/lib/utils";
import { EASE_ARENA, MOVE_COLORS, MOVE_LABELS } from "./tokens";

export type FigurePose = "stand" | MoveType;

type Pt = readonly [number, number];
interface Skeleton {
  head: Pt;
  neck: Pt;
  hip: Pt;
  lElbow: Pt; lHand: Pt; rElbow: Pt; rHand: Pt;
  lKnee: Pt; lFoot: Pt; rKnee: Pt; rFoot: Pt;
}

// Coordinates in a 100×150 box, ground at y=140. "l"/"r" = screen left/right (mirror view).
const STAND: Skeleton = {
  head: [50, 20], neck: [50, 34], hip: [50, 80],
  lElbow: [39, 56], lHand: [35, 78], rElbow: [61, 56], rHand: [65, 78],
  lKnee: [45, 110], lFoot: [43, 140], rKnee: [55, 110], rFoot: [57, 140],
};

const mirror = (s: Skeleton): Skeleton => {
  const m = (p: Pt): Pt => [100 - p[0], p[1]];
  return {
    head: m(s.head), neck: m(s.neck), hip: m(s.hip),
    lElbow: m(s.rElbow), lHand: m(s.rHand), rElbow: m(s.lElbow), rHand: m(s.lHand),
    lKnee: m(s.rKnee), lFoot: m(s.rFoot), rKnee: m(s.lKnee), rFoot: m(s.lFoot),
  };
};

// Player's left appears on the screen's right in the mirrored camera view.
const REACH_LEFT: Skeleton = {
  head: [55, 21], neck: [53, 35], hip: [48, 80],
  lElbow: [40, 57], lHand: [37, 79], rElbow: [69, 22], rHand: [86, 6],
  lKnee: [42, 110], lFoot: [38, 140], rKnee: [54, 110], rFoot: [58, 140],
};

const POSES: Record<FigurePose, Skeleton> = {
  stand: STAND,
  sidestep: {
    head: [60, 21], neck: [60, 35], hip: [60, 80],
    lElbow: [47, 54], lHand: [38, 70], rElbow: [73, 54], rHand: [82, 70],
    lKnee: [46, 110], lFoot: [33, 140], rKnee: [72, 110], rFoot: [84, 140],
  },
  jump: {
    head: [50, 6], neck: [50, 20], hip: [50, 64],
    lElbow: [35, 12], lHand: [26, -2], rElbow: [65, 12], rHand: [74, -2],
    lKnee: [38, 84], lFoot: [43, 108], rKnee: [62, 84], rFoot: [57, 108],
  },
  squat: {
    head: [50, 50], neck: [50, 64], hip: [50, 104],
    lElbow: [35, 76], lHand: [45, 72], rElbow: [65, 76], rHand: [55, 72],
    lKnee: [26, 108], lFoot: [32, 140], rKnee: [74, 108], rFoot: [68, 140],
  },
  armsUp: {
    head: [50, 22], neck: [50, 36], hip: [50, 80],
    lElbow: [44, 14], lHand: [41, -6], rElbow: [56, 14], rHand: [59, -6],
    lKnee: [45, 110], lFoot: [43, 140], rKnee: [55, 110], rFoot: [57, 140],
  },
  reachLeft: REACH_LEFT,
  reachRight: mirror(REACH_LEFT),
};

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
    const c = color ?? (pose === "stand" ? "#F5F7FA" : MOVE_COLORS[pose]);
    const target = POSES[pose];
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
        aria-label={pose === "stand" ? "Standing figure" : `Figure doing ${MOVE_LABELS[pose].toLowerCase()}`}
        className={cn("overflow-visible", className)}
        /* A single tight shadow to separate the figure from the floor. The
           previous 6px + 18px double halo made this diagram the brightest
           object on the landing page, above the primary button. */
        style={{ filter: `drop-shadow(0 2px 10px ${c}33)`, ...style }}
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
              style={{ color: MOVE_COLORS[move] }}
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
