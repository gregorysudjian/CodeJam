// Owner: A. The pose input (docs/CONTRACTS.md): webcam → MediaPipe → calibration → moves.
// Press D during play for the debug overlay.
import type { PoseInputSource } from '@/contracts';
import { createPoseEngine } from './engine';

export function createPoseInput(): PoseInputSource {
  return createPoseEngine().source;
}

/** The ?dev=pose page (debug overlay, calibrate buttons, move tally, clip recorder). Greg's request. */
export { mountPoseDebug } from './debug';
