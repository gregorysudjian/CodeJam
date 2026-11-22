import { describe, expect, it } from 'vitest';
import { countdownAt, flyProgress, introCamera, resumeCountAt, type CameraPose } from './intro';
import * as T from './tuning';

const pose = (): CameraPose => ({ px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 });

describe('intro', () => {
  it('counts 3, 2, 1, then GO for a moment after the clock starts', () => {
    expect(countdownAt(0)).toBe('3');
    expect(countdownAt(0.99)).toBe('3');
    expect(countdownAt(1.01)).toBe('2');
    expect(countdownAt(2.5)).toBe('1');
    expect(countdownAt(T.INTRO_SEC)).toBe('GO');
    expect(countdownAt(T.INTRO_SEC + T.INTRO_GO_SEC + 0.01)).toBeNull();
    expect(countdownAt(-1)).toBeNull();
  });

  it('flies in smoothly and lands before GO', () => {
    expect(flyProgress(0)).toBe(0);
    expect(flyProgress(T.INTRO_FLY_SEC)).toBe(1);
    expect(T.INTRO_FLY_SEC).toBeLessThanOrEqual(T.INTRO_SEC);
    let last = 0;
    for (let t = 0; t <= T.INTRO_FLY_SEC; t += 0.05) {
      const k = flyProgress(t);
      expect(k).toBeGreaterThanOrEqual(last);
      last = k;
    }
  });

  it('ends exactly on the chase camera, so the round starts with no jump', () => {
    const c = introCamera(1, pose());
    expect(c.px).toBeCloseTo(T.CAMERA_POS.x);
    expect(c.py).toBeCloseTo(T.CAMERA_POS.y);
    expect(c.pz).toBeCloseTo(T.CAMERA_POS.z);
    expect(c.lx).toBeCloseTo(T.CAMERA_LOOK.x);
    expect(c.ly).toBeCloseTo(T.CAMERA_LOOK.y);
    expect(c.lz).toBeCloseTo(T.CAMERA_LOOK.z);
  });

  it('starts in front of the runner, looking at it', () => {
    const c = introCamera(0, pose());
    expect(c.pz).toBeLessThan(0); // ahead of the runner (the track runs toward -z)
    expect(c.lz).toBeCloseTo(0);
    expect(c.ly).toBeCloseTo(T.INTRO_LOOK_Y);
    // Never inside the runner on the way.
    for (let k = 0; k <= 1; k += 0.05) {
      const p = introCamera(k, pose());
      expect(Math.hypot(p.px, p.pz)).toBeGreaterThan(2);
    }
  });

  it('on a real level dollies straight in from behind, never turning, and lands on the chase camera', () => {
    const dir = (c: CameraPose) => {
      const v = [c.lx - c.px, c.ly - c.py, c.lz - c.pz];
      const n = Math.hypot(...v);
      return v.map((x) => x / n);
    };
    const end = introCamera(1, pose(), true);
    const chase = introCamera(1, pose());
    for (const key of ['px', 'py', 'pz', 'lx', 'ly', 'lz'] as const)
      expect(end[key]).toBeCloseTo(chase[key]);
    const start = introCamera(0, pose(), true);
    expect(start.pz).toBeGreaterThan(T.CAMERA_POS.z); // further behind the runner
    for (let k = 0; k <= 1; k += 0.1) {
      const c = introCamera(k, pose(), true);
      dir(c).forEach((x, i) => expect(x).toBeCloseTo(dir(end)[i]!));
      expect(c.px).toBeCloseTo(T.CAMERA_POS.x);
    }
    const back = Math.hypot(start.px - end.px, start.py - end.py, start.pz - end.pz);
    expect(back).toBeCloseTo(T.REAL_CAMERA.dolly);
  });
});

describe('the countdown before a resume', () => {
  it('shows 3, 2, 1 like the intro, nothing outside it', () => {
    expect(resumeCountAt(null)).toBeNull();
    expect(resumeCountAt(T.RESUME_COUNTDOWN_SEC)).toBe(String(T.RESUME_COUNTDOWN_SEC));
    expect(resumeCountAt(2.5)).toBe('3');
    expect(resumeCountAt(1.5)).toBe('2');
    expect(resumeCountAt(0.01)).toBe('1');
    expect(resumeCountAt(0)).toBeNull();
  });
});
