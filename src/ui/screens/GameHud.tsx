import { memo, useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { Flame, Pause, PersonStanding } from 'lucide-react';
import type { LiveStats, MoveType, PlayMode } from '@/contracts';
import { Button } from '@/ui/components/ui/button';
import {
  AnimatedNumber,
  BustOutline,
  GameButton,
  KeyHint,
  MoveFigure,
  ProgressRing,
  ACCENT_TEXT,
  MOVE_ACCENTS,
  useHotkey,
} from '@/ui/kit';
import { formatTime } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { cueProgress } from '@/ui/screens/resultsRules';
import { hudCueLabel, raceProgress } from '@/ui/screens/hudRules';

export interface GameHudProps {
  stats: LiveStats;
  elapsedSec: number;
  durationSec: number;
  mode: PlayMode;
  cue?: { move: MoveType; inSec: number } | null;
  lastEvent?: {
    kind: 'cleared' | 'hit' | 'collected';
    move: MoveType;
    points: number;
    id: number;
  } | null;
  paused?: boolean;
  trackingLost?: boolean;
  cameraSlot?: ReactNode;
  onPause(): void;
  onResume(): void;
  /** Leave the round without saving it (from the pause screen). */
  onQuit?(): void;
}
type FeedbackEvent = NonNullable<GameHudProps['lastEvent']>;
const Feedback = memo(
  function Feedback({ event }: { event: FeedbackEvent }) {
    const reduce = useReducedMotion();
    const tone =
      event.kind === 'hit'
        ? 'text-danger'
        : event.kind === 'collected'
          ? 'text-violet'
          : 'text-lime';
    return (
      <div data-feedback-id={event.id}>
        {!reduce && event.kind !== 'collected' && (
          <motion.div
            className={cn('hud-vignette absolute inset-0', tone)}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.75, 0] }}
            transition={{ duration: 0.6 }}
          />
        )}
        <motion.div
          className={cn(
            'absolute inset-x-0 top-[68%] text-center font-display-italic text-display-sm',
            tone,
          )}
          initial={{ opacity: 1, y: 0 }}
          animate={{ opacity: [1, 1, 0], y: reduce ? 0 : -55 }}
          transition={{ duration: 0.65, times: [0, 0.65, 1] }}
        >
          {event.kind === 'hit'
            ? 'MISS'
            : `+${event.points}${event.kind === 'collected' ? ' ORB' : ''}`}
        </motion.div>
      </div>
    );
  },
  (prev, next) => prev.event.id === next.event.id,
);

