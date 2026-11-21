// Owner: A. The ?dev=pose page: the real pose input with its camera, skeleton, debug overlay
// (always shown), calibration buttons and the clip recorder for test fixtures.
// Plain DOM, no React, so nothing re-renders per frame (AGENTS.md rule 6).
import type { MoveType, PlayMode } from '@/contracts';
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
  'pauseX',
  // Near-misses that must NOT pause: arms folded low, hands touching in front, an X overhead.
  'xLow',
  'xTouch',
  'xOverhead',
  // How a first-time judge plays (DECISIONS 44): steps 30–50 cm forward and back mid-play,
  // fidgets while calibrating, rests hands on the head, reaches low, sidesteps while turning,
  // squats with the arms out in front.
  'drift',
  'fidget',
  'handsOnHead',
  'lowReach',
  'turnStep',
  'squatArmsOut',
  // Someone walks behind the player while they stand still (Codex finding, DECISIONS 47).
  'passerby',
  // One move at a steady rhythm, for the lag study.
  'lagSidestep',
  'lagJump',
  'lagSquat',
  'lagArmsUp',
  'lagReach',
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

  // Move tally for the Phase 1 check ("each move 10 out of 10"): do 10 of a move, read the count.
  const MOVES: MoveType[] = ['sidestep', 'jump', 'squat', 'armsUp', 'reachLeft', 'reachRight'];
  const counts = new Map<MoveType, number>(MOVES.map((m) => [m, 0]));
  let pauses = 0;
  const tally = document.createElement('div');
  tally.style.cssText =
    'padding:8px 10px;border-radius:6px;background:rgba(0,0,0,0.8);font:14px/1.6 monospace;white-space:pre';
  const tallyText = document.createElement('div');
  const showTally = () => {
    tallyText.textContent =
      'MOVE TALLY (do 10 of each, expect 10)\n' +
      MOVES.map((m) => `${m.padEnd(11)} ${String(counts.get(m)).padStart(3)}`).join('\n') +
      `\n${'pause X'.padEnd(11)} ${String(pauses).padStart(3)}`;
  };
  const reset = document.createElement('button');
  reset.textContent = 'Reset tally';
  reset.style.cssText = BUTTON_CSS + ';margin-top:6px;border:1px solid #888';
  reset.onclick = () => {
    MOVES.forEach((m) => counts.set(m, 0));
    pauses = 0;
    showTally();
  };
  tally.append(tallyText, reset);
  showTally();
  const offMove = source.onMove((e) => {
    counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    showTally();
  });
  const offGesture = source.onGesture(() => {
    pauses++;
    showTally();
  });

  const side = document.createElement('div');
  side.style.cssText = 'display:flex;flex-direction:column;gap:12px';
  stage.append(video, canvas, status, bar);
  page.append(stage, side);
  container.append(page);
  overlay.show(side);
  side.append(tally);

  // Buttons hand the keyboard back after a click, so Space or Enter does not click them again.
  page.addEventListener('click', (e) => {
    if (e.target instanceof HTMLButtonElement) e.target.blur();
  });

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
    .then(
      () =>
        (status.textContent =
          'Camera on. Stand about 1.5 m back (head and knees in view),\nthen press "calibrate floor" and hold still.'),
    )
    .catch((err: unknown) => {
      console.error('[pose] debug view failed to start', err);
      status.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    });

  return () => {
    offMove();
    offGesture();
    offFrame();
    source.stop();
    overlay.hide();
    page.remove();
  };
}
