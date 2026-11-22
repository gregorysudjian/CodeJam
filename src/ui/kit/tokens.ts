import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Hand,
  type LucideIcon,
} from "lucide-react";
import type { MoveType, PlayMode, WorkoutId } from "@/contracts";

/** Accent colour keys used across the kit. */
export type AccentKey = "lime" | "cyan" | "magenta" | "amber" | "violet" | "danger";

/** Raw hex values for each accent (for SVG / canvas / charts), the Montreal palette on limestone
 *  (theme.css). The keys keep their old names: lime = maple red, cyan = metro blue,
 *  magenta = plum, amber = ochre, violet = Mont-Royal green. Over video or the 3D scene prefer
 *  `var(--na-<key>)`: inside .hud-root and .calibration-stage it resolves to the old bright palette. */
export const ACCENT_HEX: Record<AccentKey, string> = {
  lime: "#B3261E",
  cyan: "#1F5F8B",
  magenta: "#8A2E5C",
  amber: "#8A5600",
  violet: "#2D6A4F",
  danger: "#9B1C1C",
};

/** Text-colour class per accent. */
export const ACCENT_TEXT: Record<AccentKey, string> = {
  lime: "text-lime",
  cyan: "text-cyan",
  magenta: "text-magenta",
  amber: "text-amber",
  violet: "text-violet",
  danger: "text-danger",
};

export const MOVE_ORDER: readonly MoveType[] = [
  "sidestep",
  "jump",
  "squat",
  "armsUp",
  "reachLeft",
  "reachRight",
];

export const MOVE_LABELS: Record<MoveType, string> = {
  sidestep: "SIDESTEP",
  jump: "JUMP",
  squat: "SQUAT",
  armsUp: "ARMS UP",
  reachLeft: "REACH LEFT",
  reachRight: "REACH RIGHT",
};

export const MOVE_ACCENTS: Record<MoveType, AccentKey> = {
  sidestep: "cyan",
  jump: "lime",
  squat: "amber",
  armsUp: "magenta",
  reachLeft: "violet",
  reachRight: "violet",
};

export const MOVE_COLORS: Record<MoveType, string> = {
  sidestep: ACCENT_HEX.cyan,
  jump: ACCENT_HEX.lime,
  squat: ACCENT_HEX.amber,
  armsUp: ACCENT_HEX.magenta,
  reachLeft: ACCENT_HEX.violet,
  reachRight: ACCENT_HEX.violet,
};

export const MOVE_ICONS: Record<MoveType, LucideIcon> = {
  sidestep: ArrowLeftRight,
  jump: ArrowUp,
  squat: ArrowDown,
  armsUp: Hand,
  reachLeft: ArrowUpLeft,
  reachRight: ArrowUpRight,
};

export const WORKOUT_LABELS: Record<WorkoutId, string> = {
  legs: "LEGS",
  arms: "ARMS",
  shoulders: "SHOULDERS",
  fullBody: "FULL BODY",
};

export const WORKOUT_ACCENTS: Record<WorkoutId, AccentKey> = {
  legs: "lime",
  arms: "magenta",
  shoulders: "cyan",
  fullBody: "amber",
};

export const WORKOUT_COLORS: Record<WorkoutId, string> = {
  legs: ACCENT_HEX.lime,
  arms: ACCENT_HEX.magenta,
  shoulders: ACCENT_HEX.cyan,
  fullBody: ACCENT_HEX.amber,
};

export const MODE_LABELS: Record<PlayMode, string> = {
  floor: "FLOOR",
  treadmill: "TREADMILL",
};

/** Shared motion easing and timings. */
export const EASE_ARENA = [0.22, 1, 0.36, 1] as const;
export const DURATION = { fast: 0.2, base: 0.32, slow: 0.45 } as const;
export const STAGGER = 0.06;
