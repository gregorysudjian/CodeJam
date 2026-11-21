# Slides (three at most)

DEMO.md: title, one architecture picture, close. The app is the presentation, so each slide is up for seconds, not minutes. Dark background (#07090D), lime (#C4FC40) for the one word that matters, white text, font Barlow Condensed or Inter (the app's own).

## 1. Title (up while the Presenter does the hook, 0:00–0:35)

> **NEON ARENA**
>
> A workout you play with your whole body.
> Just your laptop's webcam.
>
> Abdo · Patrick · Greg — CodeJam 16

No other text. Switch to the app at 0:35 for the live round.

## 2. How it works (1:55–2:25)

Full-screen image: [architecture.svg](architecture.svg) (1600×900; drop it into Keynote, Google Slides or PowerPoint as an image). Slide title, if the template needs one: **How it works**.

What each arrow is, with the file that does it (for the Tech lead in Q&A):

| Arrow | Where in the code |
| --- | --- |
| Webcam → MediaPipe pose | `src/pose/camera.ts` (getUserMedia), `src/pose/landmarker.ts` (model and WASM from `public/`, no CDN) |
| MediaPipe → calibration + move detection | `src/pose/calibration.ts`, `src/pose/detect.ts` (every threshold a fraction of the player's own body) |
| → the game, drawn early by measured lag | `src/game/index.ts` polls `getState()` each frame; `VISUAL_LEAD_SEC` in `src/game/tuning.ts` (0.1 s jump, 0.25 s sidestep, 0.3 s squat and arms) |
| Game → Supabase: scores, reps | `src/data/supabase.ts` upserts `sessions`; row-level security in `supabase/migrations/0001_init.sql`; leaderboard view in `0003_leaderboard_duration.sql` |
| Browser → coach endpoint | `src/data/supabase.ts` calls `/api/coach` with the player's token |
| Endpoint → Supabase | `api/coach.ts` reads the history with that token (RLS applies; no service key) |
| Endpoint → Claude, dashed | `api/coach.ts`: only when `ANTHROPIC_API_KEY` is set; none is set for the demo |
| Rule-based coach in the browser | `src/data/coach.ts`; used whenever the endpoint gives no valid answer, which is today's demo |

What the box line says on purpose: **video never leaves the laptop**. Only numbers cross the dashed line (round scores and reps, plus the profile the player typed).

## 3. Close (2:25–2:40)

> **BEAT ____ TO TAKE THE CROWN**
>
> Scan, and play on your own laptop.
> Chrome and any webcam. The video never leaves it.
>
> [QR code] codejam-jet.vercel.app

- Fill the score in from the leaderboard right before the pitch.
- **The QR must point to `https://codejam-jet.vercel.app`.** Take it from the live site's kiosk (`https://codejam-jet.vercel.app/?kiosk=1`: its QR encodes the live URL), or any QR generator. **Don't screenshot the QR on the demo Mac**: there it encodes `http://localhost:5173`, which is a dead link on a phone (QA Q18).
