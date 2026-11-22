import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Flag, HeartCrack, Lightbulb, Play, Sparkles, Trophy } from 'lucide-react';
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
  NavBar,
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
  TIER_LABELS,
  asRound,
  tierOf,
  useHotkey,
  type NavBarProps,
} from '@/ui/kit';
import { formatTime } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { accuracyGrade, mostMissed, roundHeadline } from '@/ui/screens/resultsRules';

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
  /** The nav bar on top (current: null, results is no nav item); absent: no bar, as before. */
  nav?: NavBarProps;
}
// A solid stamp: the grade's colour as text, edge and a light wash (no neon glow).
const GRADE_COLOR = {
  S: 'text-lime border-lime/50 bg-lime/[0.07]',
  A: 'text-cyan border-cyan/50 bg-cyan/[0.07]',
  B: 'text-amber border-amber/50 bg-amber/[0.07]',
  C: 'text-text-muted border-glass-border bg-glass-strong',
};
const STAT_TILE = 'gap-2 p-5 short:p-3 tight:gap-1 tight:[&_.eyebrow]:tracking-normal';
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
  nav,
}: ResultsScreenProps) {
  const reduce = useReducedMotion();
  const grade = accuracyGrade(summary.accuracy);
  const missed = mostMissed(summary);
  const maxReps = Math.max(1, ...MOVE_ORDER.map((m) => summary.reps[m]));
  const headline = roundHeadline(summary);
  useHotkey('Enter', onPlayAgain);
  useHotkey(
    'n',
    () => {
      if (advice) onStartNext(asRound(advice.next));
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
      {/* Under 600 px tall (1024×576, 125 %) the bar gives way: PLAY THIS NEXT stays above the
          footer, and the footer has DASHBOARD and PLAY AGAIN. */}
      {nav && <NavBar {...nav} className="[@media(max-height:600px)]:hidden" />}
      {/* One screen tall at 1280×720 and 1366×768 (QA Q5): badges sit beside the score, the
          active time on the eyebrow line, and `short:` / `tight:` shrink spacing, not text (except the coach's
          copy at 125 %, whose length varies: 17 px there). */}
      <div className="grid items-start gap-10 short:gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1
                className={cn(
                  'results-headline flex items-center gap-2 self-center font-display-italic text-title',
                  headline.outOfLives ? 'text-amber' : 'text-lime',
                )}
              >
                {headline.outOfLives ? (
                  <HeartCrack aria-hidden="true" className="size-7" />
                ) : (
                  <Flag aria-hidden="true" className="size-7" />
                )}
                {headline.text}
              </h1>
              <Eyebrow className="text-text-muted tight:hidden">
                {WORKOUT_LABELS[summary.config.workout]} · {MODE_LABELS[summary.config.mode]} ·{' '}
                {TIER_LABELS[tierOf(summary.config.difficulty)]}
              </Eyebrow>
            </div>
            <span className="text-caption text-text-muted">
              {formatTime(summary.activeSec)} ACTIVE
            </span>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 short:mt-3 tight:gap-y-2">
            <AnimatedNumber
              value={summary.score}
              className="results-score font-display-italic text-display-xl text-lime text-glow-lime short:text-display-lg tight:text-display-md"
            />
            <div
              className={cn(
                'grid size-24 shrink-0 -rotate-6 place-items-center rounded-2xl border-2 font-display-italic text-display-md tight:size-16 tight:text-display-sm',
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
                  className="flex items-center gap-2 bg-lime px-4 py-2 font-display-italic text-[22px] text-bg tight:py-1"
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
          <div className="results-stats mt-6 grid grid-cols-3 gap-3 short:mt-4 tight:mt-3">
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
          <section className="mt-6 short:mt-4 tight:mt-3" aria-label="Reps breakdown">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 tight:mb-2">
              <Eyebrow>YOUR MOVES</Eyebrow>
              {missed && (
                <span className="text-caption text-danger">
                  MOST MISSED: {MOVE_LABELS[missed]} ({summary.missed[missed]})
                </span>
              )}
            </div>
            {/* At 125–150 % scaling (tight) the rows go two by two and drop the bars. */}
            <div className="grid gap-1.5 tight:grid-cols-2 tight:gap-x-6 tight:gap-y-1">
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
          // short: tighter, so PLAY THIS NEXT stays above the footer at 1280×720 under the nav bar.
          className="results-coach flex min-w-0 flex-col gap-5 p-6 short:gap-3 short:p-4 tight:gap-3 tight:p-4"
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
              <p className="text-body leading-relaxed short:leading-normal tight:text-[17px] tight:leading-snug">
                {advice.recap}
              </p>
              <div className="flex items-start gap-3 border-y border-glass-border py-4 short:py-2">
                <Lightbulb className="mt-1 size-6 shrink-0 text-lime" />
                <p className="text-body text-text-muted tight:text-[17px] tight:leading-snug">
                  {advice.tip}
                </p>
              </div>
              <div
                className={cn(
                  'border-l-2 border-current pl-5',
                  ACCENT_TEXT[WORKOUT_ACCENTS[advice.next.workout]],
                )}
              >
                <Eyebrow>NEXT UP</Eyebrow>
                <div className="my-3 flex items-center gap-3 short:my-1 tight:my-0.5">
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
                    className="short:hidden"
                  />
                  <h2 className="min-w-0 font-display-italic text-title">
                    {WORKOUT_LABELS[advice.next.workout]} · {MODE_LABELS[advice.next.mode]} ·{' '}
                    {TIER_LABELS[tierOf(advice.next.difficulty)]}
                  </h2>
                </div>
                {/* tight (125 % scaling): hidden, so PLAY THIS NEXT stays above the footer under the nav bar. */}
                <p className="text-caption leading-relaxed text-text-muted tight:hidden">
                  {advice.reason}
                </p>
                {/* AI coach only (optional): the rest of today's session. Hidden where reason is. */}
                {advice.plan && (
                  <p className="line-clamp-3 text-caption leading-relaxed text-text tight:hidden">
                    {advice.plan}
                  </p>
                )}
              </div>
              <GameButton
                size="lg"
                variant="secondary"
                trailingIcon={ArrowRight}
                onClick={() => onStartNext(asRound(advice.next))}
                className="w-full px-4 short:h-14 tight:h-12"
              >
                PLAY THIS NEXT
              </GameButton>
            </>
          ) : (
            <div
              role="status"
              className="flex min-h-[400px] flex-col gap-6 short:min-h-[310px] short:gap-4 tight:min-h-0 tight:gap-3"
            >
              <p className="text-body text-text-muted">Your coach is reviewing the round…</p>
              <Skeleton className="coach-shimmer h-5 w-full" />
              <Skeleton className="coach-shimmer h-5 w-5/6" />
              <Skeleton className="coach-shimmer h-5 w-3/4" />
              <div className="my-6 border-t border-glass-border short:my-2" />
              <Skeleton className="coach-shimmer h-24 w-full tight:h-10" />
              <Skeleton className="coach-shimmer mt-auto h-[72px] w-full short:h-14 tight:h-12" />
            </div>
          )}
          <p className="mt-auto text-caption text-text-muted tight:text-[13px] tight:leading-snug">
            General fitness encouragement, not medical advice.
          </p>
        </GlassPanel>
      </div>
    </Screen>
  );
}
