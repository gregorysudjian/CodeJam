import type { InputSource } from '../contracts';
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
    if (ctl.keyDown(e.code, e.repeat)) e.preventDefault(); // stop arrows and Space scrolling the page
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
