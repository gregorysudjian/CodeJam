// Owner: A. The pose input's browser side: camera, MediaPipe frame loop, D key and debug overlay,
// around the pure session (session.ts). createPoseInput() (index.ts) returns `engine.source`; the
// ?dev=pose page uses the rest. Video and landmarks never leave the device (AGENTS.md rule 5).
import type { CalibrationStatus, MoveEvent, PlayMode, PoseInputSource } from '@/contracts';
import { closeCamera, openCamera } from './camera';
import type { Calibration, Detector, Point } from './detect';
import { type Delegate, getLandmarker, type Landmarker } from './landmarker';
import { createOverlay, type Overlay } from './overlay';
import { createSession } from './session';
import { drawPose } from './skeleton';
import { FPS_WINDOW_MS } from './tuning';

/** Everything the debug overlay shows. */
export interface EngineSnapshot {
  fps: number;
  delegate: Delegate | '';
  mode: PlayMode;
  calibration: Calibration | null;
  calibrating: CalibrationStatus | null;
  detector: Detector | null;
  bodies: number;
  events: MoveEvent[];
}

export interface PoseEngine {
  source: PoseInputSource;
  /** The player's latest raw landmarks (unmirrored), or null. For the recorder. */
  latestPose(): Point[] | null;
  /** Called after each processed frame (debug page). Returns unsubscribe. */
  onFrame(cb: () => void): () => void;
  overlay: Overlay;
}

/** True for keys typed into a form field, which must not toggle anything. */
const typing = (e: KeyboardEvent) =>
  e.target instanceof HTMLInputElement ||
  e.target instanceof HTMLTextAreaElement ||
  e.target instanceof HTMLSelectElement;

export function createPoseEngine({ keys = true } = {}): PoseEngine {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  // The player sees a mirror (docs/CONTRACTS.md); the app expects it already mirrored (NEEDS.md 2).
  video.style.transform = 'scaleX(-1)';

  const session = createSession();
  let gen = 0; // bumps on every start/stop, so a stale async start gives up
  let starting: Promise<void> | null = null;
  let running = false;
  let stream: MediaStream | null = null;
  let landmarker: Landmarker | null = null;
  let frameHandle = 0;
  const frameListeners = new Set<() => void>();

  let fps = 0;
  let frames = 0;
  let windowStart = 0;

  const overlay = createOverlay(() => ({
    fps,
    delegate: landmarker?.delegate ?? '',
    mode: session.mode,
    calibration: session.calibration,
    calibrating: session.calibrating,
    detector: session.detector,
    bodies: session.bodies,
    events: session.recent,
  }));

  const aspect = () =>
    video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3;

  const onVideoFrame = () => {
    if (!running || !landmarker) return;
    const t = performance.now();
    session.frame(landmarker.detect(video), t);
    frames++;
    if (t - windowStart >= FPS_WINDOW_MS) {
      fps = (frames * 1000) / (t - windowStart);
      frames = 0;
      windowStart = t;
    }
    overlay.update();
    frameListeners.forEach((cb) => cb());
    // requestVideoFrameCallback fires once per new camera frame, never twice on the same image.
    frameHandle = video.requestVideoFrameCallback(onVideoFrame);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'KeyD' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
    overlay.toggle();
  };

  function start(): Promise<void> {
    if (running) return Promise.resolve();
    if (starting) return starting;
    const my = ++gen;
    const run = async () => {
      const s = await openCamera(video);
      if (my !== gen) return closeCamera(video, s);
      stream = s;
      const lm = await getLandmarker();
      if (my !== gen) return;
      landmarker = lm;
      running = true;
      frames = 0;
      windowStart = performance.now();
      if (keys) window.addEventListener('keydown', onKey);
      frameHandle = video.requestVideoFrameCallback(onVideoFrame);
    };
    const p: Promise<void> = run().finally(() => {
      if (starting === p) starting = null;
    });
    starting = p;
    return p;
  }

  function stop(): void {
    gen++;
    starting = null;
    if (running) video.cancelVideoFrameCallback(frameHandle);
    running = false;
    closeCamera(video, stream);
    stream = null;
    window.removeEventListener('keydown', onKey);
    if (keys) overlay.hide();
    session.cancel('The camera was stopped.');
  }

  const source: PoseInputSource = {
    kind: 'pose',
    video,
    start,
    stop,
    getState: () => session.getState(),
    onMove: (cb) => session.onMove(cb),
    async calibrate(mode, onStatus) {
      const done = session.calibrate(mode, onStatus, aspect());
      if (!running) {
        onStatus({ step: 'noBody', progress: 0, message: 'Starting the camera…' });
        await start(); // a camera error rejects here; the app falls back to the keyboard
      }
      return done;
    },
    drawSkeleton(ctx) {
      const pose = session.player;
      if (pose) drawPose(ctx, pose, video.videoWidth, video.videoHeight);
    },
  };

  return {
    source,
    latestPose: () => session.player,
    onFrame(cb) {
      frameListeners.add(cb);
      return () => {
        frameListeners.delete(cb);
      };
    },
    overlay,
  };
}
