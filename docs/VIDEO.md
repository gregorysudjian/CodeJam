# Backup video kit

> **Written on Saturday for the earlier 45-second build.** The game is now one round of 6 levels x 30 s with 3 lives, sign-up on the landing page and one leaderboard per workout and mode. The current script is [DEMO.md](DEMO.md); where this page disagrees with it, DEMO.md is right.

Fallback ladder step 4 (DEMO.md): if the app won't run on stage, play the video and narrate. Record it **Sunday 8 AM on the demo Mac**. This page is written so one person can follow it alone.

## The 72-second video (one take, no editing)

**People:** Player (moves), Operator (at the laptop: clicks, then switches tabs), Voice (says the lines live; the Presenter), Camera person.

**Before you press record**
- Demo Mac set up as in OPERATOR.md: `http://localhost:5173/?demo=1`, Camera on the switch, the Player's account ("Continue as …"), tape mark at about 1.5 m.
- One camera round already played on this URL, so the ghost runner is there (DEMO.md "Ghost runner").
- A second tab open at `http://localhost:5173/?kiosk=1`. Reload it just before the take (it also refreshes every 15 s on its own).
- Laptop brightness at maximum, volume at about 70 %, notifications off.
- **Phone:** landscape, 1080p 30 fps, on a tripod or a steady hand, about 2.5–3 m back and to one side, so the Player's whole body and the laptop screen are both in frame. Lock exposure on the laptop screen (on iPhone: press and hold on the screen, "AE/AF Lock") so the screen isn't blown out.
- Do two takes; keep the better one.

| Time | Shot (camera) | On screen | Who does what | Voice (say it, ~150 words a minute) |
| --- | --- | --- | --- | --- |
| 0:00–0:06 | Wide: Player on the mark, laptop beside | Select screen, Full body · 45 S, CAMERA | Player waves once | "Home workouts are boring. So we made one you play, with just a laptop's webcam." |
| 0:06–0:11 | Same | Calibration, then "Go!" | Operator clicks START. Player stands still | "It measures your body in a second and a half." |
| 0:11–0:14 | Same | Fly-in, 3-2-1 | | (silence: let the countdown play) |
| 0:14–0:59 | Same; may push in slowly on the screen | The 45 s round | Player plays | Short calls as things arrive, after GO: 4 s "step aside", 6 s "grab the orb", 8 s "smash the crate", 11 s "jump", 13 s "squat and hold", 14 s "into the tunnel". About 25 s: "That silver runner is my best run, racing me." About 35 s: "Final stretch." Otherwise let the music play. |
| 0:59–1:05 | Push in on the screen | Results: score, reps, coach card | Player keeps arms **down** (both arms up starts a new round) | "Every rep counted, calories as an estimate, and a coach that picks your next session." |
| 1:05–1:12 | Screen only | Kiosk tab: "Beat … to take the crown", QR code | Operator switches to the kiosk tab | "Tracking runs in the browser; the video never leaves the laptop. Scan it and play." |

**Timing check:** START to results is 50 s (measured twice on `main`; calibration adds about 2 s with the camera), so 0:06 + 52 s ≈ 0:58. Total ≈ 72 s, inside 60–75 s. The spoken lines are 81 words in total, about 32 s at 150 words a minute; each line fits its slot (the longest, 15 words, takes 6 s).

**If something goes wrong in the take:** stop, Esc → END ROUND, start again. Don't edit around mistakes.

**After the take:** AirDrop the file to Greg. For Devpost, upload it to YouTube (unlisted is fine) and paste the link into the Devpost "Video demo" field.

## The 10-second Devpost clip

Cut it from the take above; no second recording.
- **Window:** from 3 s to 13.5 s after GO (GO is about 0:12 in the take, so about 0:15 to 0:26; find GO by the countdown). It shows the first five objects of the demo level: a sidestep around a block (4.0 s), an orb (6.2 s), a crate smash (8.4 s), a jump over a hurdle (10.6 s) and a held squat under a beam (12.7 s). Times from `generateLevel(DEMO_CONFIG)`; the level is pinned by `src/workout/demo.test.ts`.
- **On the Mac:** open the take in QuickTime Player → Edit → Trim (⌘T), drag the yellow handles to the window, Save. Export at 1080p.

## The keyboard fallback video (already recorded)

If the camera take fails, this one exists already: the demo level played perfectly by the keyboard autoplayer (`docs/qa/sweep/auto.js`), no person in it.
- **Where:** `C:\Users\gsutji\Videos\NeonArena\neon-arena-keyboard-fallback.webm` on the QA laptop (41 MB, not in git). Copy it to the demo Mac with a USB stick or Drive.
- **Format:** WebM (VP9), 1920×1080, 30 fps, 67 s. **Open it in Chrome** (drag the file into a tab); Safari on a recent macOS also plays WebM, QuickTime Player doesn't. It has an audio track; whether the game's sound is on it is not checked (the QA laptop has no audio).
- **What's in it:** select screen (0:00), START (0:02.5), fly-in and 3-2-1, the round racing a weaker ghost with PERFECT labels and the city, tunnel, bridge and finale (GO ≈ 0:06), results 4,750 with the RULES coach card (0:52), dashboard (0:59), leaderboard (1:03), end 1:07.
- **Narrate over it (Presenter):** 0:00 "This is a recording, played with the keyboard." 0:06 name the moves as above. 0:52 "Every rep counted, and a coach that picks your next session." 1:03 "One board per round length, so a judge's 45 seconds is never against a three-minute round."
- **How it was made:** headless Chrome on `npm run dev` (`main` 56fb514), `?demo=1&store=local`, tab capture with `getDisplayMedia` and `MediaRecorder`, no packages. A weaker round was played first, unrecorded, so a ghost exists.
