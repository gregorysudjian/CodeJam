# src/pose — needs from other owners

Changes outside `src/pose/` that A cannot make. Each item is a copy-paste message for D (Greg).

## 1. ✅ Done (Greg, PR #28) — Wire `?dev=pose` to the debug view (src/app/DevPose.tsx)

> Hi Greg, the pose debug page is ready on `abdo-1` (calibrate buttons, live overlay with sliders,
> move tally, clip recorder). `mountPoseDebug` is now exported from `src/pose/index.ts`, as you
> asked in PROGRESS.md / AUDIT.md #7. Once `abdo-1` is merged, could you replace
> `src/app/DevPose.tsx` with this? It is plain DOM, owns its own camera, and cleans up fully on
> unmount (StrictMode-safe).
> (Checked against `main` PR #19 in a scratch copy: your `npm run check` passes and the page runs.)
>
> ```tsx
> // ?dev=pose: A's pose debug view (src/pose/debug.ts).
> import { useEffect, useRef } from 'react';
> import { mountPoseDebug } from '@/pose';
>
> export function DevPose() {
>   const ref = useRef<HTMLDivElement>(null);
>   useEffect(() => (ref.current ? mountPoseDebug(ref.current) : undefined), []);
>   return <div ref={ref} className="min-h-screen bg-neutral-950" />;
> }
> ```

## 2. ✅ Checked (Greg: no second mirror) — Who mirrors the video (contract comment vs app)

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

> Pose detection changed some CONTRACTS.md starting values after recording A's moves (types and
> interfaces unchanged; details and reasons in `src/pose/DECISIONS.md`):
> - lane line 0.55 W (was 0.8 W); arm up 0.3 T above the nose, arm "down" back near the nose (was
>   below the shoulder), so presses from shoulder height count;
> - `ducking` is instant, but the `squat` event (a rep) is decided later: at 0.8 s into a held
>   squat, or once the player is back up unless a jump follows (then it was a crouch); right after
>   a squat a jump must rise 0.45 T instead of being blocked; a reach needs the other arm down;
> - arms are ignored mid-jump; tracking is also lost when the hips leave the frame or the camera
>   stalls.

## 5. ✅ Done (Greg, #31: arms up on results plays again) — "raise both arms to start" (PLAN.md Phase 2, A's list, but it lives in the app)

> The pose input already emits an `armsUp` move event. For a hands-free start, the ready screen can
> subscribe with `pose.onMove((e) => { if (e.type === 'armsUp') startRound(); })` and unsubscribe
> on unmount. No pose change needed.

## 6. ✅ Done (Greg, #31) — skeleton on the play screen's camera preview

> The play screen's camera preview (`cameraSlot` in `PlayScreen.tsx`) shows only `<VideoSlot>`.
> Wrapping it with the skeleton, like the calibration screen does, shows players they are tracked:
> `<div className="relative h-full w-full"><VideoSlot pose={pose} /><SkeletonSlot pose={pose} /></div>`.
> `drawSkeleton` already handles the `object-cover` crop. Purely visual; skip if the HUD is busy.

## 7. ✅ Done (Greg, #31: K mid-round calibrates with messages) — switching to pose mid-round (K)

> A new pose input that was never calibrated calibrates itself once the player stands still for
> 1.5 s; until then `getState().tracking` is false, so the game stays paused with no message. If you
> want messages there, call `pose.calibrate(mode, onStatus)` after a mid-round K (like R does).

## 8. FYI for Patrick (B): pose state timing is unchanged

> Your `VISUAL_LEAD_SEC.pose` leads were measured on `abdo-1`'s detector. After tonight's changes,
> the moments `airborne`, `ducking`, `lane` and the arm states turn on in my clips are the same as
> when you measured (±1 frame), and a test in `src/pose/variants.test.ts` now pins them. One
> difference: the `squat` *event* (a rep) is now decided later, 0.8 s into a held squat or once the
> player is back up, so a crouch before a jump is not a squat; collisions use `ducking`, so
> judging is unaffected. And a jump out of a crouch
> deeper than the squat line now turns `airborne` on ~0.17 s later (it must rise 0.45 T, so standing
> up out of a squat is never a jump); normal jumps are unchanged. If your `?debug=timing` shows
> late hurdles for deep-crouch jumpers, I can lower `JUMP_AFTER_SQUAT_ON_T` (not below ~0.3 T).

## 9. Pause gesture (the X): ready to wire

> Hi Greg, `createPoseInput()` now returns the contract's `PoseInputSource` plus
> `onGesture(cb: (g: 'pause') => void): () => void` (type `PoseSource`, exported from `@/pose`),
> exactly the signature you are adding as optional to the contract. Forearms crossed in an X in
> front of the chest, held 1 s, fires `'pause'` once; the player must uncross before it fires
> again, so X pauses and the next X resumes. It never fires while airborne, in a squat or with an
> arm up, and it fired 0 times in 960 noisy replays of every clip (yours too). Once
> `onGesture?` is in `src/contracts`: `const off = pose.onGesture?.(() => togglePause())`, and
> unsubscribe on unmount. It also works on the paused game (the camera keeps tracking), and the D
> overlay shows `pause X  NN%` while a hold is building.

## 10. Calibration is head to knees now (about 1.5 m): two texts to update

> Floor calibration no longer needs the feet (`CALIBRATION_FEET_IN_VIEW = false`): players stand
> about 1.5 m back with head and knees in view, and the pose messages say so. It still checks
> there is room for a jump above the shoulders and a squat below the hips, so 1.2 m is the closest.
> Two texts outside `src/pose` still say the old distance:
> - `src/ui/screens/CalibrationScreen.tsx` line ~343: "About 2 m back. Whole body in view." →
>   "About 1.5 m back. Head and knees in view."
> - `docs/DEMO.md`: the tape mark "2.2 m away" (and "2.2 m plus 2 m clear" in the organiser
>   questions) → about 1.5 m.
