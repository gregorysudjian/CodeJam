// Owner: A. The pose input (docs/CONTRACTS.md): webcam → MediaPipe → calibration → moves.
// Press D during play for the debug overlay. The ?dev=pose page is mountPoseDebug in ./debug.
import type { PoseInputSource } from '@/contracts';
import { createPoseEngine } from './engine';

export function createPoseInput(): PoseInputSource {
  return createPoseEngine().source;
}
