// Owner: A. The pose input's browser side: camera, MediaPipe frame loop, D key and debug overlay,
// around the pure session (session.ts). createPoseInput() (index.ts) returns `engine.source`; the
// ?dev=pose page uses the rest. Video and landmarks never leave the device (AGENTS.md rule 5).
import type { CalibrationStatus, MoveEvent, PlayMode, PoseInputSource } from '@/contracts';
import { attachStream, cameraErrorMessage, getCameraStream, stopStream } from './camera';
import type { Calibration, Detector, Point } from './detect';
import { type Delegate, getLandmarker, type Landmarker } from './landmarker';
import { createOverlay, type Overlay } from './overlay';
import { createSession, NEUTRAL_STATE } from './session';
import { drawGuides, drawPose, guides } from './skeleton';
import { CAMERA_STALL_MS, FPS_WINDOW_MS, WATCHDOG_INTERVAL_MS, WATCHDOG_STALE_MS } from './tuning';

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
  let watchdog = 0;
  let lastProcessedAt = 0;
  let lastFrameId = -1;
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

  let errorLogged = false;
  /**
   * Identifies the current camera frame: the decoded-frame count, which stops when the camera
   * stalls (currentTime keeps running on a dead stream, verified in Chromium).
   */
  const frameId = () => video.getVideoPlaybackQuality?.().totalVideoFrames ?? video.currentTime;

  /** Runs the model on the current video frame, once per new frame. */
  const processFrame = () => {
    if (!running || !landmarker || video.readyState < 2) return;
    const id = frameId();
    if (id === lastFrameId) return;
    lastFrameId = id;
    const t = performance.now();
    lastProcessedAt = t;
    try {
      session.frame(landmarker.detect(video), t, aspect());
    } catch (err) {
      // e.g. a lost GPU context: keep the loop alive (tracking goes false) instead of freezing.
      if (!errorLogged) console.error('[pose] frame failed', err);
      errorLogged = true;
      session.frame([], t, aspect());
    }
    frames++;
    if (t - windowStart >= FPS_WINDOW_MS) {
      fps = (frames * 1000) / (t - windowStart);
      frames = 0;
      windowStart = t;
    }
    overlay.update();
    frameListeners.forEach((cb) => cb());
  };

  // requestVideoFrameCallback fires once per new camera frame. It stops while the video is not
  // on the page (the app moves it between screens), so a watchdog takes over then (below).
  const onVideoFrame = () => {
    if (!running) return;
    processFrame();
    frameHandle = video.requestVideoFrameCallback(onVideoFrame);
  };

  // Removing a <video> from the page pauses it, and it stays paused when put back: the input
  // would freeze mid-round. Keep it playing, and process frames on a timer while rVFC is quiet.
  const onPause = () => {
    if (running) video.play().catch(() => {});
  };
  const onWatchdog = () => {
    if (!running) return;
    if (video.paused) onPause();
    const now = performance.now();
    if (now - lastProcessedAt > WATCHDOG_STALE_MS) processFrame();
    // The camera stopped delivering frames (unplugged, taken by another app, laptop asleep): tell
    // the session nobody is visible, so tracking goes false and the game pauses instead of
    // holding the last pose forever.
    if (now - lastProcessedAt > CAMERA_STALL_MS) session.frame([], now, aspect());
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
      // Get the stream before touching the video: a start superseded by stop() (React StrictMode
      // runs start, stop, start) must never detach the newer stream or leave its camera on.
      let s: MediaStream;
      try {
        s = await getCameraStream();
      } catch (err) {
        if (my !== gen) return;
        throw new Error(cameraErrorMessage(err), { cause: err });
      }
      if (my !== gen) return stopStream(video, s);
      stream = s;
      try {
        await attachStream(video, s);
        const lm = await getLandmarker();
        if (my !== gen) return; // stop() already released the stream
        landmarker = lm;
      } catch (err) {
        if (my !== gen) return;
        stopStream(video, s);
        stream = null;
        throw err instanceof Error ? err : new Error('The pose model could not start.');
      }
      running = true;
      frames = 0;
      windowStart = performance.now();
      if (keys) window.addEventListener('keydown', onKey);
      video.addEventListener('pause', onPause);
      watchdog = window.setInterval(onWatchdog, WATCHDOG_INTERVAL_MS);
      lastProcessedAt = performance.now();
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
    window.clearInterval(watchdog);
    video.removeEventListener('pause', onPause);
    stopStream(video, stream);
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
    // A stopped camera means nobody is tracked, whatever the last frame said.
    getState: () => (running ? session.getState() : { ...NEUTRAL_STATE }),
    onMove: (cb) => session.onMove(cb),
    async calibrate(mode, onStatus) {
      const done = session.calibrate(mode, onStatus);
      if (!running) {
        onStatus({ step: 'noBody', progress: 0, message: 'Starting the camera…' });
        try {
          await start();
        } catch (err) {
          // No camera: drop the pending calibration quietly and report the camera error.
          done.catch(() => {});
          session.cancel('The camera could not start.');
          throw err;
        }
      }
      return done;
    },
    drawSkeleton(ctx) {
      const pose = session.player;
      if (pose) drawPose(ctx, pose, video.videoWidth, video.videoHeight);
      const d = session.detector;
      if (overlay.visible && d)
        drawGuides(ctx, guides(d.readout, d.mode), video.videoWidth, video.videoHeight);
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
