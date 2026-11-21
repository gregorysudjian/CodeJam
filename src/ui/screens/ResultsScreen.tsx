import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Lightbulb, Play, Sparkles, Trophy } from 'lucide-react';
import type { CoachAdvice, SessionConfig, SessionSummary } from '@/contracts';
import { Button } from '@/ui/components/ui/button';
import { Skeleton } from '@/ui/components/ui/skeleton';
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
} from '@/ui/kit';
import { formatTime } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { accuracyGrade, mostMissed } from '@/ui/screens/resultsRules';

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
const GRADE_COLOR = {
  S: 'text-lime border-lime/50',
  A: 'text-cyan border-cyan/50',
  B: 'text-amber border-amber/50',
  C: 'text-text-muted border-glass-border',
};
const STAT_TILE = 'gap-2 p-5 short:p-3 tight:[&_.eyebrow]:tracking-normal';
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
  useHotkey('Enter', onPlayAgain);
  useHotkey(
    'n',
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
          {/* Read from the floor mark, about 1.5 m away (QA A1). */}
          <MoveFigure pose="armsUp" size={96} animate />
          <span className="font-display-italic text-display-sm">RAISE BOTH ARMS TO PLAY AGAIN</span>
        </div>
      )}
    </ScreenFooter>
  );
  return (
    <Screen backdrop="arena" className="results-screen polish-screen" footer={footer}>
      {/* One screen tall at 1280×720 and 1366×768 (QA Q5): badges sit beside the score, the
          active time on the eyebrow line, and `short:` / `tight:` shrink spacing, not text. */}
      <div className="grid items-start gap-10 short:gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <Eyebrow>
              ROUND COMPLETE · {WORKOUT_LABELS[summary.config.workout]} ·{' '}
              {MODE_LABELS[summary.config.mode]} · {summary.config.durationSec} S
            </Eyebrow>
            <span className="text-caption text-text-muted">
              {formatTime(summary.activeSec)} ACTIVE
            </span>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 short:mt-3">
            <AnimatedNumber
              value={summary.score}
              className="results-score font-display-italic text-display-xl text-lime text-glow-lime short:text-display-lg tight:text-display-md"
            />
            <div
              className={cn(
                'hud-text-glow grid size-24 shrink-0 -rotate-6 place-items-center rounded-2xl border font-display-italic text-display-md tight:size-16 tight:text-display-sm',
                GRADE_COLOR[grade],
              )}
              aria-label={`Grade ${grade}`}
            >
              {grade}
            </div>
            <div className="flex flex-col items-start gap-2 empty:hidden tight:flex-row tight:items-center">
              {/* tight: badge and rank share one row under the score instead of stacking. */}
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
                    className="focus-ring h-auto gap-2 px-2 text-caption text-cyan"
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
          </div>
          <div className="results-stats mt-6 grid grid-cols-3 gap-3 short:mt-4">
            <StatTile
              label="BEST STREAK"
              value={summary.bestStreak}
              animate
              accent="magenta"
              className={STAT_TILE}
            />
            <StatTile
              label="ACCURACY"
              value={summary.accuracy * 100}
              format={(n) => `${Math.round(n)}%`}
              animate
              accent="cyan"
              className={STAT_TILE}
            />
            <StatTile
              label="CALORIES (EST.)"
              value={summary.kcal}
              format={(n) => `≈ ${Math.round(n)}`}
              unit="KCAL"
              animate
              accent="amber"
              className={STAT_TILE}
            />
          </div>
          <section className="mt-6 short:mt-4" aria-label="Reps breakdown">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Eyebrow>YOUR MOVES</Eyebrow>
              {missed && (
                <span className="text-caption text-danger">
                  MOST MISSED: {MOVE_LABELS[missed]} ({summary.missed[missed]})
                </span>
              )}
            </div>
            {/* At 125–150 % scaling (tight) the rows go two by two and drop the bars. */}
            <div className="grid gap-1.5 tight:grid-cols-2 tight:gap-x-6">
              {MOVE_ORDER.filter((m) => summary.reps[m] > 0 || summary.missed[m] > 0).map(
                (move, i) => (
                  <div
                    key={move}
                    className="grid grid-cols-[140px_minmax(0,1fr)_36px_88px] items-center gap-3 tight:grid-cols-[140px_36px_minmax(0,1fr)]"
                  >
                    <MoveChip move={move} size="sm" />
                    <div className="h-2 overflow-hidden rounded-full bg-glass-strong tight:hidden">
                      <motion.div
                        initial={reduce ? false : { scaleX: 0 }}
                        animate={{ scaleX: summary.reps[move] / maxReps }}
                        transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : i * 0.06 }}
                        className={cn(
                          'h-full origin-left bg-current',
                          ACCENT_TEXT[MOVE_ACCENTS[move]],
                        )}
                      />
                    </div>
                    <AnimatedNumber
                      value={summary.reps[move]}
                      className="text-right font-display-italic text-title"
                    />
                    <span className="text-right font-display-italic text-caption text-danger">
                      {summary.missed[move] > 0 ? `${summary.missed[move]} MISSED` : ''}
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
          className="results-coach flex min-w-0 flex-col gap-5 p-6 short:gap-4 short:p-5"
        >
          <div className="flex items-center justify-between">
            <Eyebrow className="flex items-center gap-2 text-lime">
              <Sparkles className="size-5" />
              YOUR COACH
            </Eyebrow>
            {advice && (
              <span
                className={cn(
                  'rounded-md border border-current px-2 py-1 font-display-italic text-caption',
                  advice.source === 'ai' ? 'text-lime' : 'text-cyan',
                )}
              >
                {advice.source === 'ai' ? 'AI' : 'RULES'}
              </span>
            )}
          </div>
          {advice ? (
            <>
              <p className="text-body leading-relaxed">{advice.recap}</p>
              <div className="flex items-start gap-3 border-y border-glass-border py-4 short:py-3">
                <Lightbulb className="mt-1 size-6 shrink-0 text-lime" />
                <p className="text-body text-text-muted">{advice.tip}</p>
              </div>
              <div
                className={cn(
                  'border-l-2 border-current pl-5',
                  ACCENT_TEXT[WORKOUT_ACCENTS[advice.next.workout]],
                )}
              >
                <Eyebrow>NEXT UP</Eyebrow>
                <div className="my-3 flex items-center gap-3 short:my-1">
                  <MoveFigure
                    pose={
                      advice.next.workout === 'legs'
                        ? 'squat'
                        : advice.next.workout === 'arms'
                          ? 'reachRight'
                          : advice.next.workout === 'shoulders'
                            ? 'armsUp'
                            : 'jump'
                    }
                    size={72}
                  />
                  <h2 className="min-w-0 font-display-italic text-title">
                    {WORKOUT_LABELS[advice.next.workout]} · {MODE_LABELS[advice.next.mode]} ·{' '}
                    {advice.next.durationSec}&nbsp;S
                  </h2>
                </div>
                <p className="text-caption leading-relaxed text-text-muted">{advice.reason}</p>
              </div>
              <GameButton
                size="lg"
                variant="secondary"
                trailingIcon={ArrowRight}
                onClick={() => onStartNext(advice.next)}
                className="w-full px-4 short:h-14"
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
