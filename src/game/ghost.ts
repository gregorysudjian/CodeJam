import type { InputState, Lane, Level } from '@/contracts';
import * as T from './tuning';

/**
 * Ghost runner, the pure part: record the player's moves, store them compactly, replay them,
 * and decide which run was better. Only game states are recorded (lane, airborne, ducking,
 * arms): no video and no landmarks, and nothing leaves the device (AGENTS.md rule 5).
 */

/** What the ghost shows at one moment. */
export interface GhostPose {
  lane: Lane;
  airborne: boolean;
  ducking: boolean;
  leftArmUp: boolean;
  rightArmUp: boolean;
}

/** How a run went, counted by the game itself (cleared + collected first, then fewer hits). */
export interface GhostResult {
  cleared: number;
  collected: number;
  hit: number;
}

/** One stored run. `samples` holds one base64 character (6 bits) per sample. */
export interface GhostRun {
  v: 1;
  fingerprint: string;
  hz: number;
  samples: string;
  result: GhostResult;
  savedAt: number; // Date.now()
}

export type GhostOutcome = 'beaten' | 'lost' | 'tie' | 'saved';

/** The end banner's text and colour, shared by the 3D and 2D views. */
export const OUTCOME_LABEL: Record<GhostOutcome, { text: string; color: number }> = {
  beaten: { text: 'GHOST BEATEN', color: T.COLOR_LIME },
  lost: { text: 'GHOST WINS', color: T.MOVE_COLOR.armsUp },
  tie: { text: 'TIE', color: T.GHOST_ACCENT },
  saved: { text: 'GHOST SAVED', color: T.GHOST_ACCENT },
};

/* ── Encoding: 6 bits per sample, exactly one base64 character ── */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALUE: Record<string, number> = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));

/** Bits 0-1: lane + 1 (0, 1, 2); bit 2: airborne; bit 3: ducking; bit 4: left arm; bit 5: right arm. */
export function encodePose(p: GhostPose): string {
  const v =
    (p.lane + 1) |
    (p.airborne ? 4 : 0) |
    (p.ducking ? 8 : 0) |
    (p.leftArmUp ? 16 : 0) |
    (p.rightArmUp ? 32 : 0);
  return ALPHABET[v]!;
}

/** Decodes one sample into `out` (no allocation). Unknown characters read as standing still. */
export function decodePose(c: string, out: GhostPose): GhostPose {
  const v = VALUE[c] ?? 1; // 1 = centre lane, nothing raised
  const lane = (v & 3) - 1;
  out.lane = (lane < -1 || lane > 1 ? 0 : lane) as Lane;
  out.airborne = (v & 4) !== 0;
  out.ducking = (v & 8) !== 0;
  out.leftArmUp = (v & 16) !== 0;
  out.rightArmUp = (v & 32) !== 0;
  return out;
}

export const neutralPose = (): GhostPose => ({
  lane: 0,
  airborne: false,
  ducking: false,
  leftArmUp: false,
  rightArmUp: false,
});

/* ── Recording and playback ── */

export interface GhostRecorder {
  /** Feed one running frame (game time and polled input). Fills every tick up to `elapsed`. */
  sample(elapsed: number, state: InputState): void;
  readonly samples: string;
}

export function createGhostRecorder(hz: number = T.GHOST_HZ): GhostRecorder {
  const chars: string[] = [];
  return {
    sample(elapsed, state) {
      // Slow frames repeat the current state, so tick k always holds the state at k / hz.
      if (elapsed * hz + 1e-9 < chars.length) return;
      const c = encodePose(state);
      while (chars.length <= elapsed * hz + 1e-9) chars.push(c);
    },
    get samples() {
      return chars.join('');
    },
  };
}

/** The ghost's pose at game time `elapsed`, written into `out`. Clamped at both ends. */
export function ghostPoseAt(
  samples: string,
  hz: number,
  elapsed: number,
  out: GhostPose,
): GhostPose {
  if (samples.length === 0) return Object.assign(out, neutralPose());
  const k = Math.min(samples.length - 1, Math.max(0, Math.floor(elapsed * hz + 1e-9)));
  return decodePose(samples[k]!, out);
}

/* ── Level identity and ranking ── */

/**
 * Identity of a level: duration, mode and every wave (time, kinds, lanes, holds). A ghost only
 * replays on the identical level, so a changed generator or seed never shows a wrong ghost.
 * Two 32-bit FNV-1a hashes with different bases, as 16 hex characters.
 */
export function levelFingerprint(level: Level): string {
  const text = [
    level.config.durationSec,
    level.config.mode,
    ...level.waves.map(
      (w) =>
        `${w.t.toFixed(2)}:${w.spawns.map((s) => `${s.kind}/${s.lanes.join('.')}/${s.holdSec ?? 0}`).join('+')}`,
    ),
  ].join('|');
  return fnv1a(text, 0x811c9dc5) + fnv1a(text, 0x01000193);
}

function fnv1a(text: string, basis: number): string {
  let h = basis >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const score = (r: GhostResult): number => r.cleared + r.collected;

/** True when `a` is a better run than `b` (no `b` counts as worse). A tie is not better. */
export function isBetter(a: GhostResult, b: GhostResult | null | undefined): boolean {
  if (!b) return true;
  return score(a) !== score(b) ? score(a) > score(b) : a.hit < b.hit;
}

/** The end banner: this run against the ghost it raced. */
export function compareRuns(run: GhostResult, ghost: GhostResult): Exclude<GhostOutcome, 'saved'> {
  if (isBetter(run, ghost)) return 'beaten';
  if (isBetter(ghost, run)) return 'lost';
  return 'tie';
}

/* ── Parsing stored data (anything malformed is treated as no ghost) ── */

const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;

export function parseGhost(json: string | null, fingerprint: string): GhostRun | null {
  if (!json) return null;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const r = data as Partial<GhostRun>;
  const res = r.result as Partial<GhostResult> | undefined;
  const ok =
    r.v === 1 &&
    r.fingerprint === fingerprint &&
    typeof r.hz === 'number' &&
    r.hz > 0 &&
    r.hz <= 120 &&
    typeof r.samples === 'string' &&
    r.samples.length > 0 &&
    r.samples.length <= T.GHOST_MAX_SAMPLES &&
    [...r.samples].every((c) => c in VALUE) &&
    !!res &&
    isCount(res.cleared) &&
    isCount(res.collected) &&
    isCount(res.hit) &&
    typeof r.savedAt === 'number';
  return ok ? (r as GhostRun) : null;
}
