// Owner: B. Real keyboard input (the permanent fallback for the camera).
// Mapping from docs/CONTRACTS.md: arrows change lane, Up/Space jump, Down held squat,
// W held both arms, Q/E held left/right arm. Global keys (K, R, D, Esc) belong to src/app.
import type { InputSource, InputState, Lane, MoveEvent } from '@/contracts';

const AIRBORNE_MS = 450;

export function createKeyboardInput(): InputSource {
  const state: InputState = {
    tracking: true,
    lane: 0,
    ducking: false,
    airborne: false,
    leftArmUp: false,
    rightArmUp: false,
  };
  const listeners = new Set<(e: MoveEvent) => void>();
  let landTimer: ReturnType<typeof setTimeout> | undefined;

  const emit = (type: MoveEvent['type']) => {
    const e: MoveEvent = { type, t: performance.now() };
    listeners.forEach((cb) => cb(e));
  };

  const setLane = (lane: number) => {
    const next = Math.max(-1, Math.min(1, lane)) as Lane;
    if (next !== state.lane) {
      state.lane = next;
      emit('sidestep');
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    switch (e.code) {
      case 'ArrowLeft':
        setLane(state.lane - 1);
        break;
      case 'ArrowRight':
        setLane(state.lane + 1);
        break;
      case 'ArrowUp':
      case 'Space':
        if (!state.airborne) {
          state.airborne = true;
          emit('jump');
          landTimer = setTimeout(() => (state.airborne = false), AIRBORNE_MS);
        }
        break;
      case 'ArrowDown':
        state.ducking = true;
        emit('squat');
        break;
      case 'KeyW':
        state.leftArmUp = state.rightArmUp = true;
        emit('armsUp');
        break;
      case 'KeyQ':
        state.leftArmUp = true;
        emit('reachLeft');
        break;
      case 'KeyE':
        state.rightArmUp = true;
        emit('reachRight');
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const onKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'ArrowDown':
        state.ducking = false;
        break;
      case 'KeyW':
        state.leftArmUp = state.rightArmUp = false;
        break;
      case 'KeyQ':
        state.leftArmUp = false;
        break;
      case 'KeyE':
        state.rightArmUp = false;
        break;
    }
  };

  return {
    kind: 'keyboard',
    async start() {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
    },
    stop() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      clearTimeout(landTimer);
    },
    getState: () => ({ ...state }),
    onMove(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
