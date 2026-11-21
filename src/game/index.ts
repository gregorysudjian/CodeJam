import type { Game, InputSource, Level } from '@/contracts';
import { createGameAudio } from './audio';
import { createCore, feverTier, movesSeen, type Item } from './core';
import { comboMilestone, gradeFor } from './feedback';
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
import { createFrameStats, createQualityGovernor, type Quality } from './quality';
import { createLeadBlend } from './timeline';
import {
  createTimingProbe,
  describeSpawn,
  lagsToPaste,
  leadsToPaste,
  mergeTiming,
  summarizeTiming,
  type TimingSamples,
} from './timing';
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
  let lastStreak = 0; // for combo milestones
  // Read on every use: the app's input can switch between keyboard and camera mid-round (K).
  const leads: T.Leads = () => T.VISUAL_LEAD_SEC[input.kind];
  // What objects are drawn (and cued) with: `leads` followed at a limited rate (createLeadBlend).
  const shownLeads = createLeadBlend(leads());
  const result: GhostResult = { cleared: 0, collected: 0, hit: 0 }; // this run, for the ghost
  const misses: [Item, 'hit' | 'missed'][] = []; // explained at the end with ?debug=timing
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
      verdict: (item, v, offset) => {
        if (v === 'cleared') audio.cleared(item.spawn.requires);
        else if (v === 'collected') audio.collected();
        else if (v === 'hit') audio.hit();
        if (v === 'cleared' || v === 'collected' || v === 'hit') result[v]++;
        if (v === 'hit' || v === 'missed') misses.push([item, v]);
        // Timing grade (feedback.ts): judged against the input in use, since the camera lags.
        const grade = offset === null ? null : gradeFor(offset, input.kind);
        if (grade === 'perfect') audio.perfect();
        view?.verdict(item, v, grade);
        const streak = core.streak();
        const milestone = comboMilestone(lastStreak, streak);
        lastStreak = streak;
        if (milestone !== null) view?.milestone(milestone);
      },
    },
    shownLeads.get,
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
  const told = (r: GhostResult) => `${r.cleared + r.collected} cleared, ${r.hit} hits`;
  // One line per round, so a rehearsal can be checked: is there a ghost for this level and input?
  console.info(
    !ghostStore
      ? '[game] ghost: off'
      : ghost
        ? `[game] ghost: racing the best ${startKind} run of this level (${told(ghost.result)})`
        : `[game] ghost: none yet for this level with ${startKind} input; the first finished round saves one`,
  );

  // ?debug=timing: record move timing for tuning VISUAL_LEAD_SEC; printed when the round ends.
  const probe =
    readFlag('debug') === 'timing' ? createTimingProbe(core.items, level.config.mode, leads) : null;
  core.onEvent((e) => {
    if (e.type !== 'finished') return;
    audio.finish();
    // Frame rate while the round ran, for checking the 45 fps target on the demo laptop.
    const fps = frameStats.summary();
    if (fps) {
      (window as unknown as { __gameFps?: unknown }).__gameFps = fps;
      console.info(
        `[game] frame rate this round: average ${fps.avgFps.toFixed(1)} fps, ` +
          `slowest 5% of frames ${fps.p95Ms.toFixed(1)} ms (${(1000 / fps.p95Ms).toFixed(0)} fps), ` +
          `${fps.frames} frames, graphics quality ${quality.level}`,
      );
    }
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
      console.info(
        `[game] ghost: ${outcome ?? 'not saved'}. This run ${told(result)}` +
          (ghost ? `; ghost ${told(ghost.result)}` : '') +
          (saved && ghost ? '. New ghost saved.' : '') +
          (mixedInput ? '. Input switched mid-round: not stored as a ghost.' : ''),
      );
    }
    if (probe) {
      const report = probe.report();
      const w = window as unknown as Record<string, unknown>;
      w.__gameTiming = report;
      console.info(
        `[game] move timing, input: ${mixedInput ? 'switched mid-round (do not use this table)' : input.kind} (negative = early; window -0.35..+0.15 s)`,
      );
      console.table(report);
      if (!mixedInput) {
        // One table over every round of this page load with this input: a steadier median.
        const session = timingSession[startKind];
        mergeTiming(session.samples, probe.samples());
        session.rounds++;
        const all = summarizeTiming(session.samples, T.VISUAL_LEAD_SEC[startKind]);
        w.__gameTimingAll = all;
        if (session.rounds > 1) {
          console.info(
            `[game] move timing, all ${session.rounds} ${startKind} rounds so far: copy these suggestedLeadSec values`,
          );
          console.table(all);
        }
        if (startKind === 'pose') {
          // Step 2 of the camera session in one paste (src/game/README.md).
          console.info(
            `[game] camera session, paste both lines:\n` +
              `src/game/tuning.ts         VISUAL_LEAD_SEC.pose = ${leadsToPaste(all, T.VISUAL_LEAD_SEC.pose)}\n` +
              `src/game/latency.test.ts   SESSION_LAG_SEC = ${lagsToPaste(all)}`,
          );
        }
      }
      // Every hit and missed orb, and why: timing (early, late), detection (not seen), holds.
      const why = misses.map(([item, v]) => {
        const { cause, detail } = probe.explain(item);
        return {
          at: `${item.wave.t.toFixed(2)} s`,
          object: describeSpawn(item.spawn),
          verdict: v,
          cause,
          detail,
        };
      });
      w.__gameMisses = why;
      if (why.length > 0) {
        console.info(`[game] ${why.length} hits and missed orbs this round, and why:`);
        console.table(why);
      } else console.info('[game] no hits and no missed orbs this round');
    }
  });

  const gfx = readGfxSetting();
  view = gfx === '2d' ? null : tryCreate3D(canvas, level, core.items, shownLeads.get);
  view ??= create2DView(canvas, level, core.items, shownLeads.get);
  // Automatic graphics start where an earlier round of this page load ended up, so only the first
  // round measures and steps down mid-round; later ones (the judges') start at the right level.
  const startQuality: Quality =
    gfx === 'low' ? 2 : gfx === 'medium' ? 1 : gfx === 'auto' ? autoQuality : 0;
  if (startQuality > 0) view.setQuality(startQuality);
  if (gfx === 'auto' && startQuality > 0) {
    console.info(
      `[game] graphics quality ${startQuality}, as an earlier round measured (reload to measure again)`,
    );
  }
  const quality = createQualityGovernor(startQuality, gfx === 'auto', window.devicePixelRatio || 1);
  const frameStats = createFrameStats();
  // Intro (intro.ts): start() counts 3, 2, 1 while the camera flies in, then starts the clock.
  // Seconds since it began, still counting into the round for GO; -1 before start(). ?intro=off
  const introOn = readFlag('intro') !== 'off';
  let introT = -1;
  const beginRound = (): void => {
    if (core.started()) return;
    core.start();
    audio.count(0);
  };

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
    view!.setInput(state); // before the rules: engage and verdict use this frame's move
    if (introT >= 0 && introT < T.INTRO_SEC + T.INTRO_GO_SEC) {
      const before = introT;
      introT += Math.min(realDt, T.MAX_DT_SEC);
      if (!core.started()) {
        if (introT >= T.INTRO_SEC) beginRound();
        else if (Math.ceil(T.INTRO_SEC - introT) < Math.ceil(T.INTRO_SEC - before))
          audio.count(Math.ceil(T.INTRO_SEC - introT));
      }
    }
    if (!core.finished() && input.kind !== startKind) mixedInput = true;
    if (core.pauseReason() === null) shownLeads.step(leads(), Math.min(realDt, T.MAX_DT_SEC));
    core.step(realDt, state, now);
    race?.syncTo(core.elapsed());
    if (recorder && core.started() && !core.finished() && core.pauseReason() === null)
      recorder.sample(core.elapsed(), state);
    if (probe && core.started() && !core.finished() && core.pauseReason() === null)
      probe.sample(core.elapsed(), state);

    const running = core.started() && !core.finished() && core.pauseReason() === null;
    if (running) frameStats.sample(realDt);
    const stepped = quality.sample(realDt, running);
    if (stepped !== null) {
      view!.setQuality(stepped);
      if (gfx === 'auto') autoQuality = Math.max(autoQuality, stepped) as Quality;
      console.info(`[game] ${quality.lastFps.toFixed(0)} fps: graphics quality ${stepped}`);
    }

    const phase: Phase = core.finished()
      ? 'finished'
      : core.pauseReason()
        ? 'paused'
        : core.started()
          ? 'running'
          : introT >= 0
            ? 'intro'
            : 'idle';
    // The keyboard works during the intro too, so the player can try a move before GO.
    markRunning(phase === 'running' || phase === 'intro');
    // Confirm each detected move with a quiet sound, also before the start, so the player
    // hears that the camera follows them. Silent while paused or after the finish.
    if (phase === 'idle' || phase === 'intro' || phase === 'running')
      for (const m of movesSeen(prevState, state)) audio.saw(m);
    prevState = state;
    const tier = feverTier(core.streak());
    if (tier > lastTier) audio.levelUp(tier);
    lastTier = tier;
    // The beat plays while the round runs, fades on a pause and stops at the finish.
    if (phase === 'running') audio.music.start();
    else audio.music.stop();
    const { durationSec } = level.config;
    audio.music.update({
      progress: durationSec > 0 ? core.elapsed() / durationSec : 0,
      tier,
      finale: core.elapsed() >= durationSec - T.FINALE_SEC,
    });

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
        intro: introT,
        ghost: ghost ? ghostPoseAt(ghost.samples, ghost.hz, core.elapsed(), ghostPose) : null,
        race: race && phase !== 'finished' ? raceLead(result, race.ghost) : null,
      });
    } catch (err) {
      // A drawing failure must not stop the round: events and the HUD keep working.
      console.error('[game] render failed, continuing without drawing', err);
      view!.dispose();
      view = {
        setInput() {},
        frame() {},
        engage() {},
        verdict() {},
        milestone() {},
        setQuality() {},
        showGhostOutcome() {},
        dispose() {},
      };
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    start() {
      if (core.started() || introT >= 0 || destroyed) return;
      last = performance.now();
      audio.resume();
      if (introOn) {
        introT = 0;
        audio.count(3);
      } else {
        introT = T.INTRO_SEC + T.INTRO_GO_SEC; // no countdown, no GO
        beginRound();
      }
    },
    pause() {
      // Esc during the countdown skips it into a paused round, so pause always pauses.
      if (introT >= 0 && !core.started()) {
        introT = T.INTRO_SEC + T.INTRO_GO_SEC;
        core.start();
      }
      core.pause();
    },
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
let autoQuality: Quality = 0; // the level automatic graphics reached in this page load

/** ?debug=timing: every round of this page load, per input (rounds that switched are left out). */
const timingSession: Record<'pose' | 'keyboard', { samples: TimingSamples; rounds: number }> = {
  pose: { samples: new Map(), rounds: 0 },
  keyboard: { samples: new Map(), rounds: 0 },
};

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
