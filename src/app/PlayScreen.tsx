// The game canvas with the GameHud overlay. The game loop lives in src/game; React only
// re-renders the HUD from a 10 Hz poll (AGENTS.md rule 6).
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Game,
  InputSource,
  LiveStats,
  MoveType,
  PoseInputSource,
  SessionConfig,
  SessionSummary,
} from '@/contracts';
import { createGame } from '@/game';
import { GameHud } from '@/ui/screens/GameHud';
import { createSessionTracker, generateLevel } from '@/workout';
import { VideoSlot } from './slots';
import { TrackingLostHint } from './ErrorStates';
import { FINISH_DELAY_MS, HUD_POLL_MS, TRACKING_LOST_HINT_MS } from './tuning';

type HudEvent = {
  kind: 'cleared' | 'hit' | 'collected';
  move: MoveType;
  points: number;
  id: number;
};

export function PlayScreen({
  config,
  input,
  weightKg,
  debug,
  onGame,
  onFinish,
  onUseKeyboard,
  pose,
}: {
  config: SessionConfig;
  input: InputSource;
  weightKg?: number;
  debug: boolean;
  onGame: (game: Game | null) => void;
  onFinish: (summary: SessionSummary) => void;
  /** Switch to keyboard input (offered when the camera has lost the player for a while). */
  onUseKeyboard: () => void;
  /** The live pose source when the camera is the input, for the camera preview in the HUD. */
  pose: PoseInputSource | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The level actually played. generateLevel may change the config (fills the seed; with ?demo=1
  // it plays the 45 s demo level), so the HUD reads level.config, never the app's choice.
  const level = useMemo(() => generateLevel(config), [config]);
  const gameRef = useRef<Game | null>(null);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [cue, setCue] = useState<{ move: MoveType; inSec: number } | null>(null);
  const [lastEvent, setLastEvent] = useState<HudEvent | null>(null);
  const [paused, setPaused] = useState(false);
  const [trackingLost, setTrackingLost] = useState(false);
  const [lostLong, setLostLong] = useState(false);
  useEffect(() => {
    if (!trackingLost) return;
    const t = setTimeout(() => setLostLong(true), TRACKING_LOST_HINT_MS);
    return () => {
      clearTimeout(t);
      setLostLong(false);
    };
  }, [trackingLost]);
  const onFinishRef = useRef(onFinish);
  const onGameRef = useRef(onGame);
  /** True from the 'finished' event on: the round is over, the fanfare is playing. */
  const finishedRef = useRef(false);
  useEffect(() => {
    onFinishRef.current = onFinish;
    onGameRef.current = onGame;
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    // Match the drawing buffer to the CSS size (the Three.js game also tracks resizes itself).
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    // Pass level.config so the saved session records the seed actually played (CONTRACTS.md).
    const tracker = createSessionTracker(level.config, { weightKg });
    const game = createGame(canvas, level, input);
    gameRef.current = game;

    let cueAt: { move: MoveType; arrives: number } | null = null;
    // The summary is taken the moment the round ends; it is delivered FINISH_DELAY_MS later.
    let pending: SessionSummary | null = null;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const deliver = () => {
      if (!pending) return;
      const summary = pending;
      pending = null; // exactly once, whichever comes first: the timer or an unmount
      clearTimeout(finishTimer);
      onFinishRef.current(summary);
    };
    finishedRef.current = false;
    let eventId = 0;
    const offEvent = game.onEvent((e) => {
      if (finishedRef.current) return; // nothing after the end counts (no pause overlay, no hits)
      const before = tracker.getLive().score;
      tracker.handleGameEvent(e);
      switch (e.type) {
        case 'cue': {
          const move = e.wave.spawns[0]?.requires;
          if (move) cueAt = { move, arrives: game.getElapsedSec() + e.inSec };
          break;
        }
        case 'cleared':
        case 'hit':
        case 'collected':
          setLastEvent({
            kind: e.type,
            move: e.spawn.requires,
            points: tracker.getLive().score - before,
            id: ++eventId,
          });
          break;
        case 'paused':
          setPaused(true);
          setTrackingLost(e.reason === 'trackingLost');
          break;
        case 'resumed':
          setPaused(false);
          setTrackingLost(false);
          break;
        case 'finished':
          finishedRef.current = true;
          setPaused(false);
          setTrackingLost(false);
          pending = tracker.finish(game.getElapsedSec());
          finishTimer = setTimeout(deliver, FINISH_DELAY_MS);
          break;
      }
    });
    const offMove = input.onMove((e) => tracker.handleMove(e));
    const poll = setInterval(() => {
      const t = game.getElapsedSec();
      setStats(tracker.getLive());
      setElapsed(t);
      setCue(cueAt && cueAt.arrives > t ? { move: cueAt.move, inSec: cueAt.arrives - t } : null);
    }, HUD_POLL_MS);

    onGameRef.current(game);
    game.start();
    return () => {
      // Replaced mid-fanfare (e.g. K swapped the input): still deliver the finished round.
      deliver();
      clearInterval(poll);
      offEvent();
      offMove();
      game.destroy();
      gameRef.current = null;
      onGameRef.current(null);
    };
  }, [level, input, weightKg]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {stats && (
        <GameHud
          stats={stats}
          elapsedSec={elapsed}
          durationSec={level.config.durationSec}
          mode={level.config.mode}
          cue={cue}
          lastEvent={lastEvent}
          paused={paused}
          trackingLost={trackingLost}
          cameraSlot={pose ? <VideoSlot pose={pose} /> : undefined}
          onPause={() => {
            if (!finishedRef.current) gameRef.current?.pause();
          }}
          onResume={() => {
            if (!finishedRef.current) gameRef.current?.resume();
          }}
        />
      )}
      {trackingLost && lostLong && <TrackingLostHint onUseKeyboard={onUseKeyboard} />}
      {debug && stats && (
        <pre className="absolute bottom-4 left-4 z-50 rounded bg-black/70 p-3 text-xs text-white">
          {JSON.stringify({ input: input.kind, state: input.getState(), stats }, null, 2)}
        </pre>
      )}
    </div>
  );
}
