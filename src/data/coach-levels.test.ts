// The rule coach with levels and lives (CONTRACTS.md #89-#91): tiers 0 / 0.5 / 1, a round is every
// level (180 s), and the recap uses levelReached / outOfLives when the round reports them.
import { describe, expect, it } from 'vitest';
import type { FitnessLevel, MoveType, Profile, SavedSession, SessionConfig } from '@/contracts';
import { ruleBasedAdvice, tierIndex } from './coach';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const zero = (): Record<MoveType, number> => ({
  sidestep: 0,
  jump: 0,
  squat: 0,
  armsUp: 0,
  reachLeft: 0,
  reachRight: 0,
});
function round(
  over: Omit<Partial<SavedSession>, 'config'> & { config?: Partial<SessionConfig> } = {},
): SavedSession {
  const { config, ...rest } = over;
  return {
    id: crypto.randomUUID(),
    at: NOW - 1000,
    synced: true,
    config: { workout: 'fullBody', mode: 'floor', durationSec: 180, difficulty: 0.5, ...config },
    score: 2400,
    streak: 0,
    multiplier: 1,
    reps: zero(),
    kcal: 20,
    bestStreak: 12,
    cleared: 40,
    hit: 3,
    accuracy: 0.7,
    missed: zero(),
    activeSec: 180,
    ...rest,
  };
}
const player = (level: FitnessLevel): Profile => ({
  id: 'u1',
  displayName: 'Ana',
  goal: 'getMoving',
  level,
  weeklyGoalMin: 60,
});
const advise = (r: SavedSession, level: FitnessLevel = 'regular') =>
  ruleBasedAdvice(player(level), [r], NOW);

describe('recap with levels and lives', () => {
  it('out of lives: says the level reached, with numbers from the round', () => {
    const a = advise(round({ levelReached: 4, outOfLives: true, score: 1850, accuracy: 0.72 }));
    expect(a.recap).toBe(
      'Good round, Ana: you reached level 4 before running out of lives, with 1850 points at 72% accuracy. Every round makes the next one easier.',
    );
  });

  it('every level cleared', () => {
    const a = advise(round({ levelReached: 6, outOfLives: false, accuracy: 0.9 }));
    expect(a.recap).toMatch(/^Nice work, Ana: you cleared all 6 levels, with 2400 points at 90%/);
  });

  it('a round that ended early without running out of lives (quit) says the level reached', () => {
    expect(advise(round({ levelReached: 3 })).recap).toMatch(/: you reached level 3, with /);
  });

  it('a round saved before levels existed keeps the old recap (best streak)', () => {
    const a = advise(round({ config: { durationSec: 45 } }));
    expect(a.recap).toBe(
      'Good round, Ana: 2400 points at 70% accuracy, with a best streak of 12. Every round makes the next one easier.',
    );
  });

  it('never prints undefined, NaN or null, whatever is missing', () => {
    for (const r of [
      round({ levelReached: 1, outOfLives: true, accuracy: 0 }),
      round({ outOfLives: true }),
      round({ levelReached: 6 }),
    ]) {
      const a = advise(r);
      for (const t of [a.recap, a.tip, a.reason]) expect(t).not.toMatch(/undefined|NaN|null/);
    }
  });
});

describe('next session: tier and length', () => {
  it('is always every level: 180 s', () => {
    expect(advise(round({ config: { durationSec: 45 } })).next.durationSec).toBe(180);
  });

  it('out of lives before level 3: one tier down, even with good accuracy', () => {
    const a = advise(round({ levelReached: 2, outOfLives: true, accuracy: 0.75 }));
    expect(a.next.difficulty).toBe(0);
    expect(a.reason).toMatch(/easing back to beginner/);
  });

  it('out of lives at level 3 or later with fair accuracy: same tier', () => {
    expect(advise(round({ levelReached: 3, outOfLives: true })).next.difficulty).toBe(0.5);
    expect(advise(round({ levelReached: 5, outOfLives: true })).next.difficulty).toBe(0.5);
  });

  it('never moves up after running out of lives, even with high accuracy', () => {
    const a = advise(round({ levelReached: 5, outOfLives: true, accuracy: 0.95 }));
    expect(a.next.difficulty).toBe(0.5);
  });

  it('a strong full round moves one tier up', () => {
    expect(
      advise(round({ levelReached: 6, outOfLives: false, accuracy: 0.9 })).next.difficulty,
    ).toBe(1);
  });

  it("a first round starts on the tier of the player's fitness level", () => {
    expect(ruleBasedAdvice(player('beginner'), [], NOW).next.difficulty).toBe(0);
    expect(ruleBasedAdvice(player('regular'), [], NOW).next.difficulty).toBe(0.5);
    expect(ruleBasedAdvice(player('athlete'), [], NOW).next.difficulty).toBe(1);
    expect(ruleBasedAdvice(null, [], NOW).next.difficulty).toBe(0.5);
    expect(ruleBasedAdvice(player('athlete'), [], NOW).reason).toMatch(/athlete tier/);
  });
});

describe('tierIndex', () => {
  it('snaps to the nearest tier, halves up, junk to regular', () => {
    expect([0, 0.24, 0.25, 0.5, 0.74, 0.75, 1].map(tierIndex)).toEqual([0, 0, 1, 1, 1, 2, 2]);
    expect([undefined, NaN, Infinity, -3, 7].map(tierIndex)).toEqual([1, 1, 1, 0, 2]);
  });
});
