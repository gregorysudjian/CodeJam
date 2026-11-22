// Owner: A. The pose input's browser side: camera, MediaPipe frame loop, D key and debug overlay,
// around the pure session (session.ts). createPoseInput() (index.ts) returns `engine.source`; the
// ?dev=pose page uses the rest. Video and landmarks never leave the device (AGENTS.md rule 5).
import type { CalibrationStatus, Gesture, MoveEvent, PlayMode, PoseInputSource } from '@/contracts';
import { attachStream, cameraErrorMessage, getCameraStream, stopStream } from './camera';
import { downloadMessage, onPoseDownload } from './download';
import type { Calibration, Detector, Point } from './detect';
import { type Delegate, getLandmarker, type Landmarker } from './landmarker';
import { createOverlay, type Overlay } from './overlay';
import { createSession, NEUTRAL_STATE } from './session';
import { drawGuides, drawPose, guides } from './skeleton';
import {
  CAMERA_STALL_MS,
  DEFAULT_ASPECT,
  FPS_WINDOW_MS,
  WATCHDOG_INTERVAL_MS,
  WATCHDOG_STALE_MS,
} from './tuning';

/** The contract's PoseInputSource with its optional `onGesture` always present (the pause X). */
export type PoseSource = PoseInputSource & {
  onGesture(cb: (g: Gesture) => void): () => void;
};

/** Everything the debug overlay shows. */
export interface EngineSnapshot {
  fps: number;
  /** What the camera itself reports (frame rate, size); empty before it starts. */
  camera: string;
  delegate: Delegate | '';
  mode: PlayMode;
  calibration: Calibration | null;
  calibrating: CalibrationStatus | null;
  detector: Detector | null;
  bodies: number;
  events: MoveEvent[];
  /** How far a pause X hold is, 0 to 1. */
  gesture: number;
}

export interface PoseEngine {
  source: PoseSource;
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
  let interruptSetup: (() => void) | null = null;
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

  // Where the time goes, per FPS window (the camera session): shown after the camera line on the
  // D overlay and kept in window.__poseTiming. Measuring only: nothing here changes detection.
  const win = { modelMs: 0, modelMaxMs: 0, lagMs: 0, lagN: 0, presented: 0, skipped: 0, timer: 0 };
  let lastPresented = -1;
  let timing = '';
  let startedAt = 0; // start() called; 0 once the first pose frame has been logged

  const overlay = createOverlay(() => ({
    fps,
    camera: cameraInfo(),
    delegate: landmarker?.delegate ?? '',
    mode: session.mode,
    calibration: session.calibration,
    calibrating: session.calibrating,
    detector: session.detector,
    bodies: session.bodies,
    events: session.recent,
    gesture: session.gestureProgress,
  }));

  const cameraInfo = () => {
    const s = stream?.getVideoTracks()[0]?.getSettings();
    return s
      ? `camera ${Math.round(s.frameRate ?? 0)} fps ${s.width ?? '?'}×${s.height ?? '?'}${timing}` +
          (session.otherPerson ? '\nsomeone else in the play area: paused' : '')
      : '';
  };

  const aspect = () =>
    video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : DEFAULT_ASPECT;

  let errorLogged = false;
  /**
   * Identifies the current camera frame: the decoded-frame count, which stops when the camera
   * stalls (currentTime keeps running on a dead stream, verified in Chromium).
   */
  const frameId = () => video.getVideoPlaybackQuality?.().totalVideoFrames ?? video.currentTime;

  /** Closes an FPS window's timing: model ms, capture-to-state delay, frames the loop missed. */
  const closeTimingWindow = (t: number) => {
    const n = Math.max(frames, 1);
    const sec = (t - windowStart) / 1000;
    const report = {
      poseFps: +fps.toFixed(1),
      cameraFps: +(win.presented / sec).toFixed(1),
      modelMs: +(win.modelMs / n).toFixed(1),
      modelMaxMs: +win.modelMaxMs.toFixed(1),
      captureToStateMs: win.lagN ? Math.round(win.lagMs / win.lagN) : null,
      skippedFrames: win.skipped,
      timerFrames: win.timer,
      delegate: landmarker?.delegate ?? '',
    };
    (window as unknown as Record<string, unknown>).__poseTiming = report;
    timing =
      `\nframes ${report.cameraFps}/s · model ${report.modelMs} ms (max ${report.modelMaxMs})` +
      ` · capture→state ${report.captureToStateMs ?? '–'} ms · missed ${report.skippedFrames}` +
      ` · timer ${report.timerFrames}`;
    Object.assign(win, {
      modelMs: 0,
      modelMaxMs: 0,
      lagMs: 0,
      lagN: 0,
      presented: 0,
      skipped: 0,
      timer: 0,
    });
  };

