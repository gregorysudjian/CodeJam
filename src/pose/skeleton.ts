// Owner: A. Draws the pose on a canvas that sits over the mirrored video.
import { PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { DRAW_LINE_WIDTH, DRAW_MIN_VISIBILITY, DRAW_POINT_RADIUS } from './tuning';

/**
 * The single place where MediaPipe's unmirrored x becomes the player's x
 * (docs/CONTRACTS.md, "Mirroring trap"). Everything in src/pose uses this.
 */
export function toPlayerX(x: number): number {
  return 1 - x;
}

const visible = (p: NormalizedLandmark) => (p.visibility ?? 1) >= DRAW_MIN_VISIBILITY;

/**
 * Draws onto an unmirrored canvas the same size as the displayed video. The video is
 * mirrored with CSS, so points are mirrored here to line up and text stays readable.
 */
export function drawPose(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[]): void {
  const { width: w, height: h } = ctx.canvas;
  const px = (p: NormalizedLandmark) => toPlayerX(p.x) * w;
  const py = (p: NormalizedLandmark) => p.y * h;

  ctx.lineWidth = DRAW_LINE_WIDTH;
  ctx.lineCap = 'round';
  for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b) continue;
    ctx.strokeStyle =
      visible(a) && visible(b) ? 'rgba(0, 255, 170, 0.9)' : 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.moveTo(px(a), py(a));
    ctx.lineTo(px(b), py(b));
    ctx.stroke();
  }
  for (const p of landmarks) {
    ctx.fillStyle = visible(p) ? '#ff3b6b' : 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.arc(px(p), py(p), DRAW_POINT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
}
