// Pins the numbers the pitch, README, SUBMISSION and Devpost screenshots quote (added by QA).
// If one of these changes on purpose, update docs/DEMO.md, docs/SUBMISSION.md and the screenshots.
import { describe, expect, it } from 'vitest';
import type { Level, SessionConfig, SessionSummary } from '@/contracts';
import { createSessionTracker, DEMO_CONFIG, generateLevel, WORKOUTS } from './index';

/** Every object cleared, every orb collected, in wave order: a perfect round. */
function perfect(level: Level): SessionSummary {
  const tracker = createSessionTracker(level.config);
  for (const wave of level.waves) {
    for (const spawn of wave.spawns) {
      tracker.handleGameEvent({
        type: spawn.kind === 'orb' ? 'collected' : 'cleared',
        spawn,
        t: wave.t,
      });
    }
  }
  return tracker.finish(level.config.durationSec);
}

describe('the demo round the docs quote', () => {
  const level = generateLevel({ ...DEMO_CONFIG });

  it('is Full body, floor, the six levels (180 s), seed 11475', () => {
    expect(level.config).toMatchObject({
      workout: 'fullBody',
      mode: 'floor',
      durationSec: 180,
      seed: 11475,
    });
  });

  // Was 4,750 for the 45 s demo (seed 41492): docs/DEMO.md and SUBMISSION.md quote that number.
  it('scores 24,800 at 100% when played perfectly', () => {
    const s = perfect(level);
    expect(s.score).toBe(24800);
    expect(s.accuracy).toBe(1);
    expect(s.hit).toBe(0);
  });

  it('is about 29 kcal for a 70 kg player (MET 8 × 3.5 × 70 ÷ 200 × 3 min; was 7 for 45 s)', () => {
    expect(perfect(level).kcal).toBeCloseTo(29.4, 1);
  });
});

describe('one board for every round (DEMO.md "Doesn\'t a longer round always win?")', () => {
  const mean = (config: SessionConfig, seeds: number) => {
    let sum = 0;
    for (let seed = 1; seed <= seeds; seed++)
      sum += perfect(generateLevel({ ...config, seed })).score;
    return sum / seeds;
  };

  it('every round is the six levels now, so any length picked plays and scores the same', () => {
    const base = { workout: 'fullBody', mode: 'floor', difficulty: 0.5 } as const;
    expect(mean({ ...base, durationSec: 45 }, 5)).toBe(mean({ ...base, durationSec: 180 }, 5));
  });
});

describe('workouts and modes the docs list', () => {
  it('Legs is floor only; Arms, Shoulders and Full body also run on the treadmill', () => {
    expect(WORKOUTS.legs.availableIn).toEqual(['floor']);
    for (const id of ['arms', 'shoulders', 'fullBody'] as const) {
      expect(WORKOUTS[id].availableIn).toEqual(['floor', 'treadmill']);
    }
  });
});
