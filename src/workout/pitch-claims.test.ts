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

  it('is Full body, floor, 45 s, seed 41492', () => {
    expect(level.config).toMatchObject({
      workout: 'fullBody',
      mode: 'floor',
      durationSec: 45,
      seed: 41492,
    });
  });

  it('scores 4,750 at 100% when played perfectly ("Beat 4,750 to take the crown")', () => {
    const s = perfect(level);
    expect(s.score).toBe(4750);
    expect(s.accuracy).toBe(1);
    expect(s.hit).toBe(0);
  });

  it('is about 7 kcal for a 70 kg player (DEMO.md: MET 8 × 3.5 × 70 ÷ 200 × 0.75 min)', () => {
    expect(perfect(level).kcal).toBeCloseTo(7.35, 1);
  });
});

describe('one board per round length (DEMO.md "Doesn\'t a longer round always win?")', () => {
  const mean = (config: SessionConfig, seeds: number) => {
    let sum = 0;
    for (let seed = 1; seed <= seeds; seed++)
      sum += perfect(generateLevel({ ...config, seed })).score;
    return sum / seeds;
  };

  it('a perfect 180 s Full body floor round scores about 6× a perfect 45 s one', () => {
    const base = { workout: 'fullBody', mode: 'floor', difficulty: 0.5 } as const;
    const ratio = mean({ ...base, durationSec: 180 }, 20) / mean({ ...base, durationSec: 45 }, 20);
    expect(ratio).toBeGreaterThan(5);
    expect(ratio).toBeLessThan(7);
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
