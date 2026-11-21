// Owner: A. Pose spike for ?dev=pose: webcam, Pose Landmarker, skeleton, FPS counter.
// Plain DOM, no React, so nothing re-renders per frame (AGENTS.md rule 6).
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { closeCamera, openCamera } from './camera';
import { createLandmarker } from './landmarker';
import { downloadRecording, toRecordedPose, type RecordedFrame } from './recording';
import { drawPose } from './skeleton';
import { FPS_WINDOW_MS, RECORD_COUNTDOWN_MS, RECORD_DURATION_MS } from './tuning';

/** Clips to record for the detector's test fixtures. */
const CLIP_LABELS = [
  'standing',
  'sidestep',
  'jump',
  'squat',
  'armsUp',
  'reach',
  'leaveFrame',
  'mixed',
];

/** Mounts the debug view into `container`. Returns a cleanup that releases everything. */
export function mountPoseDebug(container: HTMLElement): () => void {
  const root = document.createElement('div');
  root.style.cssText =
    'position:relative;display:inline-block;max-width:100%;background:#000;font:14px/1.4 monospace;color:#fff';

  const video = document.createElement('video');
  video.style.cssText = 'display:block;max-width:100%;transform:scaleX(-1)';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  const ctx = canvas.getContext('2d');

  const hud = document.createElement('div');
  hud.style.cssText =
    'position:absolute;top:8px;left:8px;padding:4px 8px;background:rgba(0,0,0,0.6);border-radius:4px;white-space:pre';
  hud.textContent = 'Starting camera…';

  // Recorder: pick a clip, get a countdown, then the landmarks download as JSON.
  let rec: { label: string; startAt: number; frames: RecordedFrame[] } | null = null;
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:absolute;left:8px;right:8px;bottom:8px;display:flex;flex-wrap:wrap;gap:6px';
  const buttons = CLIP_LABELS.map((label) => {
    const b = document.createElement('button');
    b.textContent = `● ${label}`;
    b.style.cssText =
      'padding:4px 10px;border:0;border-radius:4px;background:rgba(0,0,0,0.7);color:#fff;font:inherit;cursor:pointer';
    b.onclick = () => {
      if (rec) return;
      rec = { label, startAt: performance.now() + RECORD_COUNTDOWN_MS, frames: [] };
      buttons.forEach((x) => (x.disabled = true));
    };
    return b;
  });
  bar.append(...buttons);

  root.append(video, canvas, hud, bar);
  container.append(root);

  let disposed = false;
  let stream: MediaStream | null = null;
  let landmarker: PoseLandmarker | null = null;
  let frameHandle = 0;
  let lastTs = -1;
  let frames = 0;
  let windowStart = performance.now();
  let fps = 0;
  let delegate = '';

  const onFrame = () => {
    if (disposed || !landmarker || !ctx) return;
    // rVFC fires once per new video frame, so the model never runs twice on the same image.
    const ts = Math.max(performance.now(), lastTs + 1); // MediaPipe needs strictly increasing timestamps
    lastTs = ts;
    const result = landmarker.detectForVideo(video, ts);

    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pose = result.landmarks[0];
    if (pose) drawPose(ctx, pose);

    frames++;
    const now = performance.now();
    if (now - windowStart >= FPS_WINDOW_MS) {
      fps = (frames * 1000) / (now - windowStart);
      frames = 0;
      windowStart = now;
    }
    let recLine = '';
    if (rec) {
      const elapsed = now - rec.startAt;
      if (elapsed < 0) {
        recLine = `\nGet ready: ${rec.label} in ${Math.ceil(-elapsed / 1000)}…`;
      } else if (elapsed < RECORD_DURATION_MS) {
        rec.frames.push({ t: Math.round(elapsed), pose: toRecordedPose(pose) });
        recLine = `\n● REC ${rec.label} ${((RECORD_DURATION_MS - elapsed) / 1000).toFixed(1)} s`;
      } else {
        downloadRecording({
          label: rec.label,
          video: { width: video.videoWidth, height: video.videoHeight },
          frames: rec.frames,
        });
        recLine = `\nSaved ${rec.label} (${rec.frames.length} frames)`;
        rec = null;
        buttons.forEach((x) => (x.disabled = false));
      }
    }
    hud.textContent =
      `FPS ${fps.toFixed(1)}  ${delegate}\n` +
      `${video.videoWidth}×${video.videoHeight}  ${pose ? 'body found' : 'no body'}` +
      recLine;

    frameHandle = video.requestVideoFrameCallback(onFrame);
  };

  (async () => {
    try {
      stream = await openCamera(video);
      if (disposed) return closeCamera(video, stream);
      hud.textContent = 'Loading pose model…';
      const created = await createLandmarker();
      if (disposed) return created.landmarker.close();
      landmarker = created.landmarker;
      delegate = created.delegate;
      frameHandle = video.requestVideoFrameCallback(onFrame);
    } catch (err) {
      console.error('[pose] debug view failed to start', err);
      hud.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  })();

  return () => {
    disposed = true;
    video.cancelVideoFrameCallback(frameHandle);
    landmarker?.close();
    landmarker = null;
    closeCamera(video, stream);
    root.remove();
  };
}
