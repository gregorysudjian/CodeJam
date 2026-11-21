import {
  END_BANNER_H,
  END_BANNER_Y,
  MILESTONE_H,
  OVERLAY_GAP,
  OVERLAY_MARGIN,
  RACE_H,
} from './look';

/**
 * Screen-space labels: the app's HUD (GameHud) is laid out in CSS pixels at fixed offsets
 * (its move cue sits 124 px from the top at every size), so labels that must stay clear of it
 * are placed in pixels too, not in the 3D world. A label is a sprite parented to the camera at
 * `depth` in front of it; this turns a pixel box into that sprite's position and size.
 * Pure, so it is unit-tested (overlay.test.ts), including that no label overlaps GameHud.
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

/** Canvas height over width of a label (1024 x 192, 512 x 96): its width is h / LABEL_ASPECT. */
export const LABEL_ASPECT = 3 / 16;

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

/**
 * The milestone and FINAL STRETCH banner: bottom centre, under the combo counter (below the
 * runner nothing is still to come, and GameHud's move cue owns the top band).
 * `grow` (0 to 1) is its pop-in; it grows from 60 % of its height.
 */
export function milestoneBox(viewW: number, viewH: number, grow = 1, out?: PixelBox): PixelBox {
  const h = labelHeight(viewH, MILESTONE_H.share, MILESTONE_H.min, MILESTONE_H.max);
  const b = out ?? { cx: 0, cy: 0, h: 0 };
  b.cx = viewW / 2;
  b.cy = viewH - OVERLAY_MARGIN - h / 2;
  b.h = h * (0.6 + 0.4 * grow);
  return b;
}

/**
 * The end banner (GHOST BEATEN, ...): big, in the middle, under GameHud's plates. `grow` (0 to
 * 1) is its pop-in from nothing. Never wider than the screen minus the margins.
 */
export function endBannerBox(viewW: number, viewH: number, grow = 1, out?: PixelBox): PixelBox {
  const h = Math.min(
    labelHeight(viewH, END_BANNER_H.share, END_BANNER_H.min, END_BANNER_H.max),
    Math.max(0, viewW - 2 * OVERLAY_MARGIN) * LABEL_ASPECT, // never negative: a 1 px canvas
  );
  const b = out ?? { cx: 0, cy: 0, h: 0 };
  b.cx = viewW / 2;
  b.cy = viewH * END_BANNER_Y;
  b.h = h * grow;
  return b;
}

/**
 * The live race chip ("+2 VS GHOST"): bottom right, anchored at its bottom-right corner so a
 * pop (`pop` > 1 when the lead changes) grows it into the screen. On a narrow screen it shrinks
 * rather than reach the banner's full width.
 */
export function raceBox(viewW: number, viewH: number, pop = 1, out?: PixelBox): PixelBox {
  const bannerH = labelHeight(viewH, MILESTONE_H.share, MILESTONE_H.min, MILESTONE_H.max);
  const room = viewW / 2 - bannerH / LABEL_ASPECT / 2 - OVERLAY_GAP - OVERLAY_MARGIN;
  const h = Math.min(
    labelHeight(viewH, RACE_H.share, RACE_H.min, RACE_H.max) * pop,
    Math.max(0, room) * LABEL_ASPECT,
  );
  const b = out ?? { cx: 0, cy: 0, h: 0 };
  b.cx = viewW - OVERLAY_MARGIN - h / LABEL_ASPECT / 2;
  b.cy = viewH - OVERLAY_MARGIN - h / 2;
  b.h = h;
  return b;
}
