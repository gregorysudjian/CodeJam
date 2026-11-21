// Owner: A. Pure gesture detection: the pause X (forearms crossed in front of the chest, held).
// Runs after the move detector and only reads it, so move detection and its timing are unchanged.
// A fist is not visible to the pose model, so the X is the pause sign.
import type { InputState } from '@/contracts';
import { L_SHOULDER, L_WRIST, mid, type Point, R_SHOULDER, R_WRIST, toPlayerX } from './detect';
import {
  GESTURE_ABOVE_SHOULDER_T,
  GESTURE_BELOW_SHOULDER_T,
  GESTURE_CROSS_W,
  GESTURE_GRACE_MS,
  GESTURE_HOLD_MS,
  GESTURE_NEAR_CENTRE_W,
} from './tuning';

/** Same as the contract's `Gesture` (src/contracts, added by D). */
export type Gesture = 'pause';

export interface GestureDetector {
  /**
   * Feed one frame: the player's raw landmarks (or null), the move detector's state and its current
   * body size. Returns 'pause' on the frame a held X completes, else null.
   */
  update(
    pose: Point[] | null,
    t: number,
    state: InputState,
    size: { W: number; T: number },
  ): Gesture | null;
  /** How far the current hold is, 0 to 1 (debug overlay). */
  readonly progress: number;
}

/** True when the forearms make an X in front of the chest on this frame. */
export function isCrossed(pose: Point[], W: number, T: number): boolean {
  const lw = pose[L_WRIST];
  const rw = pose[R_WRIST];
  const ls = pose[L_SHOULDER];
  const rs = pose[R_SHOULDER];
  if (!lw || !rw || !ls || !rs) return false;
  // Player coordinates: normally the left wrist is left of the right one (smaller x). Crossed: the
  // left wrist is clearly to the right of the right wrist.
  const lx = toPlayerX(lw.x);
  const rx = toPlayerX(rw.x);
  if (lx - rx < GESTURE_CROSS_W * W) return false;
  const s = mid(ls, rs);
  const cx = toPlayerX(s.x);
  const atChest = (w: Point) =>
    w.y >= s.y - GESTURE_ABOVE_SHOULDER_T * T && w.y <= s.y + GESTURE_BELOW_SHOULDER_T * T;
  const nearCentre = (x: number) => Math.abs(x - cx) <= GESTURE_NEAR_CENTRE_W * W;
  return atChest(lw) && atChest(rw) && nearCentre(lx) && nearCentre(rx);
}

export function createGestureDetector(): GestureDetector {
  let since = -1; // the current X started here (-1: not crossed)
  let lastSeen = -Infinity; // last frame the X was seen
  let fired = false; // fired for this hold; re-arms once the arms are uncrossed
  let progress = 0;

  function update(
    pose: Point[] | null,
    t: number,
    state: InputState,
    size: { W: number; T: number },
  ): Gesture | null {
    // Never during a move: in the air, in a squat, or with an arm up.
    const busy = state.airborne || state.ducking || state.leftArmUp || state.rightArmUp;
    const crossed = !!pose && state.tracking && !busy && isCrossed(pose, size.W, size.T);
    if (crossed) {
      if (since < 0 || t - lastSeen > GESTURE_GRACE_MS) since = t;
      lastSeen = t;
    } else if (t - lastSeen > GESTURE_GRACE_MS) {
      since = -1;
      fired = false; // uncrossed: the next X can fire
    }
    progress = since >= 0 && !fired ? Math.min(1, (t - since) / GESTURE_HOLD_MS) : 0;
    if (since >= 0 && !fired && t - since >= GESTURE_HOLD_MS) {
      fired = true;
      return 'pause';
    }
    return null;
  }

  return {
    update,
    get progress() {
      return progress;
    },
  };
}
