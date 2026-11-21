// Owner: A. The ?dev=pose page: the real pose input with its camera, skeleton, debug overlay
// (always shown), calibration buttons and the clip recorder for test fixtures.
// Plain DOM, no React, so nothing re-renders per frame (AGENTS.md rule 6).
import type { PlayMode } from '@/contracts';
import { createPoseEngine } from './engine';
import { downloadRecording, type RecordedFrame, toRecordedPose } from './recording';
import { RECORD_COUNTDOWN_MS, RECORD_DURATION_MS } from './tuning';

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

const BUTTON_CSS =
  'padding:4px 10px;border:0;border-radius:4px;background:rgba(0,0,0,0.7);color:#fff;font:inherit;cursor:pointer';

/** Mounts the debug view into `container`. Returns a cleanup that releases everything. */
export function mountPoseDebug(container: HTMLElement): () => void {
  const engine = createPoseEngine({ keys: false });
  const { source, overlay } = engine;
  const video = source.video;

  const page = document.createElement('div');
  page.style.cssText =
    'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;padding:12px;font:14px/1.4 monospace;color:#fff';

  const stage = document.createElement('div');
  stage.style.cssText =
    'position:relative;display:inline-block;max-width:min(100%, 960px);background:#000';
  video.style.display = 'block';
  video.style.maxWidth = '100%';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  const ctx = canvas.getContext('2d');

  const status = document.createElement('div');
  status.style.cssText =
    'position:absolute;top:8px;left:8px;padding:4px 8px;background:rgba(0,0,0,0.6);border-radius:4px;white-space:pre';
  status.textContent = 'Starting camera…';

  const bar = document.createElement('div');
  bar.style.cssText =
    'position:absolute;left:8px;right:8px;bottom:8px;display:flex;flex-wrap:wrap;gap:6px';

  // Calibration buttons.
  const calibrate = (mode: PlayMode) => {
    source
      .calibrate(
        mode,
        (s) => (status.textContent = `${s.step} ${Math.round(s.progress * 100)}%\n${s.message}`),
      )
      .then(() => (status.textContent = `Calibrated (${mode}). Try the moves.`))
      .catch(
        (err: unknown) => (status.textContent = err instanceof Error ? err.message : String(err)),
      );
  };
  for (const mode of ['floor', 'treadmill'] as const) {
    const b = document.createElement('button');
    b.textContent = `⟳ calibrate ${mode}`;
    b.style.cssText = BUTTON_CSS + ';background:rgba(0,90,60,0.85)';
    b.onclick = () => calibrate(mode);
    bar.append(b);
  }

  // Recorder: pick a clip, get a countdown, then the raw landmarks download as JSON.
  let rec: { label: string; startAt: number; frames: RecordedFrame[] } | null = null;
  const recButtons = CLIP_LABELS.map((label) => {
    const b = document.createElement('button');
    b.textContent = `● ${label}`;
    b.style.cssText = BUTTON_CSS;
    b.onclick = () => {
      if (rec) return;
      rec = { label, startAt: performance.now() + RECORD_COUNTDOWN_MS, frames: [] };
      recButtons.forEach((x) => (x.disabled = true));
    };
    return b;
  });
  bar.append(...recButtons);

  stage.append(video, canvas, status, bar);
  page.append(stage);
  container.append(page);
  overlay.show(page);

  const offFrame = engine.onFrame(() => {
    if (ctx) {
      if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
      if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      source.drawSkeleton(ctx);
    }
    if (!rec) return;
    const elapsed = performance.now() - rec.startAt;
    if (elapsed < 0) {
      status.textContent = `Get ready: ${rec.label} in ${Math.ceil(-elapsed / 1000)}…`;
    } else if (elapsed < RECORD_DURATION_MS) {
      rec.frames.push({ t: Math.round(elapsed), pose: toRecordedPose(engine.latestPose()) });
      status.textContent = `● REC ${rec.label} ${((RECORD_DURATION_MS - elapsed) / 1000).toFixed(1)} s`;
    } else {
      downloadRecording({
        label: rec.label,
        video: { width: video.videoWidth, height: video.videoHeight },
        frames: rec.frames,
      });
      status.textContent = `Saved ${rec.label} (${rec.frames.length} frames)`;
      rec = null;
      recButtons.forEach((x) => (x.disabled = false));
    }
  });

  source
    .start()
    .then(() => (status.textContent = 'Camera on. Press "calibrate floor" and stand still.'))
    .catch((err: unknown) => {
      console.error('[pose] debug view failed to start', err);
      status.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    });

  return () => {
    offFrame();
    source.stop();
    overlay.hide();
    page.remove();
  };
}
