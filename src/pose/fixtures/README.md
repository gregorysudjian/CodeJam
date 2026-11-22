# Recorded clips (A, Sat ~4 AM)

Raw MediaPipe landmarks only (no images), recorded on the `?dev=pose` page: 8 s each, ~27–29 FPS,
640×480, `[x, y, z, visibility]` per landmark, x unmirrored. Loaded by `../fixtures.ts`.

**Session 1** (A's hips at ~0.68 of the frame height; calibrate on `standing.json`):

| Clip | What happens | Quirks |
| --- | --- | --- |
| `standing` | Stands still | Walks to the laptop after ~5.5 s (tests stop at 5.5 s) |
| `sidestep` | Right, back across to left, back across to right | 5 lane changes; no pause at centre |
| `jump` | 4 jumps (one smaller, ~0.55 T) with a crouch before each | Walks to the laptop after ~7.2 s |
| `squat` | Starts already in a squat; 2 squats held ~1 s | Ankles at the bottom edge (y up to 1.01) |
| `leaveFrame` | Walks out to the right (~2.5 s), stays out, walks back | MediaPipe keeps the body until it is gone |

**Session 2** (a different spot, hips at ~0.55; calibrate on each clip's first 300 ms):

| Clip | What happens | Quirks |
| --- | --- | --- |
| `armsUp` | 3 overhead presses, lowering only to shoulder height | One arm leads by up to ~0.3 s |
| `reach` | Left up/down twice, then right up/down | The 2nd right rep runs past the end |
| `mixed` | Jump, squat, 2 presses, sidestep left, walks out left | Arms swing up during the jump |

**Greg** (second body, Sat ~1 PM, hips at ~0.64; calibrate on `greg/standing.json`): `greg/`
standing, sidestep (10 lane changes), jump (4), squat (2, the second ends near the clip end),
armsUp (a half press first, then 3 presses), reach (8 alternating, right first), leaveFrame, mixed
(crouch-jump, reaches, squat, sidesteps, walks out).

To add a clip: record it with a `● …` button on `?dev=pose`, rename it to `<name>.json` here, and
add an expectation in `../variants.test.ts` (`CLIPS` and the expected-moves table).

**Quick regression clips (e.g. a teammate's):** stand still for the first second, do N of one move,
and save the download as `extra/<move>-<N>[-name].json` (for example `extra/jump-4-patrick.json`; the
folder does not exist until the first such clip; moves:
sidestep, jump, squat, armsUp, reachLeft, reachRight). `variants.test.ts` then expects exactly N of
that move, with no code change. An 8 s clip fits about 4–5 reps.

**Closer play** (A's third session, Sat ~3:20 PM, ~1.4 m, head to knees, feet at the bottom edge;
calibrate on `near/standing.json`): `near/` has the same eight clips plus `pauseX.json`, a real
pause X held twice. Deep squats take the hips to the bottom edge. `near/reach` has two low reaches
(under the 0.3 T arm line) that rightly do not count.
