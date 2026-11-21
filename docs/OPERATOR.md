# Operator card (demo day)

You stand at the laptop, start rounds, and fix problems. You never speak. Chrome only.

## URLs

| Use | URL |
| --- | --- |
| **Demo** (Patrick's Mac, `npm run dev`) | `http://localhost:5173/?demo=1` |
| No wifi or backend down | `http://localhost:5173/?demo=1&store=local` |
| Leaderboard on a second screen | `http://localhost:5173/?kiosk=1` |
| Pose check before the demo | `http://localhost:5173/?dev=pose` |
| Public link (QR code, own laptops) | `https://codejam-jet.vercel.app` |

## Before the first round

1. Laptop plugged in, about 1 m high, level, facing a wall. Tape mark on the floor **about 1.5 m** from the laptop, 1.5 m clear around it. Light on the player, not behind them.
2. Open the demo URL. **Continue as** the Player (the account with real rounds). For a judge: **New guest** → **S** (skip profile).
3. On the select screen Full body · 45 s is preselected, and so is **CAMERA** when the laptop has one. If the switch shows KEYBOARD, click **CAMERA** (a click on the switch is remembered on this laptop). Then click **START** (after a mouse click, Enter re-presses that control).

## A round (about 50 s from START to results)

1. **Calibration:** the player stands on the mark, head to knees in view, still for 1.5 s. "Step back" or "Step closer" says which way.
2. A new player's **first** round shows "Try each move" (6 moves, about 15 s). **Esc** skips it; **Enter** starts the round.
3. 3 s fly-in and 3-2-1, then 45 s of play, then results.
4. **Results:** the player keeps arms down while the Presenter talks (both arms up replays after 1.5 s). **Enter** plays again.

## Keys and gesture

| Key | Where | Does |
| --- | --- | --- |
| **Esc** | play | Pause / resume. The pause screen's **END ROUND** leaves without saving |
| **X gesture** | play, camera | Player crosses forearms between chest and chin for 1 s: pause; again: resume |
| **R** | play, camera | Recalibrate: player stands on the mark and holds still |
| **K** | anywhere | Switch camera ↔ keyboard without restarting the round |
| **D** | anywhere | Debug overlay (with the camera: FPS and live pose values) |
| **Esc** | select, calibration, leaderboard | Back |
| **1–4**, **C** | select | Pick a workout / play the coach's pick |
| **L** | dashboard | Leaderboard |

Keyboard play: ← → lane, ↑ or Space jump, ↓ squat (hold), W both arms, Q / E one arm.

## When something goes wrong

| Symptom | Do this |
| --- | --- |
| Camera dialog ("Camera blocked", "No camera found", "Camera in use") | Blocked: click the camera icon in the address bar → Allow → **Try again**. In use: close Zoom/Teams/other tabs → **Try again**. Otherwise **Use keyboard** |
| Calibration never finishes | Player to the mark, knees in view, still. Then **K** to play with the keyboard |
| Moves missed or wrong | **R** (recalibrate). Still bad: **K**, you play the keys while the player keeps moving; say so if asked |
| "STEP BACK INTO THE FRAME" | Player steps back into view; the round resumes by itself. After 3 s a "Use the keyboard" button appears |
| Paused after switching to slides | Normal: switching tabs pauses the round. **Esc** resumes |
| Offline banner at the bottom | Rounds still save on the laptop. If sign-in or the leaderboard fails, reload the no-wifi URL |
| Choppy (under 20 FPS) | Plug in, close tabs, more light on the player; last resort **K** |
| App won't load | Backup video. Laptop dead: second laptop |

**Don't:** click "Play this next" with `?demo=1` to show the coach's pick (it plays the same demo level). Don't use a LAN IP: the camera needs `localhost` or https.
