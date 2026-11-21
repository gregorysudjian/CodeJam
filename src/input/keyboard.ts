import type { InputState, Lane, MoveEvent, MoveType } from '@/contracts';
import { AIRBORNE_MS } from './tuning';

/**
 * Pure keyboard state machine, no DOM. `createKeyboardInput` feeds it window events;
 * tests feed it key codes directly. Keys use `KeyboardEvent.code` (physical position).
 *
 * Mapping (CONTRACTS.md): arrows change lane, Up or Space jumps, Down held squats,
 * W held = both arms, Q / E held = left / right arm. K, R, D and Esc belong to the app.
 */
export const HANDLED_CODES: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
  'KeyW',
  'KeyQ',
  'KeyE',
]);

export interface KeyboardController {
  keyDown(code: string, repeat: boolean): boolean; // true if the key is ours
  keyUp(code: string): void;
  releaseAll(): void; // window blur: no key stays stuck down
  reset(): void;
  getState(): InputState;
  onMove(cb: (e: MoveEvent) => void): () => void;
}

export function createKeyboardController(now: () => number): KeyboardController {
  const held = new Set<string>();
  const listeners = new Set<(e: MoveEvent) => void>();
  let lane: Lane = 0;
  let airborneUntil = -Infinity;

  const emit = (type: MoveType): void => {
    const e: MoveEvent = { type, t: now() };
    for (const cb of listeners) cb(e);
  };

  const shiftLane = (dir: -1 | 1): void => {
    const next = Math.max(-1, Math.min(1, lane + dir)) as Lane;
    if (next === lane) return;
    lane = next;
    emit('sidestep');
  };

  return {
    keyDown(code, repeat) {
      if (!HANDLED_CODES.has(code)) return false;
      if (repeat || held.has(code)) return true; // auto-repeat is never a new rep
      held.add(code);
      switch (code) {
        case 'ArrowLeft':
          shiftLane(-1);
          break;
        case 'ArrowRight':
          shiftLane(1);
          break;
        case 'ArrowUp':
        case 'Space':
          if (now() >= airborneUntil) {
            airborneUntil = now() + AIRBORNE_MS;
            emit('jump');
          }
          break;
        case 'ArrowDown':
          emit('squat');
          break;
        case 'KeyW':
          if (!(held.has('KeyQ') && held.has('KeyE'))) emit('armsUp');
          break;
        case 'KeyQ':
          if (!held.has('KeyW')) emit(held.has('KeyE') ? 'armsUp' : 'reachLeft');
          break;
        case 'KeyE':
          if (!held.has('KeyW')) emit(held.has('KeyQ') ? 'armsUp' : 'reachRight');
          break;
      }
      return true;
    },
    keyUp(code) {
      held.delete(code);
    },
    releaseAll() {
      held.clear();
    },
    reset() {
      held.clear();
      lane = 0;
      airborneUntil = -Infinity;
    },
    getState() {
      const both = held.has('KeyW');
      return {
        tracking: true,
        lane,
        ducking: held.has('ArrowDown'),
        airborne: now() < airborneUntil,
        leftArmUp: both || held.has('KeyQ'),
        rightArmUp: both || held.has('KeyE'),
      };
    },
    onMove(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
