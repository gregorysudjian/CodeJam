import * as T from './tuning';

/**
 * The music: a synthesised beat (Web Audio, no files) that speeds up over the round and adds
 * layers as the streak climbs. The plan (tempo, layers, which notes fall on which step) is pure
 * and unit-tested (music.test.ts); `createMusic` turns it into sound, scheduled a little ahead of
 * the audio clock from the game's frame loop, so it never drifts with frame timing.
 *
 * Layers: kick and offbeat hats and the bass always; claps and 16th hats from streak 5; an
 * arpeggio from 10; chord stabs and an open hat from 20. The finale adds everything and a fill.
 */
export interface MusicState {
  progress: number; // 0 to 1 through the round
  tier: number; // streak tier 0 to 3 (core.feverTier)
  finale: boolean;
}

export interface Layers {
  claps: boolean;
  hats16: boolean;
  arp: boolean;
  stabs: boolean;
  fill: boolean;
}

export function bpmFor(s: MusicState): number {
  const p = Math.min(1, Math.max(0, s.progress));
  return T.BPM_START + (T.BPM_END - T.BPM_START) * p + (s.finale ? T.BPM_FINALE_BONUS : 0);
}

export function layersFor(s: MusicState): Layers {
  const t = s.finale ? 3 : s.tier;
  return { claps: t >= 1, hats16: t >= 1, arp: t >= 2, stabs: t >= 3, fill: s.finale };
}

/** Semitones above A2 (110 Hz) of each bar's chord root: Am, F, C, G. */
export const PROGRESSION = [0, -4, 3, -2] as const;
/** The chord's notes in semitones above its root (minor for the first, major for the rest). */
const chordOf = (bar: number): readonly number[] => (bar % 4 === 0 ? [0, 3, 7] : [0, 4, 7]);

export type Voice = 'kick' | 'hat' | 'openHat' | 'clap' | 'bass' | 'arp' | 'stab' | 'snare';
export interface Note {
  voice: Voice;
  semi: number; // above A2; ignored by drums
}

/** What plays on 16th step `step` (counting from the start) with these layers. */
export function notesAt(step: number, layers: Layers): Note[] {
  const s = step % 16;
  const bar = Math.floor(step / 16);
  const root = PROGRESSION[bar % 4]!;
  const chord = chordOf(bar);
  const out: Note[] = [];
  const lastBarOfPhrase = bar % 4 === 3;
  if (s % 4 === 0) out.push({ voice: 'kick', semi: 0 });
  if (s % 4 === 2) out.push({ voice: layers.stabs ? 'openHat' : 'hat', semi: 0 });
  else if (layers.hats16 && s % 2 === 1) out.push({ voice: 'hat', semi: 0 });
  if (layers.claps && (s === 4 || s === 12)) out.push({ voice: 'clap', semi: 0 });
  // Bass: driving offbeat 8ths on the root, an octave jump on the last one.
  if (s % 2 === 0 && s % 4 !== 0) out.push({ voice: 'bass', semi: root + (s === 14 ? 12 : 0) });
  if (s === 0) out.push({ voice: 'bass', semi: root });
  if (layers.arp) out.push({ voice: 'arp', semi: root + 24 + chord[s % 3]! + (s >= 8 ? 12 : 0) });
  if (layers.stabs && (s === 0 || s === 6 || s === 10))
    for (const c of chord) out.push({ voice: 'stab', semi: root + 12 + c });
  // Finale: a snare fill through the last beat of every 4-bar phrase.
  if (layers.fill && lastBarOfPhrase && s >= 12) out.push({ voice: 'snare', semi: 0 });
  return out;
}

export interface Music {
  /** Each frame: schedules the notes due in the next MUSIC_LOOKAHEAD_SEC. */
  update(s: MusicState): void;
  start(): void;
  /** Fades out (pause, finish); `start()` fades back in from the next beat. */
  stop(): void;
  /** A hit: muffle the music for a moment. */
  duck(): void;
}

