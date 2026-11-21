// Owner: A. Landmark clips recorded on the debug page, used as test fixtures.
// Saved to the player's own disk through a download; never uploaded (AGENTS.md rule 5).
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { RECORD_DECIMALS } from './tuning';

/** One landmark as [x, y, z, visibility], raw (unmirrored) MediaPipe coordinates. */
export type RecordedPoint = [number, number, number, number];

export interface RecordedFrame {
  t: number; // ms since the clip started
  pose: RecordedPoint[] | null; // 33 points, or null when no body was found
}

export interface Recording {
  label: string;
  video: { width: number; height: number };
  frames: RecordedFrame[];
}

const round = (v: number) => Number(v.toFixed(RECORD_DECIMALS));

export function toRecordedPose(
  landmarks: NormalizedLandmark[] | undefined,
): RecordedPoint[] | null {
  if (!landmarks) return null;
  return landmarks.map((p) => [round(p.x), round(p.y), round(p.z), round(p.visibility ?? 0)]);
}

export function downloadRecording(rec: Recording): void {
  const blob = new Blob([JSON.stringify(rec)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pose-${rec.label}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
