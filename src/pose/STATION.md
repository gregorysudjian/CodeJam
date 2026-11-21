# Demo station (pose) — owner A

## Operator card (read this, 1 minute)

**Set up once:** Chrome, laptop plugged in, on a level table. Tape a floor mark **1.5 m** from the
screen. The camera must see the player from **head to knees** with a little room above the head.

**Light:** the player **faces the light** (a lamp or window behind the laptop). **Nothing bright
behind the player:** no window, no lamp, no screen. Plain background; spectators stand beside the
laptop, never behind the player.

**Calibration messages** (the player stands on the mark, arms down):

| Message says | Do this |
| --- | --- |
| "Stand about 1.5 m from the screen…" | Nobody seen yet: step onto the mark, face the camera, check the light |
| "Come closer…" | Step forward to the mark |
| "Step back a little…" | Step back; tilt the screen so the head has room and the knees show |
| "Stand tall… hold still…" | Stand still with arms down for ~1.5 s; the bar fills |
| "Calibrated. Get ready!" | Go |

**Keys:**

| Key | When |
| --- | --- |
| **R** (during a round) | Moves feel off, a lane changes by itself, or the player moved off the mark. Player stands on the mark, still, ~1.5 s |
| **Esc** or the **X** (forearms crossed at the chest, held 1 s) | Pause. X again resumes; END ROUND is in the pause menu |
| **K** | **Give up on the camera:** no camera error, calibration still stuck after ~30 s, or moves still wrong after one R. The game goes on with the arrow keys/space |
| **D** | Debug overlay (FPS, live values). Not for players |

**Game paused, "tracking lost":** the player stepped out of view or the light is too dark. Step back
onto the mark, face the camera.

**Tips for players:** step clearly to the side, jump for real, squat deep, reach **high** (hand well
above the head), and lower the arms to the chin between presses.

**Privacy line for judges:** pose tracking runs on the laptop. No video or landmarks are sent
anywhere; the model is served from the app itself, so it also works offline.

---

## Before the demo (A or Patrick, 5 minutes)

1. Open `/?dev=pose` (close it before playing the app: on Windows only one tab can hold the camera).
   Overlay top line: FPS ≥ 25 and `GPU`. Line 2 shows the camera's own fps: if both are low, add
   light; if the camera is ~30 but FPS is low, close tabs and plug in, or use `?gfx=low` in the app.
2. `⟳ calibrate floor` at the mark, then one of each move; the move tally should count each once.
3. Cross the forearms at the chest for 1 s: the tally's `pause X` goes up by 1.
4. A laptop tilted 6° or more can count a squat when someone walks off to the side: keep it level.
5. Very baggy or dark clothes can hide the hips; contrast with the background helps.
6. Treadmill mode: 1–1.5 m, head and shoulders in view. If the runner drifts on the belt, press R.

## Symptoms → tuning (A only, and never after Sunday 10 AM)

Try the operator fix first (R, light, distance). Sliders are in the D overlay; "Copy changed values"
copies them as JSON for `DETECTION_DEFAULTS` in `src/pose/tuning.ts`. Any change must keep
`variants.test.ts` › "when states turn on" green (Patrick's game timing).

| Symptom | Tuning (risk) |
| --- | --- |
| Stuck on "step back" at 1.5 m | `CALIBRATION_SQUAT_ROOM_T` / `CALIBRATION_JUMP_ROOM_T` lower (tracking may drop in deep squats or high jumps) |
| Stuck on "come closer" | `CALIBRATION_MIN_T_FRAME` lower (0.15 → 0.12) |
| Sidesteps missed | `LANE_ON_W` lower (0.55 → 0.45) |
| Lane changes by itself | `LANE_ON_W`, `LANE_OFF_W` higher |
| Jumps missed | `JUMP_ON_T` lower (0.15 → 0.1), `JUMP_MIN_UP_SPEED_T` lower |
| Jumps late after a crouch | `JUMP_AFTER_SQUAT_ON_T` lower (0.45 → 0.35, not below 0.3) |
| Squats missed | `SQUAT_ON_T` lower (0.3 → 0.25) |
| Squat counted when crouching to jump | `SQUAT_JUMP_GRACE_MS` higher (350 → 450) |
| Squats counted late in the tally | Normal (a quick squat counts once up); `SQUAT_HOLD_MS` lower (800 → 500) |
| Arms up missed | `ARM_UP_ABOVE_NOSE_T` lower (0.3 → 0.25) |
| Arms up when resting hands on head | `ARM_UP_ABOVE_NOSE_T` higher (0.35) **and** the game's arm lead +0.05 s (`VISUAL_LEAD_SEC.pose` in `src/game/tuning.ts`) |
| Presses counted only once | `ARM_DOWN_ABOVE_NOSE_T` higher (0.05 → 0.15) |
| X does not pause | Record `● pauseX` on `?dev=pose`; check `isCrossed` on it before touching `GESTURE_*` |
| Everything jittery | `SMOOTHING_ALPHA` lower (0.5 → 0.35; more lag) |
| "The camera needs https or localhost" | Use the Vercel https link or `localhost`, not a LAN IP |