/** Transparent, prop-driven overlay. The host owns the canvas and the game loop. */
export function GameHud({
  stats,
  elapsedSec,
  durationSec,
  mode,
  cue,
  lastEvent,
  paused = false,
  trackingLost = false,
  cameraSlot,
  onPause,
  onResume,
  onQuit,
}: GameHudProps) {
  const reduce = useReducedMotion();
  const plates = useAnimationControls();
  const timeLeft = Math.max(0, durationSec - elapsedSec);
  const remaining = durationSec > 0 ? timeLeft / durationSec : 0;
  useHotkey('Escape', paused ? onResume : onPause, !trackingLost);
  const eventId = lastEvent?.id;
  const kind = lastEvent?.kind;
  useEffect(() => {
    if (kind === 'hit' && !reduce)
      void plates.start({ x: [0, -6, 6, -3, 0], transition: { duration: 0.35 } });
  }, [eventId, kind, reduce, plates]);
  const progress = raceProgress(elapsedSec, durationSec);
  return (
    <div
      className="hud-root pointer-events-none absolute inset-0 overflow-hidden text-text"
      aria-label="Game HUD"
    >
      <motion.div animate={plates} className="hud-score hud-plate absolute left-6 top-6 px-7 py-4">
        <div className="flex items-center justify-between gap-5">
          <span className="eyebrow text-text-muted">SCORE</span>
          <motion.span
            key={stats.multiplier}
            initial={reduce ? false : { scale: 1.4 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className="rounded-md bg-lime px-3 py-1 font-display-italic text-title text-bg"
          >
            x{stats.multiplier}
          </motion.span>
        </div>
        <AnimatedNumber
          value={stats.score}
          fromZero={false}
          duration={0.1}
          className="block font-display-italic text-display-lg leading-none text-lime"
        />
        {stats.streak > 0 && (
          <div
            className={cn(
              'mt-2 flex items-center gap-2 font-display-italic text-title',
              stats.streak >= 10 ? 'text-magenta' : 'text-amber',
            )}
          >
            <Flame className="size-6" />
            {stats.streak} STREAK
          </div>
        )}
      </motion.div>
      <motion.div
        animate={plates}
        className="hud-clock hud-plate absolute right-6 top-6 w-[240px] px-6 py-4"
      >
        <div className="flex items-center justify-between">
          <span className="eyebrow text-text-muted">TIME LEFT</span>
          <Button
            variant="ghost"
            size="icon"
            title="Pause (Esc)"
            aria-label="Pause"
            onClick={onPause}
            disabled={paused || trackingLost}
            className="pointer-events-auto focus-ring"
          >
            <Pause />
            <span className="sr-only">ESC</span>
          </Button>
        </div>
        <div
          className={cn(
            'font-display-italic text-display-md',
            timeLeft <= 10 ? 'hud-clock-pulse text-danger' : 'text-text',
          )}
        >
          {formatTime(timeLeft)}
        </div>
        <div className="mt-3 flex gap-1" aria-label="Time remaining">
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              className={cn(
                'h-2 flex-1 -skew-x-12',
                remaining * 10 > i ? (timeLeft <= 10 ? 'bg-danger' : 'bg-lime') : 'bg-glass-strong',
              )}
            />
          ))}
        </div>
        <div className="mt-2 text-right">
          <KeyHint keyLabel="ESC" />
        </div>
      </motion.div>
      <div
        className="hud-race absolute text-lime"
        role="meter"
        aria-label="Race progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div className="hud-race-track relative h-2 rounded-full bg-lime/20">
          <div className="absolute inset-y-0 right-0 w-[10%] bg-amber/20" />
          <motion.div
            className="hud-race-fill absolute inset-y-0 left-0 rounded-full"
            initial={false}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: reduce ? 0 : 0.1, ease: 'linear' }}
          />
          <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
            {Array.from({ length: 11 }, (_, i) => (
              <span key={i} className="h-3 w-px bg-lime/85" />
            ))}
          </div>
          <motion.div
            className="hud-runner absolute top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-lime bg-bg shadow-glow-lime"
            initial={false}
            animate={{ left: `${progress * 100}%` }}
            transition={{ duration: reduce ? 0 : 0.1, ease: 'linear' }}
          >
            <PersonStanding className="size-8" />
          </motion.div>
          <div className="absolute -right-3 -top-9 flex flex-col items-center gap-1">
            <svg viewBox="0 0 28 30" aria-hidden="true" className="hud-finish-flag size-7">
              <path d="M4 29V2" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M5 2h20v16H5z" className="fill-text" />
              <path
                d="M5 2h5v4H5zM15 2h5v4h-5zM10 6h5v4h-5zM20 6h5v4h-5zM5 10h5v4H5zM15 10h5v4h-5zM10 14h5v4h-5zM20 14h5v4h-5z"
                className="fill-bg"
              />
            </svg>
            <span className="font-display text-caption text-text-muted">FINISH</span>
          </div>
        </div>
      </div>
      <AnimatePresence mode="wait">
        {cue && !paused && !trackingLost && (
          <motion.div
            key={cue.move}
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -18 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            className={cn(
              // Top band, under the race bar: the centre of the screen stays clear for the obstacles.
              'hud-cue absolute inset-x-6 top-[124px] flex items-center justify-center gap-5',
              ACCENT_TEXT[MOVE_ACCENTS[cue.move]],
            )}
          >
            <MoveFigure pose={cue.move} dashed size={90} className="hud-cue-figure shrink-0" />
            <span className="hud-cue-label hud-text-glow font-display-italic text-display-md">
              {hudCueLabel(cue.move)}
            </span>
            <ProgressRing
              value={cueProgress(cue.inSec)}
              size={72}
              thickness={5}
              accent={MOVE_ACCENTS[cue.move]}
              label="Move countdown"
            >
              <span className="font-display-italic text-[28px]">
                {cue.inSec <= 0 ? 'NOW!' : Math.ceil(cue.inSec)}
              </span>
            </ProgressRing>
          </motion.div>
        )}
      </AnimatePresence>
      {lastEvent && <Feedback key={lastEvent.id} event={lastEvent} />}
      {cameraSlot && (
        <div className="hud-camera absolute bottom-6 left-6 h-36 w-64 overflow-hidden rounded-2xl border border-lime/60">
          {cameraSlot}
          <span className="absolute left-3 top-3 rounded bg-lime px-2 font-display-italic text-caption text-bg">
            YOU
          </span>
        </div>
      )}
      <AnimatePresence>
        {(trackingLost || paused) && (
          <motion.div
            key={trackingLost ? 'tracking' : 'paused'}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            className="hud-overlay absolute inset-0 z-20 flex flex-col items-center justify-center gap-7 px-8 text-center"
          >
            {trackingLost ? (
              <>
                <div className="hud-guide-pulse text-amber">
                  {mode === 'treadmill' ? (
                    <BustOutline color="var(--na-amber)" className="h-36" />
                  ) : (
                    <MoveFigure pose="stand" color="var(--na-amber)" size={180} dashed />
                  )}
                </div>
                <h1 className="hud-tracking-title max-w-[1100px] font-display-italic text-display-lg text-amber">
                  STEP BACK INTO THE FRAME
                </h1>
                <p className="text-title text-text">The round is paused until we can see you.</p>
              </>
            ) : (
              <>
                <h1 className="hud-pause-title font-display-italic text-display-xl">PAUSED</h1>
                {/* Camera players only, readable from the 1.5 m mark (QA Q14). */}
                {cameraSlot && (
                  <p className="font-display-italic text-display-sm text-text">
                    Cross your arms to resume
                  </p>
                )}
                <GameButton
                  size="lg"
                  keyHint="ESC"
                  onClick={onResume}
                  className="pointer-events-auto"
                >
                  RESUME
                </GameButton>
                {onQuit && (
                  <GameButton
                    size="md"
                    variant="ghost"
                    onClick={onQuit}
                    className="pointer-events-auto"
                  >
                    END ROUND
                  </GameButton>
                )}
                <div className="mt-5 flex flex-wrap justify-center gap-6 text-caption text-text-muted">
                  {[
                    ['K', 'keyboard / camera'],
                    ['R', 'recalibrate'],
                    ['D', 'debug'],
                  ].map(([key, label]) => (
                    <span key={key} className="flex items-center gap-2">
                      <span className="font-display text-text">{key}</span>
                      {label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
