// Owner: B. STUB — a 2D canvas stand-in for the Three.js runner, so the flow is playable.
// Follows the collision windows in docs/CONTRACTS.md. Replace with the real game.
import type { Game, GameEvent, InputSource, InputState, Level, Spawn } from '@/contracts';

const CUE_SEC = 2;
const WINDOW_BEFORE = 0.35;
const WINDOW_AFTER = 0.15;

function satisfied(spawn: Spawn, s: InputState, treadmill: boolean): boolean {
  switch (spawn.kind) {
    case 'block':
      return !spawn.lanes.includes(s.lane);
    case 'hurdle':
      return s.airborne;
    case 'beam':
      return s.ducking;
    case 'crate':
      return s.leftArmUp && s.rightArmUp;
    case 'orb': {
      const lane = spawn.lanes[0];
      if (!treadmill) return s.lane === lane && (s.leftArmUp || s.rightArmUp);
      if (lane === -1) return s.leftArmUp;
      if (lane === 1) return s.rightArmUp;
      return s.leftArmUp && s.rightArmUp;
    }
  }
}

const COLORS: Record<Spawn['kind'], string> = {
  block: '#ef4444',
  hurdle: '#f59e0b',
  beam: '#3b82f6',
  crate: '#a855f7',
  orb: '#22c55e',
};

export function createGame(canvas: HTMLCanvasElement, level: Level, input: InputSource): Game {
  const ctx = canvas.getContext('2d')!;
  const listeners = new Set<(e: GameEvent) => void>();
  const emit = (e: GameEvent) => listeners.forEach((cb) => cb(e));
  const treadmill = level.config.mode === 'treadmill';
  const duration = level.config.durationSec;

  // Per spawn: whether its required state was seen inside the window, and whether it is resolved.
  const cued = new Set<number>();
  const ok = level.waves.map((w) => w.spawns.map(() => false));
  const done = level.waves.map(() => false);

  let elapsed = 0;
  let last = 0;
  let raf = 0;
  let running = false;
  let finished = false;

  const step = (now: number) => {
    if (!running) return;
    elapsed += Math.min(0.1, (now - last) / 1000);
    last = now;
    const s = input.getState();

    level.waves.forEach((wave, i) => {
      if (!cued.has(i) && elapsed >= wave.t - CUE_SEC) {
        cued.add(i);
        emit({ type: 'cue', wave, inSec: wave.t - elapsed });
      }
      if (done[i]) return;
      if (elapsed >= wave.t - WINDOW_BEFORE) {
        wave.spawns.forEach((sp, j) => {
          if (satisfied(sp, s, treadmill)) ok[i][j] = true;
        });
      }
      if (elapsed >= wave.t + WINDOW_AFTER) {
        done[i] = true;
        wave.spawns.forEach((sp, j) => {
          const t = performance.now();
          if (sp.kind === 'orb') {
            if (ok[i][j]) emit({ type: 'collected', spawn: sp, t });
          } else {
            emit({ type: ok[i][j] ? 'cleared' : 'hit', spawn: sp, t });
          }
        });
      }
    });

    draw(s);
    if (elapsed >= duration && !finished) {
      finished = true;
      running = false;
      emit({ type: 'finished' });
      return;
    }
    raf = requestAnimationFrame(step);
  };

  const draw = (s: InputState) => {
    const { width: w, height: h } = canvas;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);
    const laneW = w / 3;
    ctx.strokeStyle = '#333';
    for (let l = 1; l < 3; l++) {
      ctx.beginPath();
      ctx.moveTo(l * laneW, 0);
      ctx.lineTo(l * laneW, h);
      ctx.stroke();
    }
    const playerY = h * 0.85;
    const pxPerSec = (playerY - 0) / CUE_SEC;
    level.waves.forEach((wave, i) => {
      if (done[i]) return;
      const y = playerY - (wave.t - elapsed) * pxPerSec;
      if (y < -40) return;
      wave.spawns.forEach((sp) => {
        ctx.fillStyle = COLORS[sp.kind];
        sp.lanes.forEach((lane) => ctx.fillRect((lane + 1) * laneW + 8, y - 12, laneW - 16, 24));
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(sp.requires.toUpperCase(), (sp.lanes[0] + 1) * laneW + 14, y + 5);
      });
    });
    const size = s.ducking ? 24 : 48;
    const lift = s.airborne ? 30 : 0;
    ctx.fillStyle = s.leftArmUp || s.rightArmUp ? '#facc15' : '#e5e5e5';
    ctx.fillRect((s.lane + 1) * laneW + laneW / 2 - 24, playerY - size - lift, 48, size);
  };

  return {
    start() {
      if (running || finished) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(step);
    },
    pause() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      emit({ type: 'paused', reason: 'user' });
    },
    resume() {
      if (running || finished) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(step);
      emit({ type: 'resumed' });
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      listeners.clear();
    },
    getElapsedSec: () => elapsed,
    onEvent(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
