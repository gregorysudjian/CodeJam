import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Lightbulb, Play, Sparkles, Trophy } from "lucide-react";
import type { CoachAdvice, SessionConfig, SessionSummary } from "@/contracts";
import { Button } from "@/ui/components/ui/button";
import { Skeleton } from "@/ui/components/ui/skeleton";
import {
  AnimatedNumber,
  Eyebrow,
  GameButton,
  GlassPanel,
  MoveChip,
  MoveFigure,
  Screen,
  ScreenFooter,
  StatTile,
  ACCENT_TEXT,
  MOVE_ACCENTS,
  MOVE_LABELS,
  MOVE_ORDER,
  WORKOUT_ACCENTS,
  WORKOUT_LABELS,
  MODE_LABELS,
  useHotkey,
} from "@/ui/kit";
import { formatTime } from "@/ui/lib/format";
import { cn } from "@/ui/lib/utils";
import { accuracyGrade, mostMissed } from "@/ui/screens/resultsRules";

export interface ResultsScreenProps {
  summary: SessionSummary;
  advice: CoachAdvice | null;
  isPersonalBest?: boolean;
  rank?: number | null;
  handsFree?: boolean;
  onPlayAgain(): void;
  onStartNext(config: SessionConfig): void;
  onDashboard(): void;
  onLeaderboard?(): void;
}
/* A grade is ordinal, so it descends a single ramp: only the top grade earns
   the accent, the rest step down through the neutrals. Four different hues
   made S/A/B/C look like four categories rather than a ranking. */
