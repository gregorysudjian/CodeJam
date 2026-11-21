import { describe, expect, it } from 'vitest';
import type { InputSource, InputState, MoveEvent } from '@/contracts';
import { createSwitchableInput } from './switchableInput';

function fakeSource(kind: 'pose' | 'keyboard', state: Partial<InputState> = {}) {
  const listeners = new Set<(e: MoveEvent) => void>();
  const source: InputSource & { emit(type: MoveEvent['type']): void; subscribers(): number } = {
    kind,
    start: async () => {},
    stop: () => {},
    getState: () => ({
      tracking: true,
      lane: 0,
      ducking: false,
      airborne: false,
      leftArmUp: false,
      rightArmUp: false,
      ...state,
    }),
    onMove(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit: (type) => listeners.forEach((cb) => cb({ type, t: 0 })),
    subscribers: () => listeners.size,
  };
  return source;
}

describe('createSwitchableInput', () => {
  it('forwards kind, state and moves of the current source', () => {
    const keyboard = fakeSource('keyboard', { lane: 1 });
    const input = createSwitchableInput(keyboard);
    const moves: string[] = [];
    input.onMove((e) => moves.push(e.type));

    keyboard.emit('jump');

    expect(input.kind).toBe('keyboard');
    expect(input.getState().lane).toBe(1);
    expect(moves).toEqual(['jump']);
  });

  it('switches source without losing subscribers, and ignores the old source afterwards', () => {
    const pose = fakeSource('pose', { tracking: false });
    const keyboard = fakeSource('keyboard');
    const input = createSwitchableInput(pose);
    const moves: string[] = [];
    input.onMove((e) => moves.push(e.type));

    expect(input.getState().tracking).toBe(false); // player lost: the game pauses
    input.setSource(keyboard);
    expect(input.kind).toBe('keyboard');
    expect(input.getState().tracking).toBe(true); // keyboard: the game resumes

    pose.emit('squat'); // old source: ignored
    keyboard.emit('sidestep');
    expect(moves).toEqual(['sidestep']);
    expect(pose.subscribers()).toBe(0);
  });

  it('stops forwarding to an unsubscribed listener', () => {
    const keyboard = fakeSource('keyboard');
    const input = createSwitchableInput(keyboard);
    const moves: string[] = [];
    const off = input.onMove((e) => moves.push(e.type));
    off();
    keyboard.emit('jump');
    expect(moves).toEqual([]);
  });
});
