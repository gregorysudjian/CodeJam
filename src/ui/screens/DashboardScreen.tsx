import { useState } from "react";
import {
  CloudOff,
  Dumbbell,
  Edit3,
  Flame,
  Footprints,
  HeartPulse,
  Play,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { CoachAdvice, Profile, SavedSession, SessionConfig } from "@/contracts";
import {
  AnimatedNumber,
  EmptyState,
  Eyebrow,
  GameButton,
  GlassPanel,
  MoveFigure,
  ProgressRing,
  Screen,
  SectionTitle,
  StatTile,
  WORKOUT_ACCENTS,
  WORKOUT_LABELS,
  MODE_LABELS,
  ACCENT_TEXT,
  useHotkey,
} from "@/ui/kit";
import { cn } from "@/ui/lib/utils";
import { DashboardCharts } from "@/ui/screens/DashboardCharts";
import {
  DAY_LABELS,
  dayStreak,
  last7Days,
  localDay,
  repsByMove,
  sessionTime,
  shiftDay,
  totals,
  weeklyActiveMinutes,
  weekStart,
} from "@/ui/screens/dashboardStats";
import { accuracyGrade } from "@/ui/screens/resultsRules";

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
  getMoving: { label: "GET MOVING", icon: Footprints },
  buildStrength: { label: "BUILD STRENGTH", icon: Dumbbell },
  cardio: { label: "CARDIO", icon: HeartPulse },
};
const GRADE_TONE = {
  S: "text-lime border-lime/40",
  A: "text-cyan border-cyan/40",
  B: "text-amber border-amber/40",
  C: "text-text-muted border-glass-border",
};
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
  const total = totals(sessions);
  const roundsThisWeek = sessions.filter((s) => s.at >= weekStart(now) && s.at <= now).length;
  const playedDays = new Set(sessions.filter((s) => s.at <= now).map((s) => localDay(s.at)));
  const GoalIcon = GOALS[profile.goal].icon;
  const history = sessions.slice(0, 8);
  useHotkey("Enter", onPlay);
  useHotkey("l", onLeaderboard);
  useHotkey(
    "c",
    () => {
      if (coachPick && onPlayCoachPick) onPlayCoachPick(coachPick.next);
    },
    Boolean(coachPick && onPlayCoachPick),
  );
  return (
    <Screen backdrop="arena" className="dashboard-screen">
      <SectionTitle
        as="h1"
        size="lg"
        eyebrow="YOUR WEEK"
        title={
          <span className="break-words">
            WELCOME BACK, <span className="text-lime">{profile.displayName}</span>
          </span>
        }
        right={
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/10 px-4 py-2 font-display-italic text-[20px] text-cyan">
              <GoalIcon className="size-5" />
              {GOALS[profile.goal].label}
            </span>
            {onEditProfile && (
              <GameButton variant="ghost" size="md" leadingIcon={Edit3} onClick={onEditProfile}>
                EDIT PROFILE
              </GameButton>
            )}
          </div>
        }
      />
      {sessions.length === 0 ? (
        <div className="flex min-h-[440px] flex-col items-center justify-center">
          <MoveFigure pose="jump" size={160} />
          <EmptyState
            icon={Footprints}
            title="NO ROUNDS YET"
            body="Your first round takes 90 seconds."
            action={
              <GameButton size="lg" onClick={onPlay} leadingIcon={Play}>
                PLAY NOW
              </GameButton>
            }
            className="pt-6"
          />
        </div>
      ) : (
        <>
          <div className="grid items-center gap-8 border-y border-glass-border py-7 md:grid-cols-2 xl:grid-cols-[230px_260px_minmax(0,1fr)]">
            <section className="flex flex-col items-center gap-4" aria-label="Weekly goal">
              <ProgressRing
                value={goal > 0 ? min / goal : 1}
                size={200}
                thickness={9}
                label="Weekly active minutes"
              >
                <div>
                  <AnimatedNumber
                    value={min}
                    className="font-display-italic text-display-sm text-lime"
                  />
                  <p className="mt-2 font-display-italic text-[24px] text-text-muted">
                    / {goal} MIN
                  </p>
                </div>
              </ProgressRing>
              <p
                className={cn(
                  "font-display-italic text-title",
                  remaining === 0 ? "text-lime text-glow-lime" : "text-text-muted",
                )}
              >
                {remaining === 0 ? "GOAL SMASHED" : `${remaining} MIN TO GO`}
              </p>
            </section>
            <section className="min-w-0" aria-label="Day streak">
              <Eyebrow accent="muted">DAY STREAK</Eyebrow>
              <div className="my-3 flex items-center gap-4">
                <Flame className="size-12 text-magenta" />
                <AnimatedNumber
                  value={streak}
                  className="font-display-italic text-display-lg text-magenta"
                />
                <span className="self-end pb-3 font-display-italic text-title text-text-muted">
                  DAYS
                </span>
              </div>
              <div className="flex justify-between gap-2">
                {Array.from({ length: 7 }, (_, i) => {
                  const date = shiftDay(weekStart(now), i);
                  const played = playedDays.has(date);
                  const today = date === localDay(now);
                  return (
                    <div
                      key={date}
                      className="flex flex-col items-center gap-2"
                      aria-label={`${DAY_LABELS[new Date(date).getDay()]}${played ? ", played" : ", no round"}${today ? ", today" : ""}`}
                    >
                      <span
                        className={cn(
                          "grid size-6 place-items-center rounded-full border",
                          played
                            ? "border-lime bg-lime shadow-glow-lime"
                            : "border-glass-border bg-glass-strong",
                          today && "outline-2 outline-offset-4 outline-lime",
                        )}
                      />
                      <span className="font-display text-caption text-text-muted">
                        {DAY_LABELS[new Date(date).getDay()]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
            <div className="grid gap-3 md:col-span-2 md:grid-cols-3 xl:col-span-1">
              <StatTile
                label="ROUNDS THIS WEEK"
                value={roundsThisWeek}
                animate
                accent="cyan"
                className="p-5"
              />
              <StatTile
                label="TOTAL REPS"
                value={total.reps}
                animate
                accent="lime"
                className="p-5"
              />
              <StatTile
                label="CALORIES"
                value={total.kcal}
                format={(n) => `≈ ${Math.round(n)}`}
                hint="KCAL · ESTIMATE"
                animate
                accent="amber"
                className="p-5"
              />
            </div>
          </div>
          <DashboardCharts
            days={last7Days(sessions, now)}
            reps={repsByMove(sessions)}
            weeklyGoalMin={goal}
            now={now}
          />
          {coachPick && (
            <GlassPanel
              className={cn(
                "flex flex-wrap items-center gap-6 border-l-4 p-6",
                ACCENT_TEXT[WORKOUT_ACCENTS[coachPick.next.workout]],
              )}
            >
              <MoveFigure
                pose={
                  coachPick.next.workout === "legs"
                    ? "squat"
                    : coachPick.next.workout === "arms"
                      ? "reachRight"
                      : coachPick.next.workout === "shoulders"
                        ? "armsUp"
                        : "jump"
                }
                size={110}
              />
              <div className="min-w-0 flex-1">
                <Eyebrow className="mb-3 flex items-center gap-2 text-current">
                  <Sparkles className="size-4" />
                  UP NEXT
                </Eyebrow>
                <h2 className="font-display-italic text-title">
                  {WORKOUT_LABELS[coachPick.next.workout]} · {MODE_LABELS[coachPick.next.mode]} ·{" "}
                  {coachPick.next.durationSec} S
                </h2>
                <p className="mt-3 max-w-xl text-body text-text-muted">{coachPick.reason}</p>
              </div>
              {onPlayCoachPick && (
                <GameButton
                  size="lg"
                  keyHint="C"
                  onClick={() => onPlayCoachPick(coachPick.next)}
                  className="px-5"
                >
                  PLAY COACH'S PICK
                </GameButton>
              )}
            </GlassPanel>
          )}
          <section aria-label="Session history">
            <div className="mb-6 flex items-center justify-between gap-4">
              <SectionTitle eyebrow="RECENT ROUNDS" title="YOUR TRACK RECORD" size="sm" />
              <span className="text-caption text-text-muted">
                {total.sessions} rounds · Best {total.bestScore.toLocaleString("en-US")}
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
                    className="focus-ring grid gap-3 border-t border-glass-border px-3 py-5 transition-colors hover:bg-lime/5 focus-visible:bg-lime/5 md:grid-cols-[190px_minmax(0,1fr)_60px_100px_40px_135px] md:items-center"
                  >
                    <span className="font-display text-[20px] font-semibold text-text-muted">
                      {sessionTime(session.at, now)}
                    </span>
                    <span className="flex flex-wrap gap-2">
                      <span
                        className={cn(
                          "rounded-md border border-current px-2 py-1 font-display-italic text-[20px]",
                          ACCENT_TEXT[WORKOUT_ACCENTS[session.config.workout]],
                        )}
                      >
                        {WORKOUT_LABELS[session.config.workout]}
                      </span>
                      <span className="rounded-md bg-glass-strong px-2 py-1 font-display-italic text-caption text-text-muted">
                        {MODE_LABELS[session.config.mode]}
                      </span>
                    </span>
                    <span className="font-display text-[20px] text-text-muted">
                      {session.config.durationSec} S
                    </span>
                    <span className="font-display-italic text-title text-text">
                      {session.score.toLocaleString("en-US")}
                    </span>
                    <span
                      className={cn(
                        "grid size-9 place-items-center rounded-md border font-display-italic text-[24px]",
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
          </section>
        </>
      )}
      <div className="flex flex-wrap items-center gap-4 border-t border-glass-border pt-7">
        <GameButton size="xl" leadingIcon={Play} keyHint="ENTER" onClick={onPlay}>
          PLAY
        </GameButton>
        <GameButton
          variant="secondary"
          size="lg"
          leadingIcon={Trophy}
          keyHint="L"
          onClick={onLeaderboard}
        >
          LEADERBOARD
        </GameButton>
      </div>
    </Screen>
  );
}
