// The game canvas with the GameHud overlay. The game loop lives in src/game; React only
// re-renders the HUD from a 10 Hz poll (AGENTS.md rule 6).
import { useEffect, useRef, useState } from 'react';
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
import { GameHud } from '@/ui/screens';
import { createSessionTracker, generateLevel } from '@/workout';
import { VideoSlot } from './slots';

const HUD_POLL_MS = 100;

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
}: {
  config: SessionConfig;
  input: InputSource;
  weightKg?: number;
  debug: boolean;
  onGame: (game: Game | null) => void;
  onFinish: (summary: SessionSummary) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [cue, setCue] = useState<{ move: MoveType; inSec: number } | null>(null);
  const [lastEvent, setLastEvent] = useState<HudEvent | null>(null);
  const [paused, setPaused] = useState(false);
  const [trackingLost, setTrackingLost] = useState(false);
  const onFinishRef = useRef(onFinish);
  const onGameRef = useRef(onGame);
  useEffect(() => {
    onFinishRef.current = onFinish;
    onGameRef.current = onGame;
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    // Match the drawing buffer to the CSS size (the Three.js game also tracks resizes itself).
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const level = generateLevel(config);
    // Pass level.config so the saved session records the seed actually played (CONTRACTS.md).
    const tracker = createSessionTracker(level.config, { weightKg });
    const game = createGame(canvas, level, input);
    gameRef.current = game;

    let cueAt: { move: MoveType; arrives: number } | null = null;
    let eventId = 0;
    const offEvent = game.onEvent((e) => {
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
          onFinishRef.current(tracker.finish(game.getElapsedSec()));
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
      clearInterval(poll);
      offEvent();
      offMove();
      game.destroy();
      gameRef.current = null;
      onGameRef.current(null);
    };
  }, [config, input, weightKg]);

  const pose = input.kind === 'pose' ? (input as PoseInputSource) : null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {stats && (
        <GameHud
          stats={stats}
          elapsedSec={elapsed}
          durationSec={config.durationSec}
          mode={config.mode}
          cue={cue}
          lastEvent={lastEvent}
          paused={paused}
          trackingLost={trackingLost}
          cameraSlot={pose ? <VideoSlot pose={pose} /> : undefined}
          onPause={() => gameRef.current?.pause()}
          onResume={() => gameRef.current?.resume()}
        />
      )}
      {debug && stats && (
        <pre className="absolute bottom-4 left-4 z-50 rounded bg-black/70 p-3 text-xs text-white">
          {JSON.stringify({ input: input.kind, state: input.getState(), stats }, null, 2)}
        </pre>
      )}
    </div>
  );
}
