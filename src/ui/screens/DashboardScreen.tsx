import { Button } from '@/ui/components/ui/button';
import { useState } from 'react';
import {
  CloudOff,
  Dumbbell,
  Edit3,
  Flame,
  Footprints,
  HeartPulse,
  Play,
  Trophy,
} from 'lucide-react';
import type { CoachAdvice, Profile, SavedSession, SessionConfig } from '@/contracts';
import {
  AnimatedNumber,
  Eyebrow,
  GameButton,
  GlassPanel,
  CoachBanner,
  ScreenFooter,
  MoveFigure,
  ProgressRing,
  Screen,
  ROUND_SEC,
  SectionTitle,
  WORKOUT_ACCENTS,
  WORKOUT_LABELS,
  MODE_LABELS,
  ACCENT_TEXT,
  useHotkey,
} from '@/ui/kit';
import { cn } from '@/ui/lib/utils';
import { DashboardCharts } from '@/ui/screens/DashboardCharts';
import {
  DAY_LABELS,
  DAY_NAMES,
  dayStreak,
  localDay,
  repsByMove,
  sessionTime,
  shiftDay,
  thisWeek,
  totals,
  weekDays,
  weeklyActiveMinutes,
  weekStart,
} from '@/ui/screens/dashboardStats';
import { accuracyGrade } from '@/ui/screens/resultsRules';

