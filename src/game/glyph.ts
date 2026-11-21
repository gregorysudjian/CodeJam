import type { ObstacleKind } from '@/contracts';

/**
 * The move icon above each object: a round neon badge, readable from 2 m. Shared by the 3D view
 * (drawn once per glyph and colour into a sprite texture) and the 2D fallback (drawn per frame),
 * so both show the same icons.
 */
export type Glyph = 'go' | 'up' | 'down' | 'arms';

/** Double chevron over the free lane = sidestep, arrows = jump / squat, arms up = crate. */
export const GLYPH: Record<ObstacleKind, Glyph | null> = {
  block: 'go',
  hurdle: 'up',
  beam: 'down',
  crate: 'arms',
  orb: null, // the floating orb itself shows where to reach
};

/** Paints the badge centred at (cx, cy) with radius r. `color` is a CSS colour. */
export function paintGlyph(
  g: CanvasRenderingContext2D,
  glyph: Glyph,
  color: string,
  cx: number,
  cy: number,
  r: number,
): void {
  g.save();
  // Drawn in a 128 × 128 box centred on (64, 64), scaled to the requested radius.
  g.translate(cx - r, cy - r);
  g.scale(r / 64, r / 64);
  g.fillStyle = 'rgba(7, 9, 13, 0.72)';
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.stroke();
  g.lineWidth = 11;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const path = (pts: [number, number][]): void => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.stroke();
  };
  if (glyph === 'go') {
    path([
      [40, 38],
      [64, 58],
      [88, 38],
    ]);
    path([
      [40, 66],
      [64, 86],
      [88, 66],
    ]);
  } else if (glyph === 'up') {
    path([
      [64, 96],
      [64, 34],
    ]);
    path([
      [40, 56],
      [64, 32],
      [88, 56],
    ]);
  } else if (glyph === 'down') {
    path([
      [64, 30],
      [64, 84],
    ]);
    path([
      [40, 62],
      [64, 86],
      [88, 62],
    ]);
    path([
      [38, 100],
      [90, 100],
    ]);
  } else {
    // a figure with both arms up
    g.fillStyle = color;
    g.beginPath();
    g.arc(64, 46, 9, 0, Math.PI * 2);
    g.fill();
    path([
      [64, 60],
      [64, 88],
    ]);
    path([
      [64, 88],
      [52, 106],
    ]);
    path([
      [64, 88],
      [76, 106],
    ]);
    path([
      [42, 26],
      [50, 62],
      [64, 64],
      [78, 62],
      [86, 26],
    ]);
  }
  g.restore();
}