  /** Runs the model on the current video frame, once per new frame. */
  const processFrame = (meta?: VideoFrameCallbackMetadata) => {
    if (!running || !landmarker || video.readyState < 2) return;
    const id = frameId();
    if (id === lastFrameId) return;
    lastFrameId = id;
    const t = performance.now();
    lastProcessedAt = t;
    if (meta) {
      // Frames presented since the last callback beyond this one: the loop was busy and missed them.
      if (lastPresented >= 0) {
        win.presented += meta.presentedFrames - lastPresented;
        win.skipped += Math.max(0, meta.presentedFrames - lastPresented - 1);
      }
      lastPresented = meta.presentedFrames;
    } else {
      win.timer++; // the watchdog ran this frame (rVFC was quiet)
      lastPresented = -1;
    }
    try {
      session.frame(landmarker.detect(video), t, aspect());
    } catch (err) {
      // e.g. a lost GPU context: keep the loop alive (tracking goes false) instead of freezing.
      if (!errorLogged) console.error('[pose] frame failed', err);
      errorLogged = true;
      session.frame([], t, aspect());
    }
    const done = performance.now();
    win.modelMs += done - t;
    win.modelMaxMs = Math.max(win.modelMaxMs, done - t);
    if (meta?.captureTime) {
      win.lagMs += done - meta.captureTime;
      win.lagN++;
    }
    if (startedAt) {
      console.info(
        `[pose] first pose frame ${Math.round(done - startedAt)} ms after start (model call ${Math.round(done - t)} ms, waited ${Math.round(t - startedAt)} ms for it)`,
      );
      startedAt = 0;
    }
    frames++;
    if (t - windowStart >= FPS_WINDOW_MS) {
      fps = (frames * 1000) / (t - windowStart);
      closeTimingWindow(t);
      frames = 0;
      windowStart = t;
    }
    overlay.update();
    frameListeners.forEach((cb) => cb());
  };

  // requestVideoFrameCallback fires once per new camera frame. It stops while the video is not
  // on the page (the app moves it between screens), so a watchdog takes over then (below).
  const onVideoFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
    if (!running) return;
    processFrame(meta);
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
    if (now - lastProcessedAt > CAMERA_STALL_MS) {
      session.frame([], now, aspect());
      fps = 0; // show the stall on the overlay instead of the last FPS
      overlay.update();
    }
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
      const t0 = performance.now();
      // Load the model while the camera opens (and while a permission prompt waits) instead of
      // after it: one page-wide model (landmarker.ts), so a superseded start wastes nothing.
      const model = getLandmarker();
      let modelMs = -1;
      model.then(
        () => (modelMs = performance.now() - t0),
        () => {}, // reported where it is awaited below
      );
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
      const track = s.getVideoTracks()[0];
      const stopped = new Error('The camera stopped during setup. Try again or use the keyboard.');
      let onEnded!: () => void;
      const ended = new Promise<never>((_, reject) => {
        onEnded = () => reject(stopped);
      });
      const checkTrack = () => {
        if (track?.readyState !== 'live') throw stopped;
      };
      try {
        checkTrack();
        interruptSetup = onEnded;
        track.addEventListener('ended', onEnded);
        const cameraMs = performance.now() - t0;
        await Promise.race([attachStream(video, s), ended]);
        if (my !== gen) return;
        checkTrack();
        const playingMs = performance.now() - t0;
        const lm = await Promise.race([model, ended]);
        if (my !== gen) return; // stop() already released the stream
        checkTrack();
        landmarker = lm;
        console.info(
          `[pose] start: camera open ${Math.round(cameraMs)} ms, playing ${Math.round(playingMs)} ms,` +
            ` model ready ${Math.round(modelMs)} ms (${lm.delegate}, loaded alongside the camera)`,
        );
        startedAt = t0;
      } catch (err) {
        if (my !== gen) return;
        stopStream(video, s);
        stream = null;
        throw err instanceof Error ? err : new Error('The pose model could not start.');
      } finally {
        track?.removeEventListener('ended', onEnded);
        if (interruptSetup === onEnded) interruptSetup = null;
      }
      running = true;
      frames = 0;
      lastPresented = -1;
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
    // track.stop() does not fire 'ended'. Wake a start waiting for playback or the shared model.
    interruptSetup?.();
    interruptSetup = null;
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

  const source: PoseSource = {
    kind: 'pose',
    video,
    start,
    stop,
    // A stopped camera means nobody is tracked, whatever the last frame said.
    getState: () => (running ? session.getState() : { ...NEUTRAL_STATE }),
    onMove: (cb) => session.onMove(cb),
    onGesture: (cb) => session.onGesture(cb),
    async calibrate(mode, onStatus) {
      const asked = performance.now();
      const done = session.calibrate(mode, onStatus);
      done.then(
        () => console.info(`[pose] calibration took ${Math.round(performance.now() - asked)} ms`),
        () => {}, // the caller gets the rejection
      );
      if (!running) {
        // A first visit downloads the pose files (download.ts): show how far along, not a minute
        // of "Starting the camera…". Messages change only when the whole-MB count does.
        let last = '';
        const stopProgress = onPoseDownload((p) => {
          const message = p.done || p.loaded === 0 ? 'Starting the camera…' : downloadMessage(p);
          if (running || message === last) return;
          last = message;
          onStatus({ step: 'noBody', progress: 0, message });
        });
        // Observe cancellation even while a permission prompt or model load is still pending.
        // Register the caller's startup error before cleanup rejects the calibration promise.
        const started = start();
        void started.then(stopProgress, stopProgress);
        const ready = Promise.all([started, done]);
        void started.catch(() => session.cancel('The camera could not start.'));
        await ready;
        return;
      }
      return done;
    },
    drawSkeleton(ctx) {
      if (!running) return; // no stale skeleton after the camera stops
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
