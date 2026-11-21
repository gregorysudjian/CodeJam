# Demo station setup (pose) — owner A

For the demo laptop and anyone running the station. Chrome only.

## Before the demo (5 minutes)

1. **Laptop** on a level table (a tilted camera of 6° or more can count a squat when someone walks
   off to the side), screen tilted so the camera sees the floor in front of it. Plugged in (battery
   saver lowers FPS).
2. **Distance:** floor mode about **2–2.5 m** back, head and feet in view (tape a floor mark).
   Treadmill mode **1–1.5 m**, head and shoulders in view.
3. **Light:** light on the player's face and body, not behind them (no window behind the player).
   A dark room drops the webcam to ~15–25 FPS; a desk lamp pointed at the player helps most.
4. **Background:** plain, no people walking behind if possible. Keep spectators beside the camera,
   not behind the player.
5. **Clothes:** anything works; very baggy or dark clothes can hide the hips. Contrast with the
   background helps.
6. **Check:** open `/?dev=pose` (or press **D** in the app): FPS ≥ 25 and `GPU` on the overlay's top
   line. Calibrate, do one of each move, watch the move tally.

## During the demo: keys

| Key | What it does |
| --- | --- |
| **R** | Recalibrate (stand on the mark, hold still ~1.5 s). First fix for anything odd |
| **D** | Pose debug overlay: live values, thresholds, sliders, lines on the video |
| **K** | Switch to keyboard input (the fallback if the camera misbehaves) |
| **Esc** | Pause |

## Symptoms → fix

| Symptom | First try | Then (slider in the D overlay, or `tuning.ts`) |
| --- | --- | --- |
| Calibration stuck on "step back" (feet cut off) | Step back / tilt the screen | `CALIBRATION_FEET_IN_VIEW = false` (knees enough) |
| Calibration stuck on "come closer" | Step forward | `CALIBRATION_MIN_T_FRAME` lower (0.15 → 0.12) |
| Sidesteps not counted | Bigger step; press R | `LANE_ON_W` lower (0.55 → 0.45) |
| Lane changes by itself | Press R on the mark | `LANE_ON_W` higher, `LANE_OFF_W` higher |
| Jumps missed | Jump higher; press R | `JUMP_ON_T` lower (0.15 → 0.1), `JUMP_MIN_UP_SPEED_T` lower |
| Jumps late after a crouch | — | `JUMP_AFTER_SQUAT_ON_T` lower (0.45 → 0.35, not below 0.3) |
| Squats missed | Squat deeper | `SQUAT_ON_T` lower (0.3 → 0.25) |
| Squat counted when crouching to jump | — | `SQUAT_CONFIRM_MS` higher (250 → 350) |
| Arms up missed | Arms straight up | `ARM_UP_ABOVE_NOSE_T` lower (0.3 → 0.25) |
| Arms up when resting hands on head | Hands down between moves | `ARM_UP_ABOVE_NOSE_T` higher (0.35), **and** the game's arm lead +0.05 s (`VISUAL_LEAD_SEC.pose` in src/game) |
| Presses counted only once | Lower arms to the chin between reps | `ARM_DOWN_ABOVE_NOSE_T` higher (0.05 → 0.15) |
| Game pauses ("tracking lost") | Step back into view, face the camera | Light; hips visible |
| Treadmill: arm moves too easy / too hard after a while | Runner drifted on the belt: press R | — |
| Everything jittery | Light | `SMOOTHING_ALPHA` lower (0.5 → 0.35; more lag) |
| Low FPS (< 20) | Overlay line 2: camera fps low → add light; camera ~30 → close tabs, plug in | Keyboard (K) as fallback |
| "The camera needs https or localhost" | Use the Vercel https link or `localhost`, not a LAN IP | — |

"Copy changed values" in the overlay copies the slider changes as JSON; paste them into
`DETECTION_DEFAULTS` in `src/pose/tuning.ts` to keep them.

## Privacy line for judges

Pose tracking runs on the laptop. No video or landmarks are sent anywhere; the model and its
runtime are served from the app itself (`public/`), so it also works offline.
