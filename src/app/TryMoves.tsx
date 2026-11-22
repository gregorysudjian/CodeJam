// "Try each move": a short, skippable tutorial before a player's first round (PLAN Phase 3).
// Built in src/app from the src/ui kit. Each move shows for TUTORIAL_STEP_MS, or until the
// player does it, whichever comes first, so it doubles as a quick check that input works.
// The last step shows how to pause: the X gesture (camera) or Esc (keyboard).
import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import type { InputSource, MoveType, PoseInputSource } from '@/contracts';
import {
  ACCENT_HEX,
  GameButton,
  MOVE_COLORS,
  MOVE_LABELS,
  MoveFigure,
  Screen,
  useHotkey,
} from '@/ui/kit';
import { moveHint, pauseHint } from './tutorial';
import { TUTORIAL_STEP_MS } from './tuning';

export function TryMoves({
  moves,
  input,
  pose,
  onDone,
}: {
  moves: MoveType[];
  input: InputSource;
  pose?: PoseInputSource | null; // camera player: the pause step listens for the X gesture
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<(MoveType | 'pause')[]>([]);
  const steps: (MoveType | 'pause')[] = [...moves, 'pause'];
  const move = steps[step];

  // Next move after the step time, or as soon as the player does this one.
  useEffect(() => {
    if (!move) return;
    let advanced = false; // once per step: a quick repeat of the same move must not skip the next
    let tickTimer: ReturnType<typeof setTimeout> | undefined;
    const next = () => setStep((s) => s + 1);
    const timer = setTimeout(next, TUTORIAL_STEP_MS);
    const tick = () => {
      if (advanced) return;
      advanced = true;
      setDone((d) => [...d, move]);
      clearTimeout(timer);
      tickTimer = setTimeout(next, 400); // a beat to see the tick
    };
    // Keyboard players see "Esc" on the pause step; Esc already starts the round (below).
    const off =
      move === 'pause'
        ? (pose?.onGesture?.((g) => g === 'pause' && tick()) ?? (() => {}))
        : input.onMove((e) => e.type === move && tick());
    return () => {
      clearTimeout(timer);
      clearTimeout(tickTimer);
      off();
    };
  }, [move, input, pose]);

  // Finished every move: start the round.
  useEffect(() => {
    if (step >= steps.length) onDone();
  }, [step, steps.length, onDone]);

  useHotkey('Escape', onDone);
  useHotkey('Enter', onDone);

  if (!move) return null;
  const isPause = move === 'pause';
  const color = isPause ? ACCENT_HEX.danger : MOVE_COLORS[move];
  return (
    <Screen
      backdrop="arena"
      footer={
        <div className="flex w-full items-center justify-between gap-4">
          <GameButton variant="ghost" size="md" keyHint="ESC" onClick={onDone}>
            Skip
          </GameButton>
          <GameButton size="lg" leadingIcon={Play} keyHint="ENTER" onClick={onDone}>
            Start the round
          </GameButton>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-6 py-6 text-center">
        {/* Sized to read from the floor mark, about 1.5 m away (QA A2). */}
        <p className="text-title uppercase tracking-[0.2em] text-text-muted">
          Try each move · {step + 1} / {steps.length}
        </p>
        <MoveFigure pose={move} color={color} animate size={260} />
        <h2 className="font-display-italic text-display-md" style={{ color }}>
          {isPause ? 'PAUSE' : MOVE_LABELS[move]}
          {done.includes(move) ? ' ✓' : ''}
        </h2>
        <p className="font-display-italic text-display-sm text-text">
          {isPause ? pauseHint(input.kind) : moveHint(move, input.kind)}
        </p>
      </div>
    </Screen>
  );
}
