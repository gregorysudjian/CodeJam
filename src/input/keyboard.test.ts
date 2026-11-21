import { describe, expect, it } from 'vitest';
import type { MoveType } from '@/contracts';
import { createKeyboardController } from './keyboard';
import { AIRBORNE_MS } from './tuning';

function setup() {
  let t = 1000;
  const ctl = createKeyboardController(() => t);
  const moves: MoveType[] = [];
  ctl.onMove((e) => moves.push(e.type));
  return { ctl, moves, advance: (ms: number) => (t += ms) };
}

describe('keyboard controller', () => {
  it('starts centred, tracking, nothing held', () => {
    const { ctl } = setup();
    expect(ctl.getState()).toEqual({
      tracking: true,
      lane: 0,
      ducking: false,
      airborne: false,
      leftArmUp: false,
      rightArmUp: false,
    });
  });

  it('changes lane one step per press, clamped, one sidestep per actual change', () => {
    const { ctl, moves } = setup();
    ctl.keyDown('ArrowRight', false);
    ctl.keyUp('ArrowRight');
    expect(ctl.getState().lane).toBe(1);
    ctl.keyDown('ArrowRight', false); // already at the edge
    ctl.keyUp('ArrowRight');
    expect(ctl.getState().lane).toBe(1);
    ctl.keyDown('ArrowLeft', false);
    ctl.keyUp('ArrowLeft');
    ctl.keyDown('ArrowLeft', false);
    ctl.keyUp('ArrowLeft');
    expect(ctl.getState().lane).toBe(-1);
    expect(moves).toEqual(['sidestep', 'sidestep', 'sidestep']);
  });

  it('ignores auto-repeat and keys already held', () => {
    const { ctl, moves } = setup();
    ctl.keyDown('ArrowLeft', false);
    ctl.keyDown('ArrowLeft', true);
    ctl.keyDown('ArrowLeft', false); // no keyup in between
    expect(ctl.getState().lane).toBe(-1);
    expect(moves).toEqual(['sidestep']);
  });

  it('jump is airborne for AIRBORNE_MS and cannot re-trigger mid-air', () => {
    const { ctl, moves, advance } = setup();
    ctl.keyDown('Space', false);
    ctl.keyUp('Space');
    expect(ctl.getState().airborne).toBe(true);
    advance(AIRBORNE_MS - 1);
    ctl.keyDown('ArrowUp', false);
    ctl.keyUp('ArrowUp');
    expect(moves).toEqual(['jump']);
    advance(1);
    expect(ctl.getState().airborne).toBe(false);
    ctl.keyDown('ArrowUp', false);
    expect(moves).toEqual(['jump', 'jump']);
  });

  it('squat and arms are held states with one move per press', () => {
    const { ctl, moves } = setup();
    ctl.keyDown('ArrowDown', false);
    expect(ctl.getState().ducking).toBe(true);
    ctl.keyUp('ArrowDown');
    expect(ctl.getState().ducking).toBe(false);

    ctl.keyDown('KeyW', false);
    expect(ctl.getState()).toMatchObject({ leftArmUp: true, rightArmUp: true });
    ctl.keyUp('KeyW');
    ctl.keyDown('KeyQ', false);
    expect(ctl.getState()).toMatchObject({ leftArmUp: true, rightArmUp: false });
    ctl.keyUp('KeyQ');
    ctl.keyDown('KeyE', false);
    expect(ctl.getState()).toMatchObject({ leftArmUp: false, rightArmUp: true });
    expect(moves).toEqual(['squat', 'armsUp', 'reachLeft', 'reachRight']);
  });

  it('leaves app keys alone and releases everything on blur', () => {
    const { ctl } = setup();
    expect(ctl.keyDown('KeyK', false)).toBe(false);
    expect(ctl.keyDown('Escape', false)).toBe(false);
    ctl.keyDown('ArrowDown', false);
    ctl.keyDown('KeyW', false);
    ctl.releaseAll();
    expect(ctl.getState()).toMatchObject({ ducking: false, leftArmUp: false, rightArmUp: false });
  });

  it('unsubscribe stops move events', () => {
    const { ctl } = setup();
    const got: MoveType[] = [];
    const off = ctl.onMove((e) => got.push(e.type));
    ctl.keyDown('KeyQ', false);
    off();
    ctl.keyDown('KeyE', false);
    expect(got).toEqual(['reachLeft']);
  });
});
