import { useEffect, useRef, useState } from 'react';
import type { Game, InputSource, LiveStats, SessionConfig, SessionSummary } from '@/contracts';
import { createGame } from '@/game';
import { createSessionTracker, generateLevel } from '@/workout';

const HUD_POLL_MS = 100; // the HUD polls the tracker; never a React update per frame (AGENTS.md rule 6)

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
  const [live, setLive] = useState<LiveStats | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [cue, setCue] = useState('');
  const onFinishRef = useRef(onFinish);
  const onGameRef = useRef(onGame);
  useEffect(() => {
    onFinishRef.current = onFinish;
    onGameRef.current = onGame;
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const level = generateLevel(config);
    // Pass level.config so the saved session records the seed actually played (CONTRACTS.md).
    const tracker = createSessionTracker(level.config, { weightKg });
    const game = createGame(canvas, level, input);
    const offEvent = game.onEvent((e) => {
      tracker.handleGameEvent(e);
      if (e.type === 'cue') setCue(e.wave.spawns[0]?.requires.toUpperCase() ?? '');
      if (e.type === 'finished') onFinishRef.current(tracker.finish(game.getElapsedSec()));
    });
    const offMove = input.onMove((e) => tracker.handleMove(e));
    const poll = setInterval(() => {
      setLive(tracker.getLive());
      setElapsed(game.getElapsedSec());
    }, HUD_POLL_MS);

    onGameRef.current(game);
    game.start();
    return () => {
      clearInterval(poll);
      offEvent();
      offMove();
      game.destroy();
      onGameRef.current(null);
    };
  }, [config, input, weightKg]);

  return (
    <div className="relative h-screen w-screen">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-6 text-3xl font-bold">
        <span>{live?.score ?? 0}</span>
        <span>{Math.max(0, Math.ceil(config.durationSec - elapsed))}s</span>
        <span>
          x{live?.multiplier ?? 1} · {live?.streak ?? 0}
        </span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-24 text-center text-6xl font-extrabold">
        {cue}
      </div>
      {debug && live && (
        <pre className="absolute bottom-4 left-4 rounded bg-black/70 p-3 text-xs">
          {JSON.stringify({ input: input.kind, state: input.getState(), live }, null, 2)}
        </pre>
      )}
    </div>
  );
}
