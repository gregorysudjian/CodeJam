import { describe, expect, it } from 'vitest';
import type { MoveType } from '@/contracts';
import { createKeyboardController } from './keyboard';

describe('overlapping arm controls', () => {
  it.each([
    ['KeyQ', 'KeyE', 'reachLeft'],
    ['KeyE', 'KeyQ', 'reachRight'],
  ] as const)('recognises both arms when %s is joined by %s', (first, second, reach) => {
    const keyboard = createKeyboardController(() => 0);
    const moves: MoveType[] = [];
    keyboard.onMove(({ type }) => moves.push(type));
    keyboard.keyDown(first, false);
    keyboard.keyDown(second, false);
    keyboard.keyDown('KeyW', false);
    keyboard.keyUp('KeyW');
    expect(keyboard.getState()).toMatchObject({ leftArmUp: true, rightArmUp: true });
    keyboard.keyUp(second);
    keyboard.keyDown(second, false);
    expect(moves).toEqual([reach, 'armsUp', 'armsUp']);
  });

  it('pressing another arm key under W adds no rep and the remaining hold survives W release', () => {
    const keyboard = createKeyboardController(() => 0);
    const moves: MoveType[] = [];
    keyboard.onMove(({ type }) => moves.push(type));
    keyboard.keyDown('KeyW', false);
    keyboard.keyDown('KeyQ', false);
    keyboard.keyUp('KeyW');
    expect(keyboard.getState()).toMatchObject({ leftArmUp: true, rightArmUp: false });
    expect(moves).toEqual(['armsUp']);
  });
});
