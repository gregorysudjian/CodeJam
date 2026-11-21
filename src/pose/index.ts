// Owner: A. STUB — replace with MediaPipe pose tracking (docs/CONTRACTS.md, "Detection starting values").
// start() rejects so the app stays on keyboard input until the real tracker lands.
import type { PoseInputSource } from '@/contracts';

export function createPoseInput(): PoseInputSource {
  const video = document.createElement('video');
  return {
    kind: 'pose',
    video,
    async start() {
      throw new Error('Pose tracking is not implemented yet (src/pose stub).');
    },
    stop() {},
    getState: () => ({
      tracking: false,
      lane: 0,
      ducking: false,
      airborne: false,
      leftArmUp: false,
      rightArmUp: false,
    }),
    onMove: () => () => {},
    async calibrate(_mode, onStatus) {
      onStatus({ step: 'done', progress: 1, message: 'Calibration stub' });
    },
    drawSkeleton() {},
  };
}
