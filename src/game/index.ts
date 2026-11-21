import type { Game, InputSource, Level } from '@/contracts';
import { createGameAudio } from './audio';
import { createCore, feverTier, movesSeen } from './core';
import {
  createGhostRecorder,
  finishOutcome,
  ghostPoseAt,
  ghostKey,
  neutralPose,
  type GhostResult,
} from './ghost';
import { createGhostRace, raceLead } from './ghostRace';
import { browserStorage, createGhostStore } from './ghostStore';
import { createQualityGovernor, type Quality } from './quality';
import { createTimingProbe } from './timing';
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
  // Read on every use: the app's input can switch between keyboard and camera mid-round (K).
  const leads: T.Leads = () => T.VISUAL_LEAD_SEC[input.kind];
  const result: GhostResult = { cleared: 0, collected: 0, hit: 0 }; // this run, for the ghost
  const core = createCore(
    level,
    {
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
        if (v === 'cleared' || v === 'collected' || v === 'hit') result[v]++;
        view?.verdict(item, v);
      },
    },
    leads,
  );

  // Ghost runner: race the best stored run of this exact level (?ghost=off, ?ghost=reset).
  const ghostFlag = readFlag('ghost');
  const ghostStore = ghostFlag === 'off' ? null : createGhostStore(browserStorage());
  if (ghostFlag === 'reset' && !ghostResetDone) {
    ghostResetDone = true; // once per page load, or every round would wipe the previous ghost
    ghostStore?.clear();
  }
  // One ghost per level and input (the input at the start of the round): see ghostKey.
  const startKind = input.kind;
  const fingerprint = ghostKey(level, startKind);
  // K switched the input during the round: neither camera nor keyboard play, so the run is
  // never stored as a ghost (a half-keyboard run would be unbeatable for camera players).
  let mixedInput = false;
  const ghost = ghostStore?.load(fingerprint) ?? null;
  const recorder = ghostStore ? createGhostRecorder() : null;
  const ghostPose = neutralPose(); // reused every frame
  const race = ghost ? createGhostRace(level, ghost) : null; // the ghost's live score
  let currentState = input.getState();

  // ?debug=timing: record move timing for tuning VISUAL_LEAD_SEC; printed when the round ends.
  const probe =
    readFlag('debug') === 'timing' ? createTimingProbe(core.items, level.config.mode, leads) : null;
  core.onEvent((e) => {
    if (e.type !== 'finished') return;
    audio.finish();
    if (ghostStore && recorder) {
      recorder.sample(core.elapsed(), currentState); // the last tick
      const run = {
        v: 1 as const,
        fingerprint,
        hz: T.GHOST_HZ,
        samples: recorder.samples,
        result: { ...result },
        savedAt: Date.now(),
      };
      const saved = !mixedInput && ghostStore.saveIfBetter(run);
      const outcome = finishOutcome(ghost?.result ?? null, result, saved);
      if (outcome) view?.showGhostOutcome(outcome);
      const told = (r: GhostResult) => `${r.cleared + r.collected} cleared, ${r.hit} hits`;
      console.info(
        `[game] ghost: ${outcome ?? 'not saved'}. This run ${told(result)}` +
          (ghost ? `; ghost ${told(ghost.result)}` : '') +
          (saved && ghost ? '. New ghost saved.' : '') +
          (mixedInput ? '. Input switched mid-round: not stored as a ghost.' : ''),
      );
    }
    if (probe) {
      const report = probe.report();
      (window as unknown as { __gameTiming?: unknown }).__gameTiming = report;
      console.info(
        `[game] move timing, input: ${mixedInput ? 'switched mid-round (do not use this table)' : input.kind} (negative = early; window -0.35..+0.15 s)`,
      );
      console.table(report);
    }
  });

  const gfx = readGfxSetting();
  view = gfx === '2d' ? null : tryCreate3D(canvas, level, core.items, leads);
  view ??= create2DView(canvas, level, core.items, leads);
  const startQuality: Quality = gfx === 'low' ? 2 : gfx === 'medium' ? 1 : 0;
  if (startQuality > 0) view.setQuality(startQuality);
  const quality = createQualityGovernor(startQuality, gfx === 'auto', window.devicePixelRatio || 1);

  let destroyed = false;
  let last = performance.now();
  let raf = 0;
  let prevState = input.getState();
  let lastTier = 0;
  // <body data-game="running"> while the round runs: keyboard input (src/input) consumes its
  // keys only then, so the rest of the app keeps normal keyboard behaviour.
  let marked = false;
  const markRunning = (on: boolean): void => {
    if (on === marked) return;
    marked = on;
    if (on) document.body.dataset.game = 'running';
    else delete document.body.dataset.game;
  };

  function frame(now: number): void {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const realDt = Math.max(0, (now - last) / 1000);
    last = now;
    const state = input.getState(); // polled once per frame
    currentState = state;
    if (!core.finished() && input.kind !== startKind) mixedInput = true;
    core.step(realDt, state, now);
    race?.syncTo(core.elapsed());
    if (recorder && core.started() && !core.finished() && core.pauseReason() === null)
      recorder.sample(core.elapsed(), state);
    if (probe && core.started() && !core.finished() && core.pauseReason() === null)
      probe.sample(core.elapsed(), state);

    const running = core.started() && !core.finished() && core.pauseReason() === null;
    const stepped = quality.sample(realDt, running);
    if (stepped !== null) {
      view!.setQuality(stepped);
      console.info(`[game] ${quality.lastFps.toFixed(0)} fps: graphics quality ${stepped}`);
    }

    const phase: Phase = core.finished()
      ? 'finished'
      : core.pauseReason()
        ? 'paused'
        : core.started()
          ? 'running'
          : 'idle';
    markRunning(phase === 'running');
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
      view!.frame({
        elapsed: core.elapsed(),
        visDt,
        realDt,
        state,
        phase,
        streak: core.streak(),
        ghost: ghost ? ghostPoseAt(ghost.samples, ghost.hz, core.elapsed(), ghostPose) : null,
        race: race && phase !== 'finished' ? raceLead(result, race.ghost) : null,
      });
    } catch (err) {
      // A drawing failure must not stop the round: events and the HUD keep working.
      console.error('[game] render failed, continuing without drawing', err);
      view!.dispose();
      view = {
        frame() {},
        engage() {},
        verdict() {},
        setQuality() {},
        showGhostOutcome() {},
        dispose() {},
      };
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
      markRunning(false);
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
  leads: Parameters<typeof create3DView>[3],
): GameView | null {
  try {
    return create3DView(canvas, level, items, leads);
  } catch (err) {
    console.warn('[game] WebGL unavailable, using the 2D view', err);
    return null;
  }
}

let ghostResetDone = false; // ?ghost=reset clears the stored ghosts once per page load

/** '?gfx=high|medium|low|2d' or localStorage 'game.gfx'; anything else means automatic. */
function readGfxSetting(): 'high' | 'medium' | 'low' | '2d' | 'auto' {
  const v = readFlag('gfx');
  return v === 'high' || v === 'medium' || v === 'low' || v === '2d' ? v : 'auto';
}

/** A URL parameter, else localStorage 'game.<name>'; null when neither is set or readable. */
function readFlag(name: string): string | null {
  try {
    return (
      new URLSearchParams(window.location.search).get(name) ??
      window.localStorage.getItem(`game.${name}`)
    );
  } catch {
    return null;
  }
}
