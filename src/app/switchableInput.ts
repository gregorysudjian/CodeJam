// One stable InputSource for the game that forwards to whichever source is active (keyboard or
// pose). Switching with K swaps the source underneath, so the game keeps running instead of being
// recreated, which used to restart the round. The app still starts and stops the real sources.
import type { InputSource, MoveEvent } from '@/contracts';

export interface SwitchableInput extends InputSource {
  setSource(next: InputSource): void;
}

export function createSwitchableInput(initial: InputSource): SwitchableInput {
  let source = initial;
  const listeners = new Set<(e: MoveEvent) => void>();
  const forward = (e: MoveEvent) => listeners.forEach((cb) => cb(e));
  let unsubscribe = source.onMove(forward);

  return {
    get kind() {
      return source.kind;
    },
    // The app owns the real sources' lifecycle; the game never calls these.
    start: async () => {},
    stop: () => {},
    getState: () => source.getState(),
    onMove(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setSource(next) {
      if (next === source) return;
      unsubscribe();
      source = next;
      unsubscribe = source.onMove(forward);
    },
  };
}
