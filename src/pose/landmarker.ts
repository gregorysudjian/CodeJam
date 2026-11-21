// Owner: A. Creates the MediaPipe Pose Landmarker from files in public/.
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import {
  MIN_DETECTION_CONFIDENCE,
  MIN_PRESENCE_CONFIDENCE,
  MIN_TRACKING_CONFIDENCE,
  MODEL_PATH,
  WASM_PATH,
} from './tuning';

export type Delegate = 'GPU' | 'CPU';

/** Tries the GPU delegate first and falls back to CPU if it fails to start. */
export async function createLandmarker(): Promise<{
  landmarker: PoseLandmarker;
  delegate: Delegate;
}> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  const make = (delegate: Delegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: MIN_DETECTION_CONFIDENCE,
      minPosePresenceConfidence: MIN_PRESENCE_CONFIDENCE,
      minTrackingConfidence: MIN_TRACKING_CONFIDENCE,
    });
  try {
    return { landmarker: await make('GPU'), delegate: 'GPU' };
  } catch (err) {
    console.warn('[pose] GPU delegate failed, falling back to CPU', err);
    return { landmarker: await make('CPU'), delegate: 'CPU' };
  }
}
