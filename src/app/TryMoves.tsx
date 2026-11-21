// "Try each move": a short, skippable tutorial before a player's first round (PLAN Phase 3).
// Built in src/app from the src/ui kit. Each move shows for TUTORIAL_STEP_MS, or until the
// player does it, whichever comes first, so it doubles as a quick check that input works.
import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import type { InputSource, MoveType } from '@/contracts';
import { GameButton, MOVE_COLORS, MOVE_LABELS, MoveFigure, Screen, useHotkey } from '@/ui/kit';
import { cn } from '@/ui/lib/utils';
import { moveHint } from './tutorial';
import { TUTORIAL_STEP_MS } from './tuning';

export function TryMoves({
  moves,
  input,
  onDone,
}: {
  moves: MoveType[];
  input: InputSource;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<MoveType[]>([]);
  const move = moves[step];

  // Next move after the step time, or as soon as the player does this one.
  useEffect(() => {
    if (!move) return;
    let advanced = false; // once per step: a quick repeat of the same move must not skip the next
    let tickTimer: ReturnType<typeof setTimeout> | undefined;
    const next = () => setStep((s) => s + 1);
    const timer = setTimeout(next, TUTORIAL_STEP_MS);
    const off = input.onMove((e) => {
      if (e.type !== move || advanced) return;
      advanced = true;
      setDone((d) => [...d, move]);
      clearTimeout(timer);
      tickTimer = setTimeout(next, 400); // a beat to see the tick
    });
    return () => {
      clearTimeout(timer);
      clearTimeout(tickTimer);
      off();
    };
  }, [move, input]);

  // Finished every move: start the round.
  useEffect(() => {
    if (step >= moves.length) onDone();
  }, [step, moves.length, onDone]);

  useHotkey('Escape', onDone);
  useHotkey('Enter', onDone);

  if (!move) return null;
  const color = MOVE_COLORS[move];
  return (
    <Screen
      backdrop="arena"
      center
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
      <div className="flex flex-col items-center justify-center gap-6 py-6 text-center">
        <p className="eyebrow text-text-dim">
          Try each move · {step + 1} / {moves.length}
        </p>
        <MoveFigure pose={move} color={color} animate size={260} />
        <div className="flex flex-col items-center gap-2">
          <h2 className="font-display-italic text-display-sm" style={{ color }}>
            {MOVE_LABELS[move]}
            {done.includes(move) ? ' ✓' : ''}
          </h2>
          <p className="text-body text-text-muted">{moveHint(move, input.kind)}</p>
        </div>
        {/* Progress through the six moves, so the screen says where you are. */}
        <ol className="mt-2 flex items-center gap-2" aria-label="Move progress">
          {moves.map((m, i) => (
            <li
              key={m}
              aria-current={i === step ? 'step' : undefined}
              className={cn(
                'h-1.5 rounded-full transition-[width,background-color] duration-300',
                i === step
                  ? 'w-8 bg-lime-fill'
                  : done.includes(m)
                    ? 'w-4 bg-lime-dim'
                    : 'w-4 bg-line-strong',
              )}
            >
              <span className="sr-only">{MOVE_LABELS[m]}</span>
            </li>
          ))}
        </ol>
      </div>
    </Screen>
  );
}
