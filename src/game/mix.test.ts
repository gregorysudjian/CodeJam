import { describe, expect, it } from 'vitest';
import { LIMITER, MUSIC_VOICES, MUSIC_VOLUME, SFX } from './look';
import { AUDIO_VOLUME } from './tuning';

/**
 * The sound mix (look.ts) was rendered offline in Chrome at its worst (the beat at full layers
 * plus every effect at once, four times): peak -5.5 dBFS, nothing at or over full scale. A test
 * can't render Web Audio, so these pin what that measurement depends on: the limiter on the
 * master bus, and a worst-case budget of every level. Raising a level past the budget means
 * rendering the mix again (see the commit that added look.ts SFX) before raising the budget.
 */

/** Each effect's peak with the voices of it that overlap in time (audio.ts). */
const EFFECT_PEAKS = {
  cue: SFX.cue, // two beeps, one after the other
  cleared: SFX.cleared * 1.34, // a sweep plus a quieter octave on top
  collected: SFX.collected * 4, // four notes 45 ms apart, each 140 ms long
  smash: SFX.smash * 1.2, // noise plus a square drop
  hit: SFX.hit * 1.38, // noise plus a sawtooth drop
  saw: SFX.saw * 0.4 * 4, // all four "I saw that" sounds in one frame
  levelUp: SFX.levelUp * 5, // five notes 60 ms apart
  perfect: SFX.perfect,
};
/** The beat's voices that can sound together (music.ts), before MUSIC_VOLUME. */
const BEAT_PEAK =
  MUSIC_VOICES.kick +
  Math.max(MUSIC_VOICES.hat, MUSIC_VOICES.openHat) +
  MUSIC_VOICES.clap * 1.67 +
  MUSIC_VOICES.snare * 1.43 +
  MUSIC_VOICES.bass +
  MUSIC_VOICES.arp +
  MUSIC_VOICES.stab * 3;

describe('sound mix', () => {
  it('a limiter guards the master bus, just under full scale', () => {
    expect(LIMITER.thresholdDb).toBeLessThanOrEqual(-1);
    expect(LIMITER.thresholdDb).toBeGreaterThanOrEqual(-3); // lower adds make-up gain (look.ts)
    expect(LIMITER.ratio).toBeGreaterThanOrEqual(12);
    expect(LIMITER.attackSec).toBeLessThanOrEqual(0.005);
    expect(LIMITER.kneeDb).toBeLessThanOrEqual(3);
  });

  it('the worst pile-up stays within the budget that was rendered without clipping', () => {
    const effects = Object.values(EFFECT_PEAKS).reduce((a, b) => a + b, 0);
    const worst = AUDIO_VOLUME * (effects + MUSIC_VOLUME * BEAT_PEAK);
    // 2.41 when measured. Every effect at its loudest in the same instant never happens; the
    // offline render of the real worst case peaked at -5.5 dBFS.
    expect(worst).toBeLessThanOrEqual(2.5);
  });

  it('the music sits under the effects that carry the feedback', () => {
    expect(MUSIC_VOLUME * MUSIC_VOICES.kick).toBeLessThan(SFX.hit);
    expect(MUSIC_VOLUME * MUSIC_VOICES.kick).toBeLessThan(SFX.cleared);
    for (const level of [...Object.values(SFX), ...Object.values(MUSIC_VOICES), MUSIC_VOLUME])
      expect(level).toBeGreaterThan(0);
  });
});