export interface DashboardScreenProps {
  profile: Profile;
  sessions: SavedSession[];
  coachPick?: CoachAdvice | null;
  now?: number;
  onPlay(): void;
  onPlayCoachPick?(config: SessionConfig): void;
  onLeaderboard(): void;
  onEditProfile?(): void;
}
const GOALS = {
  getMoving: { label: 'GET MOVING', icon: Footprints },
  buildStrength: { label: 'BUILD STRENGTH', icon: Dumbbell },
  cardio: { label: 'CARDIO', icon: HeartPulse },
};
const GRADE_TONE = {
  S: 'text-lime border-lime/50 bg-lime/10',
  A: 'text-cyan border-cyan/50 bg-cyan/10',
  B: 'text-amber border-amber/50 bg-amber/10',
  C: 'text-text-muted border-glass-border bg-glass-strong',
};
/** Room for a fixed NavBar: it sets --app-nav-height on :root; until then this is 0. */
const NAV_ROOM = { paddingTop: 'var(--app-nav-height, 0px)' };
export function DashboardScreen({
  profile,
  sessions,
  coachPick,
  now: suppliedNow,
  onPlay,
  onPlayCoachPick,
  onLeaderboard,
  onEditProfile,
}: DashboardScreenProps) {
  const [initialNow] = useState(() => Date.now());
  const now = suppliedNow ?? initialNow;
  const min = weeklyActiveMinutes(sessions, now);
  const goal = profile.weeklyGoalMin;
  const remaining = Math.max(0, goal - min);
  const streak = dayStreak(sessions, now);
  // Everything under "YOUR WEEK" is Monday to now; only RECENT ROUNDS counts all time.
  const total = totals(sessions);
  const week = thisWeek(sessions, now);
  const weekTotal = totals(week);
  const playedDays = new Set(sessions.filter((s) => s.at <= now).map((s) => localDay(s.at)));
  const GoalIcon = GOALS[profile.goal].icon;
  const history = sessions.slice(0, 8);
  useHotkey('Enter', onPlay);
  useHotkey('l', onLeaderboard);
  useHotkey(
    'c',
    () => {
      if (coachPick && onPlayCoachPick) onPlayCoachPick(coachPick.next);
    },
    Boolean(coachPick && onPlayCoachPick),
  );
  return (
    <Screen
      backdrop="arena"
      className="dashboard-screen polish-screen"
      style={NAV_ROOM}
      footer={
        sessions.length > 0 ? (
          <ScreenFooter
            left={
              <GameButton variant="ghost" size="md" leadingIcon={Trophy} onClick={onLeaderboard}>
                LEADERBOARD
              </GameButton>
            }
            right={
              <GameButton size="lg" leadingIcon={Play} keyHint="ENTER" onClick={onPlay}>
                PLAY
              </GameButton>
            }
          />
        ) : null
      }
    >
      {sessions.length > 0 && (
        <SectionTitle
          as="h1"
          size="lg"
          eyebrow="YOUR WEEK"
          title={
            <span className="break-words">
              WELCOME BACK, <span className="text-lime">{profile.displayName}</span>
              {onEditProfile && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Edit profile"
                  aria-label="Edit profile"
                  onClick={onEditProfile}
                  className="ml-3 align-middle text-text-muted"
                >
                  <Edit3 className="size-5" />
                </Button>
              )}
            </span>
          }
          right={
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/10 px-4 py-2 font-display-italic text-[20px] text-cyan">
                <GoalIcon className="size-5" />
                {GOALS[profile.goal].label}
              </span>
            </div>
          }
        />
      )}
      {sessions.length === 0 ? (
        <div className="dashboard-empty flex items-center justify-center">
          <GlassPanel
            padding="none"
            className="flex w-full max-w-[560px] flex-col items-center gap-5 p-8 text-center tight:gap-2 tight:p-4 md:p-10 md:tight:p-4"
          >
            <h1 className="font-display-italic text-title text-text-muted">
              WELCOME, <span className="text-lime">{profile.displayName}</span>
            </h1>
            <MoveFigure pose="jump" size={140} />
            <h2 className="font-display-italic text-display-sm">NO ROUNDS YET</h2>
            <p className="text-body text-text-muted">
              Your first round takes {ROUND_SEC / 60} minutes.
            </p>
            <GameButton size="lg" keyHint="ENTER" onClick={onPlay} leadingIcon={Play}>
              PLAY NOW
            </GameButton>
            <GameButton variant="ghost" size="md" onClick={onLeaderboard} leadingIcon={Trophy}>
              LEADERBOARD
            </GameButton>
          </GlassPanel>
        </div>
      ) : (
        // One child of Screen, so the column gap has to be set here.
        <div className="flex flex-col gap-6">
          {/* One solid card for the week: goal ring, streak, then the three week totals. */}
          <GlassPanel
            as="section"
            aria-label="This week"
            padding="none"
            className="grid items-center gap-x-10 gap-y-6 p-6 md:grid-cols-[auto_minmax(0,1fr)] md:p-8 xl:grid-cols-[auto_minmax(0,1fr)_minmax(0,0.9fr)]"
          >
            <section className="flex flex-col items-center gap-3" aria-label="Weekly goal">
              <ProgressRing
                value={goal > 0 ? min / goal : 1}
                size={190}
                thickness={10}
                label="Weekly active minutes"
              >
                <div>
                  <AnimatedNumber
                    value={min}
                    className="font-display-italic text-display-sm text-lime"
                  />
                  <p className="mt-1 font-display-italic text-[22px] text-text-muted">
                    / {goal} MIN
                  </p>
                </div>
              </ProgressRing>
              <p
                className={cn(
                  'font-display-italic text-[26px]',
                  remaining === 0 ? 'text-lime' : 'text-text-muted',
                )}
              >
                {remaining === 0 ? 'GOAL SMASHED' : `${remaining} MIN TO GO`}
              </p>
            </section>
            <section className="min-w-0" aria-label="Day streak">
              <Eyebrow accent="muted">DAY STREAK</Eyebrow>
              <div className="my-3 flex items-center gap-4">
                <Flame className="size-12 shrink-0 text-magenta" />
                <AnimatedNumber
                  value={streak}
                  className="font-display-italic text-display-lg text-magenta"
                />
                <span className="self-end pb-3 font-display-italic text-title text-text-muted">
                  {streak === 1 ? 'DAY' : 'DAYS'}
                </span>
              </div>
              <div className="flex max-w-[360px] justify-between gap-2">
                {Array.from({ length: 7 }, (_, i) => {
                  const date = shiftDay(weekStart(now), i);
                  const played = playedDays.has(date);
                  const today = date === localDay(now);
                  return (
                    <div
                      key={date}
                      className="flex flex-col items-center gap-2"
                      aria-label={`${DAY_NAMES[new Date(date).getDay()]}${played ? ', played' : ', no round'}${today ? ', today' : ''}`}
                    >
                      <span
                        className={cn(
                          'grid size-7 place-items-center rounded-full border-2',
                          played ? 'border-lime bg-lime' : 'border-glass-border bg-glass-strong',
                          today && 'outline-2 outline-offset-3 outline-text',
                        )}
                      />
                      <span
                        className={cn(
                          'font-display text-caption font-semibold',
                          today ? 'text-text' : 'text-text-muted',
                        )}
                      >
                        {DAY_LABELS[new Date(date).getDay()]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
            <dl className="grid gap-x-6 border-glass-border max-xl:border-t max-xl:pt-5 sm:grid-cols-3 md:col-span-2 xl:col-span-1 xl:grid-cols-1 xl:border-l xl:pl-10">
              {(
                [
                  { label: 'ROUNDS THIS WEEK', value: weekTotal.sessions, tone: 'text-cyan' },
                  { label: 'REPS THIS WEEK', value: weekTotal.reps, tone: 'text-lime' },
                  {
                    label: 'CALORIES THIS WEEK',
                    hint: 'KCAL · ESTIMATE',
                    value: weekTotal.kcal,
                    tone: 'text-amber',
                    format: (n: number) => `≈ ${Math.round(n)}`,
                  },
                ] as const
              ).map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center justify-between gap-4 border-glass-border py-3 xl:border-b xl:last:border-b-0"
                >
                  <div className="min-w-0">
                    <dt className="eyebrow text-text-muted">{stat.label}</dt>
                    {'hint' in stat && (
                      <p className="mt-1 text-caption text-text-dim">{stat.hint}</p>
                    )}
                  </div>
                  <dd
                    className={cn(
                      'font-display-italic text-[44px] leading-none whitespace-nowrap tabular-nums',
                      stat.tone,
                    )}
                  >
                    {'format' in stat ? (
                      <AnimatedNumber value={stat.value} format={stat.format} />
                    ) : (
                      <AnimatedNumber value={stat.value} />
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </GlassPanel>
          <DashboardCharts
            days={weekDays(sessions, now)}
            reps={repsByMove(week)}
            weeklyGoalMin={goal}
            now={now}
          />
          {coachPick && (
            <GlassPanel padding="none" className="px-5 md:px-6 [&_.coach-banner]:border-0">
              <CoachBanner
                advice={coachPick}
                {...(onPlayCoachPick ? { onPlay: onPlayCoachPick } : {})}
              />
            </GlassPanel>
          )}
          <GlassPanel
            as="section"
            padding="none"
            aria-label="Session history"
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 md:px-6">
              <SectionTitle title="RECENT ROUNDS" size="sm" />
              <span className="text-caption text-text-muted">
                {total.sessions} {total.sessions === 1 ? 'round' : 'rounds'} · Best{' '}
                {total.bestScore.toLocaleString('en-US')}
              </span>
            </div>
            <div role="list">
              {history.map((session) => {
                const grade = accuracyGrade(session.accuracy);
                return (
                  <div
                    key={session.id}
                    role="listitem"
                    tabIndex={0}
                    className="focus-ring grid gap-3 border-t border-glass-border px-5 py-4 transition-colors hover:bg-glass-strong/50 focus-visible:bg-glass-strong/50 md:grid-cols-[190px_minmax(0,1fr)_60px_110px_40px_135px] md:items-center md:px-6"
                  >
                    <span className="font-display text-[20px] font-semibold text-text-muted">
                      {sessionTime(session.at, now)}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'rounded-md border border-current px-2 py-1 font-display-italic text-[20px]',
                          ACCENT_TEXT[WORKOUT_ACCENTS[session.config.workout]],
                        )}
                      >
                        {WORKOUT_LABELS[session.config.workout]}
                      </span>
                      <span className="rounded-md bg-glass-strong px-2 py-1.5 font-display-italic text-caption text-text-muted">
                        {MODE_LABELS[session.config.mode]}
                      </span>
                    </span>
                    <span className="font-display text-[20px] text-text-muted">
                      {session.config.durationSec} S
                    </span>
                    <span className="font-display-italic text-title tabular-nums text-text">
                      {session.score.toLocaleString('en-US')}
                    </span>
                    <span
                      className={cn(
                        'grid size-9 place-items-center rounded-md border font-display-italic text-[24px]',
                        GRADE_TONE[grade],
                      )}
                    >
                      {grade}
                    </span>
                    <span>
                      {!session.synced && (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber/30 px-2 py-1 font-display-italic text-caption text-amber">
                          <CloudOff className="size-4" />
                          NOT SYNCED
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </GlassPanel>
        </div>
      )}
    </Screen>
  );
}
