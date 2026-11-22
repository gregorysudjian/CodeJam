import { describe, expect, test } from 'vitest';
import { FIGURE_POSES } from './figurePoses';

// The figure is drawn as a mirror (x grows to the screen's right; y grows down).
describe('figure poses', () => {
  test("reachLeft raises the arm on the screen's left, reachRight the one on its right", () => {
    const left = FIGURE_POSES.reachLeft;
    const right = FIGURE_POSES.reachRight;
    expect(left.lHand[1]).toBeLessThan(left.head[1]); // screen-left hand above the head
    expect(left.lHand[0]).toBeLessThan(50);
    expect(left.rHand[1]).toBeGreaterThan(left.neck[1]); // the other arm stays down
    expect(right.rHand[1]).toBeLessThan(right.head[1]);
    expect(right.rHand[0]).toBeGreaterThan(50);
    expect(right.lHand[1]).toBeGreaterThan(right.neck[1]);
  });

  test('pause crosses the forearms in front of the chest', () => {
    const s = FIGURE_POSES.pause;
    // Each hand ends on the other side of the body from its elbow...
    expect(s.lElbow[0]).toBeLessThan(50);
    expect(s.lHand[0]).toBeGreaterThan(50);
    expect(s.rElbow[0]).toBeGreaterThan(50);
    expect(s.rHand[0]).toBeLessThan(50);
    // ...between the shoulders and the hips.
    for (const p of [s.lHand, s.rHand, s.lElbow, s.rElbow]) {
      expect(p[1]).toBeGreaterThan(s.neck[1]);
      expect(p[1]).toBeLessThan(s.hip[1]);
    }
  });
});
