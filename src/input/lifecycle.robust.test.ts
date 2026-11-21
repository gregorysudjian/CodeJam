import { afterEach, expect, it, vi } from 'vitest';
import type { MoveType } from '@/contracts';
import { createKeyboardInput } from './index';

// The adapter uses ordinary DOM events. Model a lost keyup, which a controller-only test misses.
function setup() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    hidden: false,
    body: { dataset: { game: 'running' } },
  });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('HTMLElement', class {});
  const input = createKeyboardInput();
  const moves: MoveType[] = [];
  input.onMove(({ type }) => moves.push(type));
  function key(type: 'keydown' | 'keyup', code: string, repeat = false) {
    const event = Object.assign(new Event(type, { cancelable: true }), { code, repeat });
    win.dispatchEvent(event);
    return event.defaultPrevented;
  }
  return { win, doc, input, moves, key };
}
afterEach(() => vi.unstubAllGlobals());

it.each(['blur', 'visibilitychange'])(
  'releases simultaneous holds on %s without a keyup',
  async (event) => {
    const { win, doc, input, moves, key } = setup();
    await input.start();
    key('keydown', 'ArrowDown');
    key('keydown', 'KeyW');
    if (event === 'blur') win.dispatchEvent(new Event(event));
    else {
      doc.hidden = true;
      doc.dispatchEvent(new Event(event));
      doc.hidden = false;
    }
    expect(input.getState()).toMatchObject({ ducking: false, leftArmUp: false, rightArmUp: false });
    key('keydown', 'ArrowDown', true);
    expect(input.getState().ducking).toBe(false);
    key('keyup', 'ArrowDown');
    key('keydown', 'ArrowDown');
    expect(moves).toEqual(['squat', 'armsUp', 'squat']);
    input.stop();
  },
);

it('handles keyup on the pause screen, and repeat after resuming adds no squat', async () => {
  const { doc, input, moves, key } = setup();
  await input.start();
  expect(key('keydown', 'ArrowDown')).toBe(true);
  doc.body.dataset.game = '';
  expect(key('keydown', 'ArrowDown', true)).toBe(false);
  key('keyup', 'ArrowDown');
  doc.body.dataset.game = 'running';
  expect(input.getState().ducking).toBe(false);
  expect(moves).toEqual(['squat']);
  input.stop();
});

it('stop and restart across 20 source changes resets holds and ignores repeats from the old source', async () => {
  const { input, moves, key } = setup();
  for (let swap = 0; swap < 20; swap++) {
    await input.start();
    await input.start();
    key('keydown', 'KeyW', true);
    expect(input.getState().rightArmUp).toBe(false);
    key('keyup', 'KeyW');
    key('keydown', 'KeyW');
    expect(input.getState().rightArmUp).toBe(true);
    input.stop();
    input.stop();
    key('keydown', 'KeyQ');
    expect(input.getState()).toMatchObject({ leftArmUp: false, rightArmUp: false });
  }
  expect(moves).toEqual(Array(20).fill('armsUp'));
});
