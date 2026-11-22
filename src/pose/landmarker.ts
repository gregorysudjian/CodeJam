// Owner: A. Creates the MediaPipe Pose Landmarker from files in public/.
// The MediaPipe JS (~150 kB) and the pose files load on the profile and select screens when a
// camera exists (download.ts), or when the pose input starts, so the first page load stays small.
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import {
  MAX_POSES,
  MIN_DETECTION_CONFIDENCE,
  MIN_PRESENCE_CONFIDENCE,
  MIN_TRACKING_CONFIDENCE,
  MODEL_PATH,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from './tuning';
import { loadPoseFiles } from './download';

export type Delegate = 'GPU' | 'CPU';

export interface Landmarker {
  delegate: Delegate;
  /** Runs the model on the current video frame. Returns one landmark list per body found. */
  detect(video: HTMLVideoElement): NormalizedLandmark[][];
}

/** Tries the GPU delegate first and falls back to CPU if it fails to start. */
async function create(): Promise<Landmarker> {
  const { PoseLandmarker } = await import('@mediapipe/tasks-vision');
  // Usually already downloaded on the profile or select screen (download.ts).
  const { fileset, model: modelBytes } = await loadPoseFiles();
  const gpuCanvas = document.createElement('canvas');
  const make = (delegate: Delegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      canvas: delegate === 'GPU' ? gpuCanvas : undefined,
      baseOptions: modelBytes
        ? { modelAssetBuffer: modelBytes, delegate }
        : { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO',
      numPoses: MAX_POSES,
      minPoseDetectionConfidence: MIN_DETECTION_CONFIDENCE,
      minPosePresenceConfidence: MIN_PRESENCE_CONFIDENCE,
      minTrackingConfidence: MIN_TRACKING_CONFIDENCE,
    });
  let model: Awaited<ReturnType<typeof PoseLandmarker.createFromOptions>>;
  let delegate: Delegate = 'GPU';
  try {
    model = await make('GPU');
  } catch (err) {
    console.warn('[pose] GPU delegate failed, falling back to CPU', err);
    delegate = 'CPU';
    model = await make('CPU');
  }
  let lost = false;
  if (delegate === 'GPU') {
    // A lost context can return empty detections forever. Leave the active round in its
    // tracking-lost state and give the next camera session a fresh model.
    gpuCanvas.addEventListener(
      'webglcontextlost',
      () => {
        lost = true;
        shared = null;
        try {
          model.close();
        } catch (err) {
          console.warn('[pose] Could not close the lost GPU context', err);
        }
      },
      { once: true },
    );
  }
  let lastTs = -1;
  const run = (image: HTMLVideoElement | HTMLCanvasElement) => {
    // VIDEO mode needs strictly increasing timestamps, even across pose inputs sharing the model.
    const ts = Math.max(performance.now(), lastTs + 1);
    lastTs = ts;
    return model.detectForVideo(image, ts).landmarks;
  };
  // Warm-up: the first call sets up the GPU programs (about 0.23 s measured on the demo Mac).
  // Pay it here, while the camera opens, not on the player's first frame. A blank frame has no
  // body in it, so it is the same as a frame where nobody stands in view.
  try {
    const blank = document.createElement('canvas');
    blank.width = VIDEO_WIDTH;
    blank.height = VIDEO_HEIGHT;
    blank.getContext('2d')?.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
    run(blank);
  } catch (err) {
    console.warn('[pose] Model warm-up failed; the first camera frame will be slower', err);
  }
  return {
    delegate,
    detect(video) {
      if (lost) return [];
      return run(video);
    },
  };
}

let shared: Promise<Landmarker> | null = null;

/**
 * One model for the whole page. The app creates a new pose input each time the player switches
 * input (and React StrictMode starts it twice), so loading once avoids repeated 1–2 s loads and
 * leaked GPU contexts. A failed load or lost GPU context is retried on the next call.
 */
export function getLandmarker(): Promise<Landmarker> {
  if (!shared) {
    shared = create().catch((err: unknown) => {
      shared = null;
      throw err;
    });
  }
  return shared;
}
