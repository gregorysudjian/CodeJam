# src/pose — needs from other owners

Changes outside `src/pose/` that A cannot make. Each item is a copy-paste message for D (Greg).

## 1. Wire `?dev=pose` to the debug view (src/app/DevPose.tsx)

> Hi Greg, the pose debug page is ready on `abdo-1` (calibrate buttons, live overlay with sliders,
> move tally, clip recorder). Once `abdo-1` is merged, could you replace `src/app/DevPose.tsx` with
> this? It is plain DOM, owns its own camera, and cleans up fully on unmount (StrictMode-safe). It
> imports `@/pose/debug`, the one extra export from `src/pose` that PLAN.md planned for this page.
> (Checked against `main` PR #19 in a scratch copy: your `npm run check` passes and the page runs.)
>
> ```tsx
> // ?dev=pose: A's pose debug view (src/pose/debug.ts).
> import { useEffect, useRef } from 'react';
> import { mountPoseDebug } from '@/pose/debug';
>
> export function DevPose() {
>   const ref = useRef<HTMLDivElement>(null);
>   useEffect(() => (ref.current ? mountPoseDebug(ref.current) : undefined), []);
>   return <div ref={ref} className="min-h-screen bg-neutral-950" />;
> }
> ```

## 2. Who mirrors the video (contract comment vs app)

> CONTRACTS.md says `video` is mirrored by the UI with CSS `scaleX(-1)`, but `src/app/slots.tsx`
> says "already mirrored by A" and no UI code mirrors it. The pose module now sets
> `transform: scaleX(-1)` on its own `<video>`. Please make sure no screen adds another mirror
> (that would un-mirror it), and update the comment in `src/contracts/index.ts` when convenient:
> `readonly video: HTMLVideoElement; // already mirrored by the pose module`.

## 3. Skeleton canvas must cover the same box as the video

> `drawSkeleton(ctx)` maps landmarks with the same `object-cover` crop that `VideoSlot` applies, using
> the canvas size. Please keep the `SkeletonSlot` canvas exactly over the video box (as it is now:
> both `absolute inset-0 h-full w-full` in the same parent).

## 4. FYI: thresholds tuned from recordings (no interface change)

> Pose detection changed some CONTRACTS.md starting values after recording A's moves: lane line
> 0.55 W (was 0.8 W), arm "down" near the nose (was below the shoulder), arms ignored mid-jump, and
> tracking lost when the hips leave the frame. Details in `src/pose/DECISIONS.md`. Types and
> interfaces are unchanged.

## 5. Optional: "raise both arms to start" (PLAN.md Phase 2, A's list, but it lives in the app)

> The pose input already emits an `armsUp` move event. For a hands-free start, the ready screen can
> subscribe with `pose.onMove((e) => { if (e.type === 'armsUp') startRound(); })` and unsubscribe
> on unmount. No pose change needed.

## 6. Optional: skeleton on the play screen's camera preview

> The play screen's camera preview (`cameraSlot` in `PlayScreen.tsx`) shows only `<VideoSlot>`.
> Wrapping it with the skeleton, like the calibration screen does, shows players they are tracked:
> `<div className="relative h-full w-full"><VideoSlot pose={pose} /><SkeletonSlot pose={pose} /></div>`.
> `drawSkeleton` already handles the `object-cover` crop. Purely visual; skip if the HUD is busy.
