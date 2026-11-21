import type { MoveType } from '@/contracts';
import { createMusic, type Music } from './music';
import * as L from './look';
import * as T from './tuning';

const S = L.SFX; // each effect's level (look.ts)

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
  /** Intro countdown: 3, 2, 1, then 0 for GO. */
  count(n: number): void;
  /** A PERFECT clear: a short bright sparkle on top of the clear sound. */
  perfect(): void;
  /** The beat (music.ts): start or fade it out, and feed it the round's state every frame. */
  music: Pick<Music, 'start' | 'stop' | 'update'>;
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

/** `?music=off` or localStorage 'game.music' = 'off': effects only. */
function musicOff(): boolean {
  try {
    return (
      (new URLSearchParams(window.location.search).get('music') ??
        window.localStorage.getItem('game.music')) === 'off'
    );
  } catch {
    return false;
  }
}

const noMusic: GameAudio['music'] = { start() {}, stop() {}, update() {} };
const silent: GameAudio = {
  resume() {},
  cue() {},
  cleared() {},
  collected() {},
  smash() {},
  hit() {},
  saw() {},
  levelUp() {},
  count() {},
  perfect() {},
  music: noMusic,
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
  // A limiter on the master bus: a pile-up of effects and music never clips (look.ts LIMITER).
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = L.LIMITER.thresholdDb;
  limiter.knee.value = L.LIMITER.kneeDb;
  limiter.ratio.value = L.LIMITER.ratio;
  limiter.attack.value = L.LIMITER.attackSec;
  limiter.release.value = L.LIMITER.releaseSec;
  master.connect(limiter).connect(ctx.destination);

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
  // Before the page's first gesture Chrome keeps the context suspended and logs a warning for
  // each resume() call (the game called it every frame: about 60 a second). So: resume in the
  // gesture itself, and otherwise try at most every L.AUDIO_WAKE_GAP_MS.
  let lastWake = -Infinity;
  const wake = (): void => {
    if (ctx.state !== 'suspended') return;
    const now = performance.now();
    if (now - lastWake < L.AUDIO_WAKE_GAP_MS) return;
    lastWake = now;
    void ctx.resume().catch(() => {});
  };
  const onGesture = (): void => {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  };
  const GESTURES = ['keydown', 'pointerdown'] as const;
  for (const g of GESTURES) window.addEventListener(g, onGesture, true);
  const guard = (fn: () => void): void => {
    if (ctx.state === 'closed') return;
    try {
      fn();
    } catch {
      // a sound must never break the game loop
    }
  };
  const play = (fn: () => void): void => {
    wake();
    guard(fn);
  };
  const musicGain = ctx.createGain();
  musicGain.connect(master);
  const beat = musicOff() ? null : createMusic(ctx, musicGain, noise);
  const music: GameAudio['music'] = beat
    ? {
        // Called every frame (start while running, stop otherwise): never a resume attempt.
        start: () => guard(() => beat.start()),
        stop: () => guard(() => beat.stop()),
        update: (s) => {
          if (ctx.state !== 'running') return;
          try {
            beat.update(s);
          } catch {
            // never break the game loop
          }
        },
      }
    : noMusic;

  return {
    resume() {
      wake();
    },
    cue(move) {
      play(() => {
        const f = hz(NOTE[move]);
        tone('sine', f, f, 0, 0.09, S.cue);
        tone('sine', f, f, 0.12, 0.09, S.cue * 0.72);
      });
    },
    cleared(move) {
      play(() => {
        const f = hz(NOTE[move] + 12);
        tone('triangle', f, f * 1.5, 0, 0.16, S.cleared);
        tone('sine', f * 2, f * 2, 0.06, 0.12, S.cleared * 0.34);
      });
    },
    collected() {
      play(() => {
        [0, 4, 7, 12].forEach((s, i) =>
          tone('sine', hz(24 + s), hz(24 + s), i * 0.045, 0.14, S.collected),
        );
      });
    },
    smash() {
      play(() => {
        burst('bandpass', 1800, 0.25, S.smash);
        tone('square', 220, 60, 0, 0.18, S.smash * 0.2);
      });
    },
    hit() {
      play(() => {
        burst('lowpass', 500, 0.3, S.hit);
        tone('sawtooth', 160, 45, 0, 0.32, S.hit * 0.38);
        beat?.duck();
      });
    },
    count(n) {
      play(() => {
        if (n > 0) {
          tone('triangle', hz(12), hz(12), 0, 0.16, S.count);
        } else {
          tone('triangle', hz(24), hz(24), 0, 0.35, S.go);
          tone('sine', hz(19), hz(19), 0, 0.35, S.go * 0.5);
        }
      });
    },
    perfect() {
      play(() => {
        tone('sine', hz(31), hz(36), 0.04, 0.1, S.perfect);
      });
    },
    music,
    saw(move) {
      // Rate-limited so a jittery camera cannot turn it into a buzz.
      const now = ctx.currentTime;
      if (now - (lastSaw.get(move) ?? -1) < T.SAW_MIN_GAP_SEC) return;
      lastSaw.set(move, now);
      play(() => {
        const q = S.saw;
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
          tone('triangle', hz(root + st), hz(root + st), i * 0.06, 0.18, S.levelUp),
        );
      });
    },
    finish() {
      play(() => {
        beat?.stop();
        [0, 4, 7].forEach((st, i) =>
          tone('triangle', hz(12 + st), hz(12 + st), i * 0.12, 0.2, S.finish * 0.86),
        );
        tone('triangle', hz(24), hz(24), 0.36, 0.6, S.finish);
        tone('sine', hz(12), hz(12), 0.36, 0.6, S.finish * 0.57);
      });
    },
    dispose() {
      for (const g of GESTURES) window.removeEventListener(g, onGesture, true);
      // A round left mid-beat (K, END ROUND) fades the music out instead of cutting it.
      guard(() => beat?.stop());
      // Close after the tail of the last sounds: the app unmounts the game on 'finished',
      // and closing at once would cut the finish fanfare.
      setTimeout(() => {
        if (ctx.state !== 'closed') void ctx.close().catch(() => {});
      }, T.AUDIO_CLOSE_DELAY_MS);
    },
  };
}
