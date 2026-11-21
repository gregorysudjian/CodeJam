// Runs pose calibration and shows CalibrationScreen with live status, video and skeleton.
import { useEffect, useRef, useState } from 'react';
import type { CalibrationStatus, PlayMode, PoseInputSource } from '@/contracts';
import { CalibrationScreen } from '@/ui/screens/CalibrationScreen';
import { SkeletonSlot, VideoSlot } from './slots';

const START: CalibrationStatus = { step: 'noBody', progress: 0, message: 'Starting the camera…' };

export function CalibrateStep({
  pose,
  mode,
  onDone,
  onCancel,
  onUseKeyboard,
}: {
  pose: PoseInputSource;
  mode: PlayMode;
  onDone: () => void;
  onCancel: () => void;
  onUseKeyboard: () => void;
}) {
  const [status, setStatus] = useState<CalibrationStatus>(START);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    let cancelled = false;
    pose
      .calibrate(mode, (s) => {
        if (!cancelled) setStatus(s);
      })
      .then(() => {
        if (!cancelled) onDoneRef.current();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus({
          step: 'noBody',
          progress: 0,
          message:
            err instanceof Error ? err.message : 'Calibration failed. Press K to use the keyboard.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [pose, mode]);

  return (
    <CalibrationScreen
      status={status}
      mode={mode}
      videoSlot={<VideoSlot pose={pose} />}
      skeletonSlot={<SkeletonSlot pose={pose} />}
      onCancel={onCancel}
      onUseKeyboard={onUseKeyboard}
    />
  );
}
