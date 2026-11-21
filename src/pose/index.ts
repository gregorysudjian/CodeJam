// Owner: A. The pose input (docs/CONTRACTS.md): webcam → MediaPipe → calibration → moves.
// Press D during play for the debug overlay. Crossing the forearms in an X, held 1 s, is 'pause'.
import { createPoseEngine, type PoseSource } from './engine';

/** The contract's PoseInputSource, with `onGesture` (the pause X: forearms crossed, held 1 s). */
export function createPoseInput(): PoseSource {
  return createPoseEngine().source;
}

/** The ?dev=pose page (debug overlay, calibrate buttons, move tally, clip recorder). Greg's request. */
export { mountPoseDebug } from './debug';

export type { Gesture } from '@/contracts';
export type { PoseSource } from './engine';
