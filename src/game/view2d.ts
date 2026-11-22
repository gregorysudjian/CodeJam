import type { Level, Spawn } from '@/contracts';
import type { Item } from './core';
import { comboLabel, GRADE_LABEL, type Grade } from './feedback';
import { countdownAt, resumeCountAt } from './intro';
import { OUTCOME_LABEL, raceLabel, racePulse, type GhostOutcome, type GhostPose } from './ghost';
import { GLYPH, paintGlyph } from './glyph';
import type { Verdict } from './judge';
import * as LK from './look';
import { colorKeyFor } from './obstacles';
import { endBannerBox, LABEL_ASPECT, raceBox, type PixelBox } from './overlay';
import { createTrack } from './timeline';
import * as T from './tuning';
import type { GameView } from './view3d';

/**
 * Fallback when WebGL is unavailable (GPU blocklisted, driver crash): the same track drawn
 * with Canvas 2D in simple perspective. The rules and events are identical because they
 * live in core.ts. If even a 2D context is unavailable it draws nothing and the round,
 * events and HUD still work.
 */
const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;
const NEAR = 16; // perspective: scale = NEAR / (NEAR + z); larger is flatter
const RUNNER_SCALE = 0.75; // the runner is drawn smaller so it never hides the track

export function create2DView(
  canvas: HTMLCanvasElement,
  level: Level,
  items: readonly Item[],
  /** Seconds each object is drawn ahead of the judging clock, by move (latency compensation). */
  leads: T.Leads,
): GameView {
  const ctx = canvas.getContext('2d');
  const track = createTrack(level.waves, level.config.durationSec);
  const verdicts = new Map<Item, Verdict>();
  const playerMotion = newMotion();
  const ghostMotion = newMotion();
  let outcome: GhostOutcome | null = null;
  let raceShown: number | null = null;
  let raceChangedT = Infinity; // seconds since the lead last changed (chip pop)
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let gradeShown: Grade | null = null;
  let gradeT = Infinity;
  const box: PixelBox = { cx: 0, cy: 0, h: 0 }; // reused by the screen-space plates

  const colorOf = (item: Item): string => {
    const v = verdicts.get(item);
    return v === 'hit' ? css(T.COLOR_HIT) : css(T.MOVE_COLOR[colorKeyFor(item.spawn.requires)]);
  };

  return {
    frame({ elapsed, visDt, realDt, state, phase, streak, intro, resumeIn, ghost, race }) {
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, T.MAX_PIXEL_RATIO);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const horizon = h * 0.32;
      const groundY = h * 0.92;
      const laneW = Math.min(w / 4, h * 0.32);
      const unit = laneW / T.LANE_WIDTH; // pixels per world unit at the player
      const project = (x: number, y: number, z: number) => {
        const s = NEAR / (NEAR + Math.max(-NEAR * 0.8, z));
        return { x: w / 2 + x * unit * s, y: horizon + (groundY - horizon) * s - y * unit * s, s };
      };

      ctx.fillStyle = css(T.COLOR_BG);
      ctx.fillRect(0, 0, w, h);

      // Floor lines scrolling toward the player, then the lime lane lines.
      const distance = track.distanceAt(elapsed);
      ctx.strokeStyle = css(T.COLOR_GRID);
      ctx.lineWidth = 1;
      for (let k = 0; k < 30; k++) {
        const z = k * T.GRID_TILE - (distance % T.GRID_TILE);
        const a = project(-1.5 * T.LANE_WIDTH, 0, z);
        const b = project(1.5 * T.LANE_WIDTH, 0, z);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.strokeStyle = css(T.COLOR_LIME);
      for (const lx of [-1.5, -0.5, 0.5, 1.5]) {
        const a = project(lx * T.LANE_WIDTH, 0, -2);
        const b = project(lx * T.LANE_WIDTH, 0, T.VIEW_DISTANCE);
        ctx.lineWidth = Math.abs(lx) > 1 ? 3 : 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Objects, far to near.
      const lead = leads(); // read per frame: K can switch input mid-round
      const visible = items
        .map((item) => ({
          item,
          z: track.distanceAt(item.wave.t) - track.distanceAt(elapsed + lead[item.spawn.requires]),
        }))
        .filter(
          ({ item, z }) =>
            z < T.VIEW_DISTANCE && z > -4 && !isGone(item.spawn, verdicts.get(item), z),
        )
        .sort((a, b) => b.z - a.z);
      for (const { item, z } of visible) drawObject(item, z);

      // Runners: the ghost (if any) first, as a silver outline behind the player (as in 3D).
      const drawRunner = (m: Motion, pose: RunnerPose, isGhost: boolean): void => {
        const lift = stepMotion(m, pose, visDt);
        const size = RUNNER_SCALE * (isGhost ? T.GHOST_SCALE : 1);
        const feet = project(m.x, lift, 0);
        const top = project(m.x, lift + 1.9 * m.crouch * size, 0);
        const r = T.PLAYER_RADIUS * unit * size;
        ctx.beginPath();
        ctx.roundRect(feet.x - r, top.y, r * 2, feet.y - top.y, r);
        if (isGhost) {
          ctx.globalAlpha = LK.GHOST_ACCENT_OPACITY;
          ctx.strokeStyle = css(LK.GHOST_ACCENT);
          ctx.lineWidth = r * 0.25;
          ctx.stroke();
        } else {
          ctx.fillStyle = '#d9e1ec';
          ctx.fill();
        }
        ctx.strokeStyle = css(isGhost ? LK.GHOST_ACCENT : T.COLOR_LIME);
        ctx.lineWidth = r * 0.35;
        const shoulder = project(m.x, lift + 1.4 * m.crouch * size, 0).y;
        for (const [side, up] of [
          [-1, pose.leftArmUp],
          [1, pose.rightArmUp],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(feet.x + side * r, shoulder);
          ctx.lineTo(feet.x + side * r * 1.8, up ? shoulder - r * 2.6 : shoulder + r * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      };
      if (ghost) drawRunner(ghostMotion, ghost, true);
      drawRunner(playerMotion, state, false);

      if (phase === 'paused' && resumeIn === null) {
        ctx.fillStyle = `rgba(0, 0, 0, ${T.PAUSE_DIM})`;
        ctx.fillRect(0, 0, w, h);
      }
      raceChangedT += realDt;
      if (race !== null && race !== raceShown) {
        if (raceShown !== null) raceChangedT = 0; // not the first draw: the lead changed
        raceShown = race;
      }
      /** A plate with a word, at a box from overlay.ts (CSS pixels, so scaled by dpr here). */
      const plate = (b: PixelBox, text: string, color: number): void => {
        const ch = b.h * dpr;
        if (!(ch >= 1)) return; // no room (a canvas without layout): roundRect throws below 0
        const cw = ch / LABEL_ASPECT;
        const cx = b.cx * dpr;
        const cy = b.cy * dpr;
        ctx.fillStyle = 'rgba(7, 9, 13, 0.75)';
        ctx.strokeStyle = css(color);
        ctx.lineWidth = Math.max(2, ch * 0.045);
        ctx.beginPath();
        ctx.roundRect(cx - cw / 2, cy - ch / 2, cw, ch, ch * 0.22);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = css(color);
        ctx.font = `italic 800 ${Math.round(ch * 0.56)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, cx, cy + ch * 0.03);
      };
      const cssW = w / dpr;
      const cssH = h / dpr;
      if (race !== null) {
        // Bottom right, as in 3D: top centre sat on GameHud's progress bar and move cue.
        const { text, color } = raceLabel(race);
        const pop = 1 + (reduceMotion ? 0 : racePulse(raceChangedT));
        plate(raceBox(cssW, cssH, pop, box), text, color);
      }
      // Countdown, timing grade, combo: the same words as in 3D, as plain text.
      const label = (s: string, color: number, x: number, y: number, size: number): void => {
        ctx.font = `italic 800 ${Math.round(size)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = size * 0.12;
        ctx.strokeStyle = 'rgba(7, 9, 13, 0.85)';
        ctx.strokeText(s, x, y);
        ctx.fillStyle = css(color);
        ctx.fillText(s, x, y);
      };
      const count = resumeCountAt(resumeIn) ?? countdownAt(intro);
      if (count) label(count, count === 'GO' ? T.COLOR_LIME : 0xf4f7fb, w / 2, h * 0.45, h * 0.16);
      const runner = project(playerMotion.x, 0, 0);
      gradeT += realDt;
      if (gradeShown && gradeT < T.GRADE_SEC) {
        ctx.globalAlpha = Math.min(1, (1 - gradeT / T.GRADE_SEC) * 3);
        const side = playerMotion.x > 0.1 ? -1 : 1;
        const g = GRADE_LABEL[gradeShown];
        label(g.text, g.color, runner.x + side * laneW * 0.8, runner.y - laneW * 0.9, h * 0.055);
        ctx.globalAlpha = 1;
      }
      const combo = phase === 'running' || phase === 'paused' ? comboLabel(streak) : null;
      if (combo)
        label(
          combo,
          T.MOVE_COLOR.squat,
          runner.x,
          Math.min(h * 0.97, runner.y + h * 0.04),
          h * 0.035,
        );

      if (outcome) {
        // In the middle under GameHud's plates, as in 3D (it sat on the score plate).
        const { text, color } = OUTCOME_LABEL[outcome];
        plate(endBannerBox(cssW, cssH, 1, box), text, color);
      }

      function drawObject(item: Item, z: number): void {
        const { spawn } = item;
        ctx!.fillStyle = colorOf(item);
        ctx!.globalAlpha = 0.85;
        const box = (x0: number, x1: number, y0: number, y1: number, zz: number) => {
          const a = project(x0, y1, zz);
          const b = project(x1, y0, zz);
          ctx!.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        };
        const half = 1.5 * T.LANE_WIDTH;
        if (spawn.kind === 'block') {
          for (const l of spawn.lanes)
            box((l - 0.43) * T.LANE_WIDTH, (l + 0.43) * T.LANE_WIDTH, 0, T.BLOCK_HEIGHT, z);
        } else if (spawn.kind === 'hurdle') {
          box(-half, half, T.HURDLE_HEIGHT - 0.12, T.HURDLE_HEIGHT, z);
        } else if (spawn.kind === 'beam') {
          // As in 3D: the back end of a held beam passes the runner at t + holdSec.
          const hold = spawn.holdSec ?? 0;
          const len =
            hold > 0
              ? track.distanceAt(item.wave.t + hold + lead[spawn.requires]) -
                track.distanceAt(item.wave.t)
              : 0;
          for (let zz = z + len; zz >= z; zz -= Math.max(2.5, len || 1))
            box(-half, half, T.BEAM_HEIGHT, T.BEAM_HEIGHT + 0.4, zz);
          box(-half, half, T.BEAM_HEIGHT, T.BEAM_HEIGHT + 0.45, z);
        } else if (spawn.kind === 'crate') {
          box(-half, half, 0, T.CRATE_HEIGHT, z);
        } else {
          for (const l of spawn.lanes) {
            const c = project(l * T.LANE_WIDTH, T.ORB_HEIGHT, z);
            ctx!.beginPath();
            ctx!.arc(c.x, c.y, T.ORB_RADIUS * unit * c.s, 0, Math.PI * 2);
            ctx!.fill();
          }
        }
        ctx!.globalAlpha = 1;
        // The move icon, as in 3D (glyph.ts); a block's sits over its free lane. As in 3D it
        // goes once the object is cleared or past the runner: a block's icon over the free lane
        // passed right over the runner who had just stepped into it.
        const glyph = GLYPH[spawn.kind];
        const v = verdicts.get(item);
        if (glyph && spawn.kind !== 'orb' && v !== 'cleared' && z > -LK.ICON_HIDE_PAST) {
          const lane = spawn.kind === 'block' ? freeLane(spawn) : 0;
          const c = project(lane * T.LANE_WIDTH, T.ICON_HEIGHT[spawn.kind], z);
          const r = (T.ICON_SIZE / 2) * unit * c.s;
          if (r >= 4) paintGlyph(ctx!, glyph, colorOf(item), c.x, c.y, r);
        }
      }
    },
    setInput() {},
    engage() {},
    verdict(item, v, grade) {
      verdicts.set(item, v);
      if (grade) {
        gradeShown = grade;
        gradeT = 0;
      } else if (v === 'hit') gradeT = Infinity;
    },
    milestone() {},
    setQuality() {},
    showGhostOutcome(o) {
      outcome ??= o;
    },
    dispose() {},
  };
}

/** The lane a block leaves open. */
const freeLane = (spawn: Spawn): number =>
  [-1, 0, 1].find((l) => !spawn.lanes.includes(l as -1 | 0 | 1)) ?? 0;

/**
 * Smashed crates and collected orbs disappear, and as in 3D a hit object or missed orb goes
 * once it is MISSED_HIDE_PAST behind the runner (`z` is its distance ahead).
 */
function isGone(spawn: Spawn, v: Verdict | undefined, z: number): boolean {
  if ((v === 'hit' || v === 'missed') && z < -LK.MISSED_HIDE_PAST) return true;
  return (spawn.kind === 'crate' && v === 'cleared') || (spawn.kind === 'orb' && v === 'collected');
}

/** Lane slide, jump arc and crouch of a 2D runner (the player or the ghost). */
interface Motion {
  x: number;
  jumpT: number;
  wasAirborne: boolean;
  crouch: number;
}
type RunnerPose = Pick<GhostPose, 'lane' | 'airborne' | 'ducking' | 'leftArmUp' | 'rightArmUp'>;

const newMotion = (): Motion => ({ x: 0, jumpT: Infinity, wasAirborne: false, crouch: 1 });

/** Advances the motion by `dt` toward `pose`; returns the jump height. */
function stepMotion(m: Motion, pose: RunnerPose, dt: number): number {
  m.x += (pose.lane * T.LANE_WIDTH - m.x) * (1 - Math.exp(-T.LANE_SLIDE_RATE * dt));
  if (pose.airborne && !m.wasAirborne) m.jumpT = 0;
  m.wasAirborne = pose.airborne;
  m.jumpT += dt;
  const p = m.jumpT / T.JUMP_VISUAL_SEC;
  m.crouch +=
    ((pose.ducking ? T.CROUCH_SCALE : 1) - m.crouch) * (1 - Math.exp(-T.CROUCH_RATE * dt));
  return p < 1 ? T.JUMP_HEIGHT * 4 * p * (1 - p) : 0;
}
