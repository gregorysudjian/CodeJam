import type { Level, Spawn } from '@/contracts';
import type { Item } from './core';
import type { Verdict } from './judge';
import { colorKeyFor } from './obstacles';
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
  let playerX = 0;
  let jumpT = Infinity;
  let wasAirborne = false;
  let crouch = 1;

  const colorOf = (item: Item): string => {
    const v = verdicts.get(item);
    return v === 'hit' ? css(T.COLOR_HIT) : css(T.MOVE_COLOR[colorKeyFor(item.spawn.requires)]);
  };

  return {
    frame({ elapsed, visDt, state, phase }) {
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
          ({ item, z }) => z < T.VIEW_DISTANCE && z > -4 && !isGone(item.spawn, verdicts.get(item)),
        )
        .sort((a, b) => b.z - a.z);
      for (const { item, z } of visible) drawObject(item, z);

      // Runner.
      playerX += (state.lane * T.LANE_WIDTH - playerX) * (1 - Math.exp(-T.LANE_SLIDE_RATE * visDt));
      if (state.airborne && !wasAirborne) jumpT = 0;
      wasAirborne = state.airborne;
      jumpT += visDt;
      const p = jumpT / T.JUMP_VISUAL_SEC;
      const lift = p < 1 ? T.JUMP_HEIGHT * 4 * p * (1 - p) : 0;
      crouch +=
        ((state.ducking ? T.CROUCH_SCALE : 1) - crouch) * (1 - Math.exp(-T.CROUCH_RATE * visDt));
      const feet = project(playerX, lift, 0);
      const top = project(playerX, lift + 1.9 * crouch * RUNNER_SCALE, 0);
      const r = T.PLAYER_RADIUS * unit * RUNNER_SCALE;
      ctx.fillStyle = '#d9e1ec';
      ctx.beginPath();
      ctx.roundRect(feet.x - r, top.y, r * 2, feet.y - top.y, r);
      ctx.fill();
      ctx.strokeStyle = css(T.COLOR_LIME);
      ctx.lineWidth = r * 0.35;
      const shoulder = project(playerX, lift + 1.4 * crouch * RUNNER_SCALE, 0).y;
      for (const [side, up] of [
        [-1, state.leftArmUp],
        [1, state.rightArmUp],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(feet.x + side * r, shoulder);
        ctx.lineTo(feet.x + side * r * 1.8, up ? shoulder - r * 2.6 : shoulder + r * 2);
        ctx.stroke();
      }

      if (phase === 'paused') {
        ctx.fillStyle = `rgba(0, 0, 0, ${T.PAUSE_DIM})`;
        ctx.fillRect(0, 0, w, h);
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
          const len =
            (spawn.holdSec ?? 0) > 0
              ? track.distanceAt(item.wave.t + spawn.holdSec!) - track.distanceAt(item.wave.t)
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
      }
    },
    engage() {},
    verdict(item, v) {
      verdicts.set(item, v);
    },
    setQuality() {},
    showGhostOutcome() {}, // drawn in step (f)
    dispose() {},
  };
}

/** Smashed crates and collected orbs disappear; everything else stays visible as it passes. */
function isGone(spawn: Spawn, v: Verdict | undefined): boolean {
  return (spawn.kind === 'crate' && v === 'cleared') || (spawn.kind === 'orb' && v === 'collected');
}
