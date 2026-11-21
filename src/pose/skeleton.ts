// Owner: A. Draws the pose on an unmirrored canvas that sits over the mirrored video.
import type { PlayMode } from '@/contracts';
import { type Point, type Readout, toPlayerX } from './detect';
import { DETECTION as K, DRAW_LINE_WIDTH, DRAW_MIN_VISIBILITY, DRAW_POINT_RADIUS } from './tuning';

/** MediaPipe's 33-landmark body connections (PoseLandmarker.POSE_CONNECTIONS). */
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
]; // prettier-ignore

/**
 * Maps a raw landmark (normalized, unmirrored) to canvas pixels when the video fills the canvas
 * box with `object-fit: cover` (the app's VideoSlot) and is mirrored. With a canvas the same
 * aspect as the video, this is a plain scale.
 */
export function coverMap(
  canvasW: number,
  canvasH: number,
  videoW: number,
  videoH: number,
): (p: Point) => [number, number] {
  const scale = videoW > 0 && videoH > 0 ? Math.max(canvasW / videoW, canvasH / videoH) : 1;
  const dx = (canvasW - videoW * scale) / 2;
  const dy = (canvasH - videoH * scale) / 2;
  return (p) => [dx + toPlayerX(p.x) * videoW * scale, dy + p.y * videoH * scale];
}

const visible = (p: Point) => (p.visibility ?? 1) >= DRAW_MIN_VISIBILITY;

/** Draws the skeleton onto the whole canvas, cropped like an object-cover video of that size. */
export function drawPose(
  ctx: CanvasRenderingContext2D,
  landmarks: Point[],
  videoW: number,
  videoH: number,
): void {
  const map = coverMap(ctx.canvas.width, ctx.canvas.height, videoW, videoH);
  ctx.save();
  ctx.lineWidth = DRAW_LINE_WIDTH;
  ctx.lineCap = 'round';
  for (const [s, e] of CONNECTIONS) {
    const a = landmarks[s];
    const b = landmarks[e];
    if (!a || !b) continue;
    ctx.strokeStyle =
      visible(a) && visible(b) ? 'rgba(0, 255, 170, 0.9)' : 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.moveTo(...map(a));
    ctx.lineTo(...map(b));
    ctx.stroke();
  }
  for (const p of landmarks) {
    ctx.fillStyle = visible(p) ? '#ff3b6b' : 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.arc(...map(p), DRAW_POINT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A guide line in player coordinates: vertical at x, or horizontal at y. */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
  color: string;
  dashed?: boolean;
  label: string;
}

/**
 * The detector's thresholds as lines on the video (debug overlay): lane on/off lines around the
 * calibrated centre, standing height with the squat and jump lines, and the arm-up line.
 */
export function guides(r: Readout, mode: PlayMode): Guide[] {
  const out: Guide[] = [];
  if (mode === 'floor') {
    for (const side of [-1, 1]) {
      out.push(
        { axis: 'x', at: r.centreX + side * K.LANE_ON_W * r.W, color: '#ffd400', label: 'lane' },
        {
          axis: 'x',
          at: r.centreX + side * K.LANE_OFF_W * r.W,
          color: '#ffd400',
          dashed: true,
          label: '',
        },
      );
    }
    out.push(
      { axis: 'y', at: r.standY, color: '#ffffff', dashed: true, label: 'stand' },
      { axis: 'y', at: r.standY + K.SQUAT_ON_T * r.T, color: '#ff8a00', label: 'squat' },
      { axis: 'y', at: r.standY - K.JUMP_ON_T * r.T, color: '#00d0ff', label: 'jump' },
    );
  }
  out.push({
    axis: 'y',
    at: r.noseY - K.ARM_UP_ABOVE_NOSE_T * r.T,
    color: '#c77dff',
    label: 'arm up',
  });
  return out;
}

/** Draws the guides over an object-cover, mirrored video (same mapping as the skeleton). */
export function drawGuides(
  ctx: CanvasRenderingContext2D,
  list: Guide[],
  videoW: number,
  videoH: number,
): void {
  const { width: w, height: h } = ctx.canvas;
  const map = coverMap(w, h, videoW, videoH);
  ctx.save();
  ctx.lineWidth = 2;
  ctx.font = '12px monospace';
  for (const g of list) {
    // Guides are in player coordinates; coverMap expects raw x, so convert back.
    const [x, y] = map({
      x: toPlayerX(g.axis === 'x' ? g.at : 0.5),
      y: g.axis === 'y' ? g.at : 0.5,
    });
    ctx.strokeStyle = g.color;
    ctx.fillStyle = g.color;
    ctx.setLineDash(g.dashed ? [6, 6] : []);
    ctx.beginPath();
    if (g.axis === 'x') {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    } else {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    if (g.label) ctx.fillText(g.label, g.axis === 'x' ? x + 3 : 4, g.axis === 'x' ? 14 : y - 3);
  }
  ctx.restore();
}
