// The database refuses a session scoring more than CAP points per second of round
// (supabase/migrations/0004_session_limits.sql, docs/LIVE.md L1). This replays every generated
// level with perfect play and checks no real round comes near the cap, so a generator or scoring
// change can never get an honest player's round refused. Lives in src/app/ because only the app
// may import src/workout (AGENTS.md rule 3).
import { describe, expect, it } from 'vitest';
import type { Level, PlayMode, WorkoutId } from '@/contracts';
import { createSessionTracker, generateLevel, WORKOUTS } from '@/workout';
import sql from '../../supabase/migrations/0004_session_limits.sql?raw';

const CAP_PER_SEC = Number(/check \(score <= (\d+) \* duration_sec\)/.exec(sql)?.[1]);
/** A real round must stay this far below the cap. */
const HEADROOM = 1.2;

function perfectScore(level: Level): number {
  const tracker = createSessionTracker(level.config);
  for (const wave of level.waves)
    for (const spawn of wave.spawns)
      tracker.handleGameEvent({
        type: spawn.kind === 'orb' ? 'collected' : 'cleared',
        spawn,
        t: wave.t,
      });
  return tracker.finish(level.config.durationSec).score;
}

describe('score ceiling in migration 0004', () => {
  it('is read from the migration', () => {
    expect(CAP_PER_SEC).toBeGreaterThan(0);
  });

  // Requested lengths: the old 45 / 90 / 180 s choices and the ends of the 10 to 600 s range the
  // table allows. The cap applies to the duration that is saved, which is the level's own
  // (level.config: the app passes it to the tracker, CONTRACTS.md). With levels, the generator may
  // build a full round (180 s) whatever was asked, so compare against that, not the request.
  for (const durationSec of [10, 45, 90, 180, 600]) {
    it(`leaves ${HEADROOM}x headroom over perfect play when ${durationSec} s is asked for`, () => {
      let worst = 0; // highest perfect score per second of the round actually built
      for (const workout of Object.keys(WORKOUTS) as WorkoutId[])
        for (const mode of WORKOUTS[workout].availableIn as PlayMode[])
          for (let d = 0; d <= 10; d++)
            for (const lowImpact of [false, true])
              for (let i = 0; i < (durationSec > 180 ? 4 : 20); i++) {
                const level = generateLevel({
                  workout,
                  mode,
                  durationSec,
                  difficulty: d / 10,
                  lowImpact,
                  seed: i * 7919 + 13,
                });
                worst = Math.max(worst, perfectScore(level) / level.config.durationSec);
              }
      expect(worst * HEADROOM).toBeLessThanOrEqual(CAP_PER_SEC);
    });
  }
});
