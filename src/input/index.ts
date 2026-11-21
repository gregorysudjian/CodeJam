import type { InputSource } from '@/contracts';
import { createKeyboardController } from './keyboard';

/** Keyboard stand-in for the camera. Same interface as the pose input. */
export function createKeyboardInput(): InputSource {
  const ctl = createKeyboardController(() => performance.now());
  let listening = false;

  const isTyping = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    // The app keeps this input started on every screen. Only during a round (the game marks
    // <body data-game="running">) are the keys consumed, so Space jumps instead of pressing a
    // focused HUD button. Elsewhere the browser keeps its own behaviour: Space presses the
    // focused button, arrows scroll the dashboard (WCAG 2.1.1).
    if (ctl.keyDown(e.code, e.repeat) && isRoundRunning()) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent): void => ctl.keyUp(e.code);
  const onBlur = (): void => ctl.releaseAll();
  const onVisibility = (): void => {
    if (document.hidden) ctl.releaseAll();
  };

  return {
    kind: 'keyboard',
    start() {
      if (!listening) {
        listening = true;
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onVisibility);
      }
      return Promise.resolve();
    },
    stop() {
      if (!listening) return;
      listening = false;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      ctl.reset();
    },
    getState: () => ctl.getState(),
    onMove: (cb) => ctl.onMove(cb),
  };
}

/** Set by src/game while a round runs (not paused, not finished); see src/game/index.ts. */
function isRoundRunning(): boolean {
  return document.body?.dataset.game === 'running';
}
