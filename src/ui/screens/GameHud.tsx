import { memo, useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { Flame, Pause } from "lucide-react";
import type { LiveStats, MoveType, PlayMode } from "@/contracts";
import { Button } from "@/ui/components/ui/button";
import {
  AnimatedNumber,
  BustOutline,
  GameButton,
  KeyHint,
  MoveChip,
  MoveFigure,
  ProgressRing,
  ACCENT_TEXT,
  MOVE_ACCENTS,
  MOVE_LABELS,
  MOVE_ORDER,
  useHotkey,
} from "@/ui/kit";
import { formatTime } from "@/ui/lib/format";
import { cn } from "@/ui/lib/utils";
import { cueProgress } from "@/ui/screens/resultsRules";

export interface GameHudProps {
  stats: LiveStats;
  elapsedSec: number;
  durationSec: number;
  mode: PlayMode;
  cue?: { move: MoveType; inSec: number } | null;
  lastEvent?: {
    kind: "cleared" | "hit" | "collected";
    move: MoveType;
    points: number;
    id: number;
  } | null;
  paused?: boolean;
  trackingLost?: boolean;
  cameraSlot?: ReactNode;
  onPause(): void;
  onResume(): void;
}
type FeedbackEvent = NonNullable<GameHudProps["lastEvent"]>;
const Feedback = memo(
  function Feedback({ event }: { event: FeedbackEvent }) {
    const reduce = useReducedMotion();
    const tone =
      event.kind === "hit"
        ? "text-danger"
        : event.kind === "collected"
          ? "text-violet"
          : "text-lime";
    return (
      <div data-feedback-id={event.id}>
        {!reduce && event.kind !== "collected" && (
          <motion.div
            className={cn("hud-vignette absolute inset-0", tone)}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.75, 0] }}
            transition={{ duration: 0.6 }}
          />
        )}
        <motion.div
          className={cn(
            "absolute inset-x-0 top-[68%] text-center font-display-italic text-display-sm",
            tone,
          )}
          initial={{ opacity: 1, y: 0 }}
          animate={{ opacity: [1, 1, 0], y: reduce ? 0 : -55 }}
          transition={{ duration: 0.65, times: [0, 0.65, 1] }}
        >
          {event.kind === "hit"
            ? "MISS"
            : `+${event.points}${event.kind === "collected" ? " ORB" : ""}`}
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
}: GameHudProps) {
  const reduce = useReducedMotion();
  const plates = useAnimationControls();
  const timeLeft = Math.max(0, durationSec - elapsedSec);
  const remaining = durationSec > 0 ? timeLeft / durationSec : 0;
  useHotkey("Escape", paused ? onResume : onPause, !trackingLost);
  const eventId = lastEvent?.id;
  const kind = lastEvent?.kind;
  useEffect(() => {
    if (kind === "hit" && !reduce)
      void plates.start({ x: [0, -6, 6, -3, 0], transition: { duration: 0.35 } });
  }, [eventId, kind, reduce, plates]);
  const reps =
    mode === "floor"
      ? MOVE_ORDER
      : MOVE_ORDER.filter((m) => m === "armsUp" || m === "reachLeft" || m === "reachRight");
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
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
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
              "mt-2 flex items-center gap-2 font-display-italic text-title",
              stats.streak >= 10 ? "text-magenta" : "text-amber",
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
            "font-display-italic text-display-md",
            timeLeft <= 10 ? "hud-clock-pulse text-danger" : "text-text",
          )}
        >
          {formatTime(timeLeft)}
        </div>
        <div className="mt-3 flex gap-1" aria-label="Time remaining">
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-2 flex-1 -skew-x-12",
                remaining * 10 > i ? (timeLeft <= 10 ? "bg-danger" : "bg-lime") : "bg-glass-strong",
              )}
            />
          ))}
        </div>
        <div className="mt-2 text-right">
          <KeyHint keyLabel="ESC" />
        </div>
      </motion.div>
      <AnimatePresence mode="wait">
        {cue && !paused && !trackingLost && (
          <motion.div
            key={cue.move}
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -18 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            className={cn(
              "hud-cue absolute inset-x-6 top-[40%] flex items-center justify-center gap-8",
              ACCENT_TEXT[MOVE_ACCENTS[cue.move]],
            )}
          >
            <MoveFigure pose={cue.move} dashed size={180} className="hud-cue-figure shrink-0" />
            <span className="hud-cue-label hud-text-glow font-display-italic text-display-xl">
              {MOVE_LABELS[cue.move]}
            </span>
            <ProgressRing
              value={cueProgress(cue.inSec)}
              size={120}
              thickness={7}
              accent={MOVE_ACCENTS[cue.move]}
              label="Move countdown"
            >
              <span className="font-display-italic text-display-sm">
                {cue.inSec <= 0 ? "NOW!" : Math.ceil(cue.inSec)}
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
      <div
        className={cn(
          "hud-reps absolute bottom-7 flex flex-wrap justify-center gap-2",
          cameraSlot ? "hud-reps-camera right-6" : "left-1/2 -translate-x-1/2",
        )}
      >
        {reps.map((move) => (
          <div key={move} className="flex items-center gap-1">
            <MoveChip move={move} size="sm" />
            <span className="min-w-6 font-display-italic text-title tabular-nums">
              {stats.reps[move]}
            </span>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {(trackingLost || paused) && (
          <motion.div
            key={trackingLost ? "tracking" : "paused"}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            className="hud-overlay absolute inset-0 z-20 flex flex-col items-center justify-center gap-7 px-8 text-center"
          >
            {trackingLost ? (
              <>
                <div className="hud-guide-pulse text-amber">
                  {mode === "treadmill" ? (
                    <BustOutline color="var(--na-amber)" className="h-36" />
                  ) : (
                    <MoveFigure pose="stand" color="var(--na-amber)" size={180} dashed />
                  )}
                </div>
                <h1 className="hud-tracking-title max-w-[1100px] font-display-italic text-display-lg text-amber">
                  STEP BACK INTO THE FRAME
                </h1>
                <p className="text-caption text-text-muted">
                  The round is paused until we can see you.
                </p>
              </>
            ) : (
              <>
                <h1 className="hud-pause-title font-display-italic text-display-xl">PAUSED</h1>
                <GameButton
                  size="lg"
                  keyHint="ESC"
                  onClick={onResume}
                  className="pointer-events-auto"
                >
                  RESUME
                </GameButton>
                <div className="mt-5 flex flex-wrap justify-center gap-6 text-caption text-text-muted">
                  {[
                    ["K", "keyboard / camera"],
                    ["R", "recalibrate"],
                    ["D", "debug"],
                  ].map(([key, label]) => (
                    <span key={key} className="flex items-center gap-2">
                      <KeyHint keyLabel={key ?? ""} />
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
