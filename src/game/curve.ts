// Montreal's streets do not run straight for two kilometres, so the route bends.
//
// The lanes themselves stay straight in play space. Nothing about movement,
// collision, timing or judging changes — a bend is drawn, not simulated. What
// moves is the world: the further ahead a thing is, the further sideways it is
// pushed, so the city appears to swing around the player and straighten out as
// they reach it. This is the same trick pseudo-3D racers have used since
// Out Run, and it is the only version of "the road turns" that is safe to add
// to a scoring game without touching the scoring.
//
// Keeping the lanes straight is also the honest choice for this product: the
// player is standing in their living room sidestepping between three physical
// positions. Their body cannot bank through a corner, so the controls must not
// pretend otherwise.

import * as T from './tuning';

/**
 * Signed curvature of the route at a given distance, in roughly -1..1.
 * Negative bends left, positive bends right, zero runs straight.
 *
 * Built from two out-of-phase sines so the pattern is smooth, never repeats on
 * a short cycle, and always returns to straight between bends. Deterministic:
 * the same run bends the same way every time.
 */
export function curvatureAt(distance: number): number {
  const a = Math.sin(distance / T.CURVE_PERIOD_A);
  const b = Math.sin(distance / T.CURVE_PERIOD_B + 1.7);
  // Multiplying rather than adding gives long straights between bends, which
  // is what a city grid actually feels like — you run several blocks, then turn.
  return a * b;
}

/**
 * How far sideways to push something that sits `ahead` units in front of the
 * player, given the curvature there.
 *
 * Quadratic in distance, like a real road's offset from its tangent: the near
 * ground barely moves, the far skyline swings a long way. A linear falloff
 * reads as the world sliding; quadratic reads as a bend.
 */
export function lateralOffset(ahead: number, curvature: number): number {
  if (ahead <= 0) return 0;
  return curvature * ahead * ahead * T.CURVE_STRENGTH;
}

/**
 * Camera yaw, in radians, for the bend the player is currently entering.
 *
 * Small on purpose. The lanes are straight, so yawing far would slide them off
 * centre and break the link between a sidestep and where the avatar appears.
 */
export function cameraYaw(distance: number): number {
  return curvatureAt(distance + T.CURVE_LOOKAHEAD) * T.CURVE_YAW_MAX;
}