const GRADE_COLOR = {
  S: "text-lime border-lime/50",
  A: "text-text border-line-strong",
  B: "text-text-muted border-line",
  C: "text-text-dim border-line",
};
export function ResultsScreen({
  summary,
  advice,
  isPersonalBest = false,
  rank,
  handsFree = false,
  onPlayAgain,
  onStartNext,
  onDashboard,
  onLeaderboard,
}: ResultsScreenProps) {
  const reduce = useReducedMotion();
  const grade = accuracyGrade(summary.accuracy);
  const missed = mostMissed(summary);
  const maxReps = Math.max(1, ...MOVE_ORDER.map((m) => summary.reps[m]));
  useHotkey("Enter", onPlayAgain);
  useHotkey(
    "n",
    () => {
      if (advice) onStartNext(advice.next);
    },
    advice !== null,
  );
  const footer = (
    <ScreenFooter
      className="results-footer"
      left={
        <GameButton variant="ghost" size="md" onClick={onDashboard}>
          DASHBOARD
        </GameButton>
      }
      right={
        <GameButton size="lg" leadingIcon={Play} keyHint="ENTER" onClick={onPlayAgain}>
          PLAY AGAIN
        </GameButton>
      }
    >
      {handsFree && (
        <div className="flex items-center justify-center gap-3 text-lime">
          <MoveFigure pose="armsUp" size={55} animate />
          <span className="font-display-italic text-[20px]">RAISE BOTH ARMS TO PLAY AGAIN</span>
        </div>
      )}
    </ScreenFooter>
  );
  return (
    <Screen backdrop="arena" className="results-screen polish-screen" footer={footer}>
      <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Eyebrow>
            ROUND COMPLETE · {WORKOUT_LABELS[summary.config.workout]} ·{" "}
            {MODE_LABELS[summary.config.mode]} · {summary.config.durationSec} S
          </Eyebrow>
          <div className="mt-6 flex items-center gap-6">
            <AnimatedNumber
              value={summary.score}
              className="results-score font-display-italic text-display-xl text-lime text-glow-lime"
            />
            <div
              className={cn(
                "hud-text-glow grid size-24 shrink-0 -rotate-6 place-items-center rounded-2xl border font-display-italic text-display-md",
                GRADE_COLOR[grade],
              )}
              aria-label={`Grade ${grade}`}
            >
              {grade}
            </div>
          </div>
          <p className="mt-2 text-caption text-text-muted">
            {formatTime(summary.activeSec)} ACTIVE
          </p>
          <div className="mt-5 flex min-h-8 flex-wrap items-center gap-5">
            {isPersonalBest && (
              <motion.span
                initial={reduce ? false : { opacity: 0, x: -35 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: reduce ? 0 : 0.45 }}
                className="flex items-center gap-2 bg-lime px-4 py-2 font-display-italic text-[22px] text-bg"
              >
                <Trophy className="size-5" />
                NEW PERSONAL BEST
              </motion.span>
            )}
            {rank != null &&
              rank > 0 &&
              (onLeaderboard ? (
                <Button
                  variant="ghost"
                  onClick={onLeaderboard}
                  className="focus-ring h-auto gap-2 text-caption text-cyan"
                >
                  <Trophy />#{rank} ON THE LEADERBOARD
                  <ArrowRight />
                </Button>
              ) : (
                <span className="flex items-center gap-2 text-caption text-cyan">
                  <Trophy className="size-5" />#{rank} ON THE LEADERBOARD
                </span>
              ))}
          </div>
          <div className="results-stats mt-8 grid grid-cols-3 gap-3">
            <StatTile label="BEST STREAK" value={summary.bestStreak} animate accent="magenta" />
            <StatTile
              label="ACCURACY"
              value={summary.accuracy * 100}
              format={(n) => `${Math.round(n)}%`}
              animate
              accent="cyan"
            />
            <StatTile
              label="CALORIES"
              value={summary.kcal}
              format={(n) => `≈ ${Math.round(n)}`}
              hint="KCAL · ESTIMATE"
              animate
              accent="amber"
            />
          </div>
          <section className="mt-8" aria-label="Reps breakdown">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <Eyebrow>YOUR MOVES</Eyebrow>
              {missed && (
                <span className="text-caption text-danger">
                  MOST MISSED: {MOVE_LABELS[missed]} ({summary.missed[missed]})
                </span>
              )}
            </div>
            <div className="space-y-3">
              {MOVE_ORDER.filter((m) => summary.reps[m] > 0 || summary.missed[m] > 0).map(
                (move, i) => (
                  <div
                    key={move}
                    className="grid grid-cols-[140px_minmax(0,1fr)_36px_88px] items-center gap-3"
                  >
                    <MoveChip move={move} size="sm" />
                    <div className="h-2 overflow-hidden rounded-full bg-glass-strong">
                      <motion.div
                        initial={reduce ? false : { scaleX: 0 }}
                        animate={{ scaleX: summary.reps[move] / maxReps }}
                        transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : i * 0.06 }}
                        className={cn(
                          "h-full origin-left bg-current",
                          ACCENT_TEXT[MOVE_ACCENTS[move]],
                        )}
                      />
                    </div>
                    <AnimatedNumber
                      value={summary.reps[move]}
                      className="text-right font-display-italic text-title"
                    />
                    <span className="text-right font-display-italic text-caption text-danger">
                      {summary.missed[move] > 0 ? `${summary.missed[move]} MISSED` : ""}
                    </span>
                  </div>
                ),
              )}
            </div>
          </section>
        </div>
        <GlassPanel
          as="aside"
          glow="lime"
          className="results-coach flex min-w-0 flex-col gap-5 p-6"
        >
          <div className="flex items-center justify-between">
            <Eyebrow className="flex items-center gap-2 text-lime">
              <Sparkles className="size-5" />
              YOUR COACH
            </Eyebrow>
            {advice && (
              <span
                className={cn(
                  "rounded-md border border-current px-2 py-1 font-display-italic text-caption",
                  advice.source === "ai" ? "text-lime" : "text-cyan",
                )}
              >
                {advice.source === "ai" ? "AI" : "RULES"}
              </span>
            )}
          </div>
          {advice ? (
            <>
              <p className="text-body leading-relaxed">{advice.recap}</p>
              <div className="flex items-start gap-3 border-y border-glass-border py-4">
                <Lightbulb className="mt-1 size-6 shrink-0 text-lime" />
                <p className="text-body text-text-muted">{advice.tip}</p>
              </div>
              <div
                className={cn(
                  "border-l-2 border-current pl-5",
                  ACCENT_TEXT[WORKOUT_ACCENTS[advice.next.workout]],
                )}
              >
                <Eyebrow>NEXT UP</Eyebrow>
                <div className="my-4 flex items-center gap-3">
                  <MoveFigure
                    pose={
                      advice.next.workout === "legs"
                        ? "squat"
                        : advice.next.workout === "arms"
                          ? "reachRight"
                          : advice.next.workout === "shoulders"
                            ? "armsUp"
                            : "jump"
                    }
                    size={95}
                  />
                  <h2 className="min-w-0 font-display-italic text-title">
                    {WORKOUT_LABELS[advice.next.workout]} · {MODE_LABELS[advice.next.mode]} ·{" "}
                    {advice.next.durationSec} S
                  </h2>
                </div>
                <p className="text-caption leading-relaxed text-text-muted">{advice.reason}</p>
              </div>
              <GameButton
                size="lg"
                variant="secondary"
                trailingIcon={ArrowRight}
                onClick={() => onStartNext(advice.next)}
                className="w-full px-4"
              >
                PLAY THIS NEXT
              </GameButton>
            </>
          ) : (
            <div role="status" className="flex min-h-[400px] flex-col gap-6">
              <p className="text-body text-text-muted">Your coach is reviewing the round…</p>
              <Skeleton className="coach-shimmer h-5 w-full" />
              <Skeleton className="coach-shimmer h-5 w-5/6" />
              <Skeleton className="coach-shimmer h-5 w-3/4" />
              <div className="my-6 border-t border-glass-border" />
              <Skeleton className="coach-shimmer h-24 w-full" />
              <Skeleton className="coach-shimmer mt-auto h-[72px] w-full" />
            </div>
          )}
          <p className="mt-auto text-caption text-text-muted">
            General fitness encouragement, not medical advice.
          </p>
        </GlassPanel>
      </div>
    </Screen>
  );
}
