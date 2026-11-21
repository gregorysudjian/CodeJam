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

To add a clip: record it with a `● …` button on `?dev=pose`, rename it to `<name>.json` here, and
add an expectation in `../variants.test.ts` (`CLIPS` and the expected-moves table).
