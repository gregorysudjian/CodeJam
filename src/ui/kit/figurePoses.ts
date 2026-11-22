import type { MoveType } from "@/contracts";

/** A move, standing, or 'pause' (forearms crossed in an X in front of the chest). */
export type FigurePose = "stand" | "pause" | MoveType;

export type Pt = readonly [number, number];
export interface Skeleton {
  head: Pt;
  neck: Pt;
  hip: Pt;
  lElbow: Pt; lHand: Pt; rElbow: Pt; rHand: Pt;
  lKnee: Pt; lFoot: Pt; rKnee: Pt; rFoot: Pt;
}

// Coordinates in a 100×150 box, ground at y=140. "l"/"r" = screen left/right (mirror view).
export const STAND: Skeleton = {
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

// The camera view is a mirror, so the player's right hand is on the screen's RIGHT: reachRight
// raises the screen-right arm and reachLeft (its mirror) the screen-left one, like the arrows
// in tokens.ts (MOVE_ICONS) and the lanes (an orb in lane −1, screen left, wants reachLeft).
const REACH_RIGHT: Skeleton = {
  head: [55, 21], neck: [53, 35], hip: [48, 80],
  lElbow: [40, 57], lHand: [37, 79], rElbow: [69, 22], rHand: [86, 6],
  lKnee: [42, 110], lFoot: [38, 140], rKnee: [54, 110], rFoot: [58, 140],
};

export const FIGURE_POSES: Record<FigurePose, Skeleton> = {
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
  reachLeft: mirror(REACH_RIGHT),
  reachRight: REACH_RIGHT,
  // The move check's X step: elbows wide and low, forearms crossing in front of the chest. Longer
  // than life so the X reads from the floor mark.
  pause: {
    head: [50, 20], neck: [50, 34], hip: [50, 80],
    lElbow: [28, 64], lHand: [68, 36], rElbow: [72, 64], rHand: [32, 36],
    lKnee: [45, 110], lFoot: [43, 140], rKnee: [55, 110], rFoot: [57, 140],
  },
};
