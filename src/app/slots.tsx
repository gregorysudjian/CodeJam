// Small components that put module-owned DOM (the pose camera video, the skeleton) into the
// slots the screens expose. Screens never import modules; these bridge the two.
import { useEffect, useRef } from 'react';
import type { PoseInputSource } from '@/contracts';

/** Appends the pose module's <video> (already mirrored by A) into a div. */
export function VideoSlot({ pose, className }: { pose: PoseInputSource; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const video = pose.video;
    video.classList.add('h-full', 'w-full', 'object-cover');
    host.appendChild(video);
    return () => {
      if (video.parentElement === host) host.removeChild(video);
    };
  }, [pose]);
  return <div ref={ref} className={className ?? 'h-full w-full'} />;
}

/** A canvas redrawn with pose.drawSkeleton in its own rAF loop (not React state). */
export function SkeletonSlot({ pose }: { pose: PoseInputSource }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    const draw = () => {
      if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
      if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pose.drawSkeleton(ctx);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [pose]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
