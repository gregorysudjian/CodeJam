import type { Game, InputSource, Level } from '@/contracts';
import { createGameAudio } from './audio';
import { createCore, feverTier, movesSeen } from './core';
import * as T from './tuning';
import { create2DView } from './view2d';
import { create3DView, type GameView, type Phase } from './view3d';

/**
 * The runner. Owns its requestAnimationFrame loop; nothing here touches React.
 * Rules live in core.ts, pictures in view3d.ts (or view2d.ts when WebGL is unavailable),
 * sounds in audio.ts. The scene renders from creation (so it shows behind a countdown);
 * game time only advances after start() and while not paused. The app owns input.start()/stop().
 */
export function createGame(canvas: HTMLCanvasElement, level: Level, input: InputSource): Game {
  const audio = createGameAudio();
  let view: GameView | null = null;
  const core = createCore(level, {
    cue: (wave) => {
      if (wave.spawns[0]) audio.cue(wave.spawns[0].requires);
    },
    engage: (item) => {
      if (item.spawn.kind === 'crate') audio.smash();
      view?.engage(item);
    },
    verdict: (item, v) => {
      if (v === 'cleared') audio.cleared(item.spawn.requires);
      else if (v === 'collected') audio.collected();
      else if (v === 'hit') audio.hit();
      view?.verdict(item, v);
    },
  });

  core.onEvent((e) => {
    if (e.type === 'finished') audio.finish();
  });

  const gfx = readGfxSetting();
  view = gfx === '2d' ? null : tryCreate3D(canvas, level, core.items);
  view ??= create2DView(canvas, level, core.items);
  if (gfx === 'low') view.setLowGraphics(true);
  // Auto low graphics: measured over real frame times while the round runs.
  let autoGfx = gfx === 'auto';
  let fpsFrames = 0;
  let fpsTime = 0;

  let destroyed = false;
  let last = performance.now();
  let raf = 0;
  let prevState = input.getState();
  let lastTier = 0;

  function frame(now: number): void {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const realDt = Math.max(0, (now - last) / 1000);
    last = now;
    const state = input.getState(); // polled once per frame
    core.step(realDt, state, now);

    const running = core.started() && !core.finished() && core.pauseReason() === null;
    if (running && autoGfx) {
      fpsTime += realDt;
      fpsFrames++;
      if (fpsTime < T.AUTO_LOW_GFX_SKIP_SEC) {
        fpsFrames = 0; // ignore start-up frames
      } else if (fpsTime > T.AUTO_LOW_GFX_SKIP_SEC + T.AUTO_LOW_GFX_WINDOW_SEC) {
        const fps = fpsFrames / (fpsTime - T.AUTO_LOW_GFX_SKIP_SEC);
        if (fps < T.AUTO_LOW_GFX_FPS) {
          view!.setLowGraphics(true);
          autoGfx = false;
          console.info(`[game] ${fps.toFixed(0)} fps: switched to low graphics`);
        }
        fpsTime = T.AUTO_LOW_GFX_SKIP_SEC; // fresh window
        fpsFrames = 0;
      }
    }

    const phase: Phase = core.finished()
      ? 'finished'
      : core.pauseReason()
        ? 'paused'
        : core.started()
          ? 'running'
          : 'idle';
    // Confirm each detected move with a quiet sound, also before the start, so the player
    // hears that the camera follows them. Silent while paused or after the finish.
    if (phase === 'idle' || phase === 'running')
      for (const m of movesSeen(prevState, state)) audio.saw(m);
    prevState = state;
    const tier = feverTier(core.streak());
    if (tier > lastTier) audio.levelUp(tier);
    lastTier = tier;

    // Everything freezes while paused; before start the runner copies the player in place.
    const visDt = phase === 'paused' ? 0 : Math.min(realDt, T.MAX_DT_SEC);
    try {
      view!.frame({ elapsed: core.elapsed(), visDt, realDt, state, phase, streak: core.streak() });
    } catch (err) {
      // A drawing failure must not stop the round: events and the HUD keep working.
      console.error('[game] render failed, continuing without drawing', err);
      view!.dispose();
      view = { frame() {}, engage() {}, verdict() {}, setLowGraphics() {}, dispose() {} };
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    start() {
      if (core.started() || destroyed) return;
      core.start();
      last = performance.now();
      audio.resume();
    },
    pause: () => core.pause(),
    resume: () => core.resume(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      core.clearListeners();
      audio.dispose();
      view?.dispose();
    },
    getElapsedSec: () => core.elapsed(),
    onEvent: (cb) => core.onEvent(cb),
  };
}

function tryCreate3D(
  canvas: HTMLCanvasElement,
  level: Level,
  items: Parameters<typeof create3DView>[2],
): GameView | null {
  try {
    return create3DView(canvas, level, items);
  } catch (err) {
    console.warn('[game] WebGL unavailable, using the 2D view', err);
    return null;
  }
}

/** '?gfx=low|high|2d' or localStorage 'game.gfx'; anything else means automatic. */
function readGfxSetting(): 'low' | 'high' | '2d' | 'auto' {
  try {
    const v =
      new URLSearchParams(window.location.search).get('gfx') ??
      window.localStorage.getItem('game.gfx');
    return v === 'low' || v === 'high' || v === '2d' ? v : 'auto';
  } catch {
    return 'auto';
  }
}
