# src/input — keyboard input (owner B)

`createKeyboardInput(): InputSource` is the stand-in for the camera, the same interface as `createPoseInput()`.

| Key | State | Move event |
| --- | --- | --- |
| Left / Right arrow | `lane` −1 / +1 (clamped) | `sidestep` (only when the lane actually changes) |
| Up arrow or Space | `airborne` for 450 ms | `jump` (not again until it lands) |
| Down arrow, held | `ducking` | `squat` on press |
| W, held | both arms up | `armsUp` on press |
| Q / E, held | left / right arm up | `reachLeft` / `reachRight` on press |

- Uses `KeyboardEvent.code`, so it is the physical key whatever the layout.
- Ignores auto-repeat, keys with Ctrl/Cmd/Alt, and typing in inputs. K, R, D and Esc are left to the app.
- Calls `preventDefault` on its own keys so arrows and Space do not scroll the page.
- Releases every held key when the window loses focus or the tab is hidden.
- `tracking` is always `true`.
- `start()` adds the listeners and `stop()` removes them and resets the state. The app calls these, not the game.

The logic is the pure `createKeyboardController(now)` in `keyboard.ts`, tested in `keyboard.test.ts`. Numbers live in `tuning.ts`.

## Status
- Works and is unit-tested (7 tests).
- Not tested yet: in the real app against D's screens (scaffold not merged when written).
