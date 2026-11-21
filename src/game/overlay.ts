/**
 * Screen-space labels: the app's HUD (GameHud) is laid out in CSS pixels at fixed offsets
 * (its move cue sits 124 px from the top at every size), so labels that must stay clear of it
 * are placed in pixels too, not in the 3D world. A label is a sprite parented to the camera at
 * `depth` in front of it; this turns a pixel box into that sprite's position and size.
 * Pure, so it is unit-tested (overlay.test.ts).
 */
export interface PixelBox {
  cx: number; // centre, CSS pixels from the left
  cy: number; // centre, CSS pixels from the top
  h: number; // height, CSS pixels
}

export interface CameraSpot {
  x: number;
  y: number;
  z: number;
  height: number; // world units at that depth
}

export function toCameraSpace(
  box: PixelBox,
  viewW: number,
  viewH: number,
  fovDeg: number,
  depth: number,
  out: CameraSpot,
): CameraSpot {
  const perPx = (2 * depth * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(1, viewH);
  out.x = (box.cx - viewW / 2) * perPx;
  out.y = (viewH / 2 - box.cy) * perPx;
  out.z = -depth;
  out.height = box.h * perPx;
  return out;
}

/** Label height in pixels for a canvas this tall: a share of it, within [min, max]. */
export function labelHeight(viewH: number, share: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, viewH * share));
}