export function createMusic(ctx: AudioContext, out: AudioNode, noise: AudioBuffer): Music {
  const master = ctx.createGain();
  master.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = T.MUSIC_FILTER_HZ[0];
  filter.Q.value = 0.7;
  master.connect(filter).connect(out);

  let playing = false;
  let step = 0;
  let nextAt = 0; // audio time of the next 16th step
  let tierHz: number = T.MUSIC_FILTER_HZ[0];
  const hz = (semi: number): number => 110 * 2 ** (semi / 12);

  const env = (g: GainNode, t0: number, peak: number, dur: number): void => {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  };
  const osc = (type: OscillatorType, f: number, t0: number, dur: number, peak: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    env(g, t0, peak, dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
    return o;
  };
  const hiss = (type: BiquadFilterType, f: number, t0: number, dur: number, peak: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bq = ctx.createBiquadFilter();
    bq.type = type;
    bq.frequency.value = f;
    const g = ctx.createGain();
    env(g, t0, peak, dur);
    src.connect(bq).connect(g).connect(master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  };

  const play = (n: Note, t0: number, stepSec: number): void => {
    switch (n.voice) {
      case 'kick': {
        const o = osc('sine', 150, t0, 0.28, 0.9);
        o.frequency.exponentialRampToValueAtTime(42, t0 + 0.12);
        break;
      }
      case 'hat':
        hiss('highpass', 7500, t0, 0.04, 0.18);
        break;
      case 'openHat':
        hiss('highpass', 6500, t0, 0.16, 0.16);
        break;
      case 'clap':
        hiss('bandpass', 1500, t0, 0.12, 0.45);
        hiss('bandpass', 1500, t0 + 0.012, 0.1, 0.3);
        break;
      case 'snare':
        hiss('bandpass', 2200, t0, 0.09, 0.35);
        osc('triangle', 190, t0, 0.07, 0.15);
        break;
      case 'bass': {
        const o = ctx.createOscillator();
        const lp = ctx.createBiquadFilter();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(hz(n.semi - 12), t0);
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(900, t0);
        lp.frequency.exponentialRampToValueAtTime(180, t0 + stepSec * 1.6);
        env(g, t0, 0.32, stepSec * 1.8);
        o.connect(lp).connect(g).connect(master);
        o.start(t0);
        o.stop(t0 + stepSec * 1.8 + 0.02);
        break;
      }
      case 'arp':
        osc('square', hz(n.semi), t0, stepSec * 0.9, 0.045);
        break;
      case 'stab':
        osc('sawtooth', hz(n.semi), t0, stepSec * 2.2, 0.05);
        break;
    }
  };

  return {
    start() {
      if (playing) return;
      playing = true;
      const now = ctx.currentTime;
      nextAt = now + 0.05;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.linearRampToValueAtTime(T.MUSIC_VOLUME, now + T.MUSIC_FADE_SEC);
    },
    stop() {
      if (!playing) return;
      playing = false;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + T.MUSIC_FADE_SEC);
    },
    duck() {
      const now = ctx.currentTime;
      filter.frequency.cancelScheduledValues(now);
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.exponentialRampToValueAtTime(tierHz, now + T.MUSIC_DUCK_SEC);
    },
    update(s) {
      if (!playing || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const target = T.MUSIC_FILTER_HZ[Math.min(3, s.finale ? 3 : s.tier)]!;
      if (target !== tierHz) {
        tierHz = target;
        filter.frequency.cancelScheduledValues(now);
        filter.frequency.setValueAtTime(filter.frequency.value, now);
        filter.frequency.exponentialRampToValueAtTime(target, now + 0.6);
      }
      // After a stall (hidden tab), skip the missed steps instead of playing them all at once.
      if (nextAt < now - 0.05) nextAt = now + 0.02;
      const stepSec = 60 / bpmFor(s) / 4;
      const layers = layersFor(s);
      while (nextAt < now + T.MUSIC_LOOKAHEAD_SEC) {
        for (const n of notesAt(step, layers)) play(n, nextAt, stepSec);
        step++;
        nextAt += stepSec;
      }
    },
  };
}
