import { describe, expect, it } from 'vitest';
import type { Lane, Level, SessionConfig, Wave } from '@/contracts';
import { generateLevel } from './level';
import * as T from './tuning';

const lanes: readonly Lane[] = [-1, 0, 1];

// A block and orb can share a wave if the player can collect the orb from the free lane.
function reachableAfter(wave: Wave, previous: readonly Lane[], mode: SessionConfig['mode']) {
  return lanes.filter(
    (lane) =>
      previous.some((from) => Math.abs(lane - from) <= 1) &&
      wave.spawns.every((s) => {
        if (s.kind === 'block') return !s.lanes.includes(lane);
        if (s.kind === 'orb' && mode === 'floor') return s.lanes.includes(lane);
        return true;
      }),
  );
}

function checkLevel({ config, waves }: Level) {
  if (waves.length === 0) throw new Error('Empty level: ' + JSON.stringify(config));
  let previousEnd = -Infinity;
  let previousHold = 0;
  let beamEnd = -Infinity;
  let possible: readonly Lane[] = [0];
  for (const wave of waves) {
    const fail = (reason: string) => {
      throw new Error(JSON.stringify({ config, wave, reason }));
    };
    const { t, spawns } = wave;
    if (spawns.some((s) => s.kind === 'beam') && spawns.some((s) => s.kind === 'hurdle'))
      fail('requires a squat and a jump together');
    if (spawns.some((s) => s.kind === 'orb' && !s.lanes.some((lane) => lanes.includes(lane))))
      fail('orb has no playable target');
    const hold = Math.max(...spawns.map((s) => s.holdSec ?? 0));
    if (
      !Number.isFinite(t + hold) ||
      t < T.FIRST_WAVE_SEC ||
      t + hold + T.END_MARGIN_SEC > config.durationSec
    )
      fail('outside playable interval');
    let recovery = previousHold ? T.MIN_GAP_AFTER_HOLD_SEC : T.MIN_GAP_SEC;
    if (t < T.WARMUP_END * config.durationSec) recovery = Math.max(recovery, T.MIN_GAP_WARMUP_SEC);
    // Generator times are in hundredths. Compare at that precision to avoid float subtraction noise.
    if (Math.round((t - previousEnd) * 100) < Math.round(recovery * 100)) fail('wave recovery');
    for (const s of spawns) {
      if (config.lowImpact && s.kind === 'hurdle') fail('low impact jump');
      if (config.mode === 'treadmill' && !['orb', 'crate'].includes(s.kind))
        fail('treadmill leg move');
      const afterBeam =
        s.kind === 'hurdle'
          ? T.MIN_GAP_BEAM_TO_HURDLE_SEC
          : s.kind === 'beam'
            ? T.MIN_GAP_SQUAT_TO_SQUAT_SEC
            : 0;
      if (Math.round((t - beamEnd) * 100) < Math.round(afterBeam * 100)) fail('beam recovery');
    }
    possible = reachableAfter(wave, possible, config.mode);
    if (!possible.length) fail('no reachable lane clears every spawn');
    previousHold = hold;
    previousEnd = t + hold;
    if (spawns.some((s) => s.kind === 'beam')) beamEnd = previousEnd;
  }
}

describe.each(['legs', 'arms', 'shoulders', 'fullBody'] as const)('%s generation', (workout) => {
  it.each(['floor', 'treadmill'] as const)(
    '%s has a playable route through 200 seeds per setting',
    (mode) => {
      for (const durationSec of [45, 90, 180])
        for (const lowImpact of [false, true])
          for (let step = 0; step <= 10; step++)
            for (let seed = 0; seed < 200; seed++)
              checkLevel(
                generateLevel({
                  workout,
                  mode,
                  durationSec,
                  lowImpact,
                  difficulty: step / 10,
                  seed,
                }),
              );
    },
  );
});

// Full serialised levels (seed 11475, the six levels), including lane assignments, intensity
// and stages. Was seed 41492 (45 s) up to the level system.
it.each([
  [false, '4b24911104319d91d8a507bf3194ae99d417137d25a7650810656d11e21024bc'],
  [true, 'c6c95e1c1f9786b6e48224005a6180a4bd1a10b997db81c1c0f7d8ad9b8813b0'],
] as const)('pins every demo byte, low impact %s', async (lowImpact, digest) => {
  const bytes = JSON.stringify(generateLevel({ ...T.DEMO_CONFIG, lowImpact }));
  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes)),
  );
  expect(Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')).toBe(digest);
});
