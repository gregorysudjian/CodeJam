import { describe, expect, it } from 'vitest';
import { accuracyGrade, cueProgress, mostMissed, roundHeadline } from '@/ui/screens/resultsRules';
import type { SessionSummary } from '@/contracts';

const zero = { sidestep: 0, jump: 0, squat: 0, armsUp: 0, reachLeft: 0, reachRight: 0 };
const summary: SessionSummary = {
  config: { workout: 'fullBody', mode: 'floor', durationSec: 90 },
  score: 0,
  streak: 0,
  multiplier: 1,
  kcal: 0,
  bestStreak: 0,
  cleared: 0,
  hit: 5,
  accuracy: 0,
  reps: { ...zero },
  missed: { ...zero, jump: 3, squat: 2 },
  activeSec: 0,
};
describe('round rules', () => {
  it('grades S at 95%, not below', () => {
    expect(accuracyGrade(0.95)).toBe('S');
    expect(accuracyGrade(0.949)).toBe('A');
  });
  it('grades A at 85%, not below', () => {
    expect(accuracyGrade(0.85)).toBe('A');
    expect(accuracyGrade(0.849)).toBe('B');
  });
  it('grades B at 70%, otherwise C', () => {
    expect(accuracyGrade(0.7)).toBe('B');
    expect(accuracyGrade(0.699)).toBe('C');
  });
  it('countdown spans two seconds and clamps', () => {
    expect(cueProgress(2)).toBe(0);
    expect(cueProgress(1)).toBe(0.5);
    expect(cueProgress(0)).toBe(1);
    expect(cueProgress(-1)).toBe(1);
    expect(cueProgress(3)).toBe(0);
  });
  it('identifies jump with three misses ahead of squat with two', () => {
    expect(mostMissed(summary)).toBe('jump');
  });
  it('headlines how the round ended', () => {
    expect(roundHeadline({ levelReached: 3, outOfLives: true }).text).toBe(
      'OUT OF LIVES · LEVEL 3',
    );
    expect(roundHeadline({ levelReached: 6, outOfLives: false }).text).toBe('ALL 6 LEVELS CLEARED');
    expect(roundHeadline({ levelReached: 6 }).text).toBe('ALL 6 LEVELS CLEARED');
    expect(roundHeadline({ levelReached: 1 }).text).toBe('LEVEL 1 CLEARED');
    // Saved before levels existed, or the tracker doesn't fill them yet.
    expect(roundHeadline({}).text).toBe('ROUND COMPLETE');
    // Out of lives with no stage event: level 1 (CONTRACTS.md).
    expect(roundHeadline({ outOfLives: true }).text).toBe('OUT OF LIVES · LEVEL 1');
  });
});
