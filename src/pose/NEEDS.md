# src/pose — needs from other owners

Changes outside `src/pose/` that A cannot make. Each item is a copy-paste message for D (Greg).

## 1. Wire `?dev=pose` to the debug view (src/app/DevPose.tsx)

> Hi Greg, the pose debug page is ready on `abdo-1`. In `src/app/DevPose.tsx`, please render a
> full-screen `<div ref={ref} />` and call `useEffect(() => mountPoseDebug(ref.current!), []);` with
> `import { mountPoseDebug } from '@/pose/debug';`. It is plain DOM, owns its own camera, and cleans
> up on unmount. (Rule 3 says only `src/app` imports modules; this is the one extra export from
> `src/pose`, as PLAN.md planned.)

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
