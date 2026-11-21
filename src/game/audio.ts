import type { MoveType } from '@/contracts';
import * as T from './tuning';

/**
 * Game sound effects, synthesised with Web Audio: no files to download, no package.
 * Each move has its own pitch, so a cue also tells the player which move is coming.
 * Muted with `?mute=1` or localStorage `game.muted = '1'`. Never throws: without audio
 * support every call is a no-op.
 */
export interface GameAudio {
  resume(): void;
  cue(move: MoveType): void;
  cleared(move: MoveType): void;
  collected(): void;
  smash(): void;
  hit(): void;
  /** Quiet confirmations that the camera saw a move (lane change, jump, squat, arm up). */
  saw(move: 'step' | 'hop' | 'duck' | 'raise'): void;
  /** The streak reached a new tier (5, 10, 20). */
  levelUp(tier: number): void;
  finish(): void;
  dispose(): void;
}

const NOTE: Record<MoveType, number> = {
  sidestep: 0, // semitones above T.AUDIO_BASE_HZ
  jump: 7,
  squat: -5,
  armsUp: 12,
  reachLeft: 4,
  reachRight: 9,
};
const hz = (semitones: number): number => T.AUDIO_BASE_HZ * 2 ** (semitones / 12);

function isMuted(): boolean {
  try {
    return (
      new URLSearchParams(window.location.search).get('mute') === '1' ||
      window.localStorage.getItem('game.muted') === '1'
    );
  } catch {
    return false;
  }
}

const silent: GameAudio = {
  resume() {},
  cue() {},
  cleared() {},
  collected() {},
  smash() {},
  hit() {},
  saw() {},
  levelUp() {},
  finish() {},
  dispose() {},
};

export function createGameAudio(): GameAudio {
  if (isMuted() || typeof AudioContext === 'undefined') return silent;
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return silent;
  }
  const master = ctx.createGain();
  master.gain.value = T.AUDIO_VOLUME;
  master.connect(ctx.destination);

  // One second of white noise, reused by every noisy sound.
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const tone = (
    type: OscillatorType,
    from: number,
    to: number,
    start: number,
    dur: number,
    peak: number,
  ): void => {
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  const burst = (filter: BiquadFilterType, freq: number, dur: number, peak: number): void => {
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  };

  const lastSaw = new Map<string, number>();
  const play = (fn: () => void): void => {
    if (ctx.state === 'closed') return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    try {
      fn();
    } catch {
      // a sound must never break the game loop
    }
  };

  return {
    resume() {
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    },
    cue(move) {
      play(() => {
        const f = hz(NOTE[move]);
        tone('sine', f, f, 0, 0.09, 0.25);
        tone('sine', f, f, 0.12, 0.09, 0.18);
      });
    },
    cleared(move) {
      play(() => {
        const f = hz(NOTE[move] + 12);
        tone('triangle', f, f * 1.5, 0, 0.16, 0.35);
        tone('sine', f * 2, f * 2, 0.06, 0.12, 0.12);
      });
    },
    collected() {
      play(() => {
        [0, 4, 7, 12].forEach((s, i) => tone('sine', hz(24 + s), hz(24 + s), i * 0.045, 0.14, 0.2));
      });
    },
    smash() {
      play(() => {
        burst('bandpass', 1800, 0.25, 0.6);
        tone('square', 220, 60, 0, 0.18, 0.12);
      });
    },
    hit() {
      play(() => {
        burst('lowpass', 500, 0.3, 0.8);
        tone('sawtooth', 160, 45, 0, 0.32, 0.3);
      });
    },
    saw(move) {
      // Rate-limited so a jittery camera cannot turn it into a buzz.
      const now = ctx.currentTime;
      if (now - (lastSaw.get(move) ?? -1) < T.SAW_MIN_GAP_SEC) return;
      lastSaw.set(move, now);
      play(() => {
        const q = T.SAW_VOLUME;
        if (move === 'step') burst('bandpass', 900, 0.12, 0.35 * q);
        else if (move === 'hop') tone('sine', 300, 700, 0, 0.12, 0.35 * q);
        else if (move === 'duck') tone('sine', 240, 110, 0, 0.14, 0.4 * q);
        else tone('triangle', hz(19), hz(24), 0, 0.1, 0.25 * q);
      });
    },
    levelUp(tier) {
      play(() => {
        const root = 12 + tier * 2;
        [0, 4, 7, 12, 16].forEach((st, i) =>
          tone('triangle', hz(root + st), hz(root + st), i * 0.06, 0.18, 0.28),
        );
      });
    },
    finish() {
      play(() => {
        [0, 4, 7].forEach((st, i) =>
          tone('triangle', hz(12 + st), hz(12 + st), i * 0.12, 0.2, 0.3),
        );
        tone('triangle', hz(24), hz(24), 0.36, 0.6, 0.35);
        tone('sine', hz(12), hz(12), 0.36, 0.6, 0.2);
      });
    },
    dispose() {
      // Close after the tail of the last sounds: the app unmounts the game on 'finished',
      // and closing at once would cut the finish fanfare.
      setTimeout(() => {
        if (ctx.state !== 'closed') void ctx.close().catch(() => {});
      }, T.AUDIO_CLOSE_DELAY_MS);
    },
  };
}
