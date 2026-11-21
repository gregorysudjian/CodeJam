// ?dev=pose: hosts A's pose debug page (camera, skeleton overlay, calibrate buttons, move tally,
// clip recorder). The pose module loads only here, so the normal app never pays for it.
import { useEffect, useRef } from 'react';

export function DevPose() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void import('@/pose').then((m) => {
      if (!cancelled && ref.current) cleanup = m.mountPoseDebug(ref.current);
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);
  return <div ref={ref} className="min-h-screen bg-bg" />;
}
