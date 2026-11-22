import { useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { ArrowLeft, Crown, Play, QrCode, Trophy } from 'lucide-react';
import type { LeaderboardEntry, PlayMode, WorkoutId } from '@/contracts';
import { Skeleton } from '@/ui/components/ui/skeleton';
import {
  AnimatedNumber,
  EmptyState,
  Eyebrow,
  GameButton,
  GlassPanel,
  Screen,
  ScreenFooter,
  SegmentedControl,
  WORKOUT_LABELS,
  MODE_LABELS,
  useHotkey,
  useNow,
} from '@/ui/kit';
import { cn } from '@/ui/lib/utils';
import { relativeTime } from '@/ui/screens/dashboardStats';
import { POSTED_CLOCK_MS, leaderboardFilter } from '@/ui/screens/leaderboardRules';

export interface LeaderboardScreenProps {
  entries: LeaderboardEntry[];
  workout: WorkoutId;
  mode: PlayMode;
  /** One board per round length: a long round always outscores a short one. */
  durationSec: number;
  onChangeFilter(workout: WorkoutId, mode: PlayMode, durationSec: number): void;
  currentName?: string;
  loading?: boolean;
  kiosk?: boolean;
  qrSlot?: ReactNode;
  onBack(): void;
  onPlay?(): void;
}
const BOARD_DURATIONS = [45, 90, 180] as const;
const PODIUM = [
  { rank: 2, tone: 'text-cyan', height: 'min-h-[300px]' },
  { rank: 1, tone: 'text-lime', height: 'min-h-[350px]' },
  { rank: 3, tone: 'text-violet', height: 'min-h-[280px]' },
] as const;
function Podium({
  entries,
  currentName,
  now,
  kiosk,
}: {
  entries: LeaderboardEntry[];
  currentName: string | undefined;
  now: number;
  kiosk: boolean;
}) {
  return (
    <div className="podium-grid grid grid-cols-3 items-end gap-5" aria-label="Top three">
      {PODIUM.map(({ rank, tone, height }) => {
        const entry = entries[rank - 1];
        return entry ? (
          <GlassPanel
            key={rank}
            padding="sm"
            glow={rank === 1 ? 'lime' : rank === 2 ? 'cyan' : 'none'}
            className={cn(
              'podium-place flex min-w-0 flex-col items-center justify-center gap-3 text-center',
              tone,
              height,
              rank === 1 && 'podium-winner',
              kiosk && 'kiosk-podium',
            )}
          >
            {rank === 1 ? (
              <Crown className="size-9 text-lime" />
            ) : (
              <span className="eyebrow text-text-muted">
                {rank === 2 ? 'RUNNER UP' : 'THIRD PLACE'}
              </span>
            )}
            <span className="podium-rank font-display-italic text-display-xl leading-none">
              {rank}
            </span>
            {/* One line, so a 20-character name can't make one card taller than the others. */}
            <h2
              title={entry.displayName}
              className="podium-name w-full truncate pr-[0.06em] font-display-italic text-title text-text"
            >
              {entry.displayName}
            </h2>
            {entry.displayName === currentName && (
              <span className="rounded bg-lime px-2 font-display-italic text-caption text-bg">
                YOU
              </span>
            )}
            <AnimatedNumber
              value={entry.score}
              className="podium-score font-display-italic text-display-sm"
            />
            <span className="font-display text-caption font-semibold text-text-muted">
              {relativeTime(entry.at, now)}
            </span>
          </GlassPanel>
        ) : (
          <div
            key={rank}
            className={cn(
              'flex flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed border-glass-border px-3 text-center',
              height,
            )}
          >
            <span
              className={cn('podium-rank font-display-italic text-display-xl opacity-25', tone)}
            >
              {rank}
            </span>
            <span className="font-display-italic text-title text-text-dim">OPEN SPOT</span>
          </div>
        );
      })}
    </div>
  );
}
export function LeaderboardScreen({
  entries,
  workout,
  mode,
  durationSec,
  onChangeFilter,
  currentName,
  loading = false,
  kiosk = false,
  qrSlot,
  onBack,
  onPlay,
}: LeaderboardScreenProps) {
  const reduce = useReducedMotion();
  // Ticks, so the kiosk's "POSTED" times don't freeze at "JUST NOW" (it stays open for an hour).
  const now = useNow(POSTED_CLOCK_MS);
  const youRow = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = youRow.current;
    const list = listRef.current;
    if (loading || !row || !list) return;
    const rowBox = row.getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    if (rowBox.top < listBox.top || rowBox.bottom > listBox.bottom) {
      list.scrollTo({
        top: list.scrollTop + rowBox.top - listBox.top - 8,
        behavior: reduce ? 'instant' : 'smooth',
      });
    }
  }, [currentName, entries, loading, reduce]);
  const change = (nextWorkout: WorkoutId, nextMode: PlayMode, nextDuration = durationSec) => {
    const filter = leaderboardFilter(nextWorkout, nextMode);
    onChangeFilter(filter.workout, filter.mode, nextDuration);
  };
  useHotkey('Escape', onBack, !kiosk);
  useHotkey('Enter', () => onPlay?.(), Boolean(onPlay) && !kiosk);
  const top = entries[0];
  return (
    <Screen
      backdrop="track"
      className={cn('leaderboard-screen polish-screen', kiosk && 'leaderboard-kiosk')}
      footer={
        // Always outside kiosk mode: an empty board must keep Back and the filters (QA Q3).
        !kiosk ? (
          <ScreenFooter
            left={
              <GameButton
                size="md"
                variant="ghost"
                leadingIcon={ArrowLeft}
                keyHint="ESC"
                onClick={onBack}
              >
                BACK
              </GameButton>
            }
            right={
              onPlay ? (
                <GameButton size="lg" keyHint="ENTER" leadingIcon={Play} onClick={onPlay}>
                  PLAY
                </GameButton>
              ) : null
            }
          />
        ) : null
      }
    >
      {(!kiosk || loading || entries.length > 0) && (
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow className="mb-3">LEADERBOARD</Eyebrow>
            <h1 className="leaderboard-title font-display-italic text-display-md">
              {WORKOUT_LABELS[workout]} <span className="text-text-dim">·</span> {MODE_LABELS[mode]}{' '}
              <span className="text-text-dim">·</span> {durationSec} S
            </h1>
          </div>
          {!kiosk && (
            <div className="leaderboard-filters flex flex-wrap items-center gap-4">
              <SegmentedControl
                size="md"
                aria-label="Leaderboard workout"
                value={workout}
                options={(['legs', 'arms', 'shoulders', 'fullBody'] as const).map((value) => ({
                  value,
                  label: WORKOUT_LABELS[value],
                  disabled: value === 'legs' && mode === 'treadmill',
                }))}
                className="border-0 bg-transparent"
                onChange={(value) => change(value, mode)}
              />
              <SegmentedControl
                size="md"
                aria-label="Leaderboard mode"
                value={mode}
                options={[
                  { value: 'floor', label: 'FLOOR' },
                  { value: 'treadmill', label: 'TREADMILL' },
                ]}
                className="border-0 bg-transparent"
                onChange={(value) => change(workout, value)}
              />
              <SegmentedControl
                size="md"
                aria-label="Leaderboard round length"
                value={String(durationSec)}
                options={BOARD_DURATIONS.map((d) => ({ value: String(d), label: `${d} S` }))}
                className="border-0 bg-transparent"
                onChange={(value) => change(workout, mode, Number(value))}
              />
            </div>
          )}
        </header>
      )}
      {kiosk && top && !loading && (
        <div className="kiosk-crown-banner flex flex-wrap items-center justify-center gap-4 border-y border-lime/40 py-6 text-center text-lime">
          <Crown className="size-10" />
          <p className="font-display-italic text-display-sm">
            BEAT <span className="text-glow-lime">{top.score.toLocaleString('en-US')}</span> TO TAKE
            THE CROWN
          </p>
        </div>
      )}
      {/* The kiosk keeps the QR beside the podium from 768 px wide, so it stays in view at
          125–150 % scaling (QA Q20). */}
      <div
        className={cn(
          'grid min-w-0 gap-8',
          kiosk && 'md:grid-cols-[minmax(0,1fr)_220px] xl:grid-cols-[minmax(0,1fr)_280px]',
        )}
      >
        <div className="min-w-0">
          {loading ? (
            <div aria-label="Loading leaderboard" aria-busy="true">
              <div className="grid grid-cols-3 gap-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="coach-shimmer h-[320px] rounded-[24px]" />
                ))}
              </div>
              <div className="mt-8 space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="coach-shimmer h-16" />
                ))}
              </div>
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="BE THE FIRST ON THE BOARD"
              action={
                // Outside kiosk mode the footer already has PLAY.
                kiosk && onPlay ? (
                  <GameButton size="lg" keyHint="ENTER" leadingIcon={Play} onClick={onPlay}>
                    PLAY
                  </GameButton>
                ) : null
              }
              className="min-h-[430px]"
            />
          ) : (
            <>
              <Podium entries={entries} currentName={currentName} now={now} kiosk={kiosk} />
              {entries.length > 3 && (
                <section className="mt-8" aria-label="Leaderboard rankings">
                  <div className="leaderboard-row grid grid-cols-[50px_minmax(0,1fr)_130px_120px] gap-4 px-5 pb-3 font-display text-caption text-text-dim">
                    <span>RANK</span>
                    <span>PLAYER</span>
                    <span className="text-right">SCORE</span>
                    <span className="text-right">POSTED</span>
                  </div>
                  <div
                    ref={listRef}
                    className="leaderboard-list max-h-[370px] overflow-y-auto overscroll-contain pr-2"
                    role="list"
                  >
                    {entries.slice(3, 20).map((entry, i) => {
                      const you = entry.displayName === currentName;
                      return (
                        <div
                          key={`${entry.displayName}-${entry.at}-${i}`}
                          ref={you ? youRow : undefined}
                          role="listitem"
                          tabIndex={0}
                          aria-label={`Rank ${i + 4}, ${entry.displayName}${you ? ', you' : ''}, ${entry.score} points`}
                          className={cn(
                            'leaderboard-row focus-ring grid grid-cols-[50px_minmax(0,1fr)_130px_120px] items-center gap-4 border-t border-glass-border px-5 py-4 transition-colors hover:bg-glass-strong focus-visible:bg-glass-strong',
                            you && 'border-l-2 border-l-lime bg-lime/10',
                          )}
                        >
                          <span
                            className={cn(
                              'font-display-italic text-title',
                              you ? 'text-lime' : 'text-text-dim',
                            )}
                          >
                            {i + 4}
                          </span>
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              title={entry.displayName}
                              className="min-w-0 truncate pr-[0.06em] font-display-italic text-[26px]"
                            >
                              {entry.displayName}
                            </span>
                            {you && (
                              <span className="rounded bg-lime px-2 py-1 font-display-italic text-caption text-bg">
                                YOU
                              </span>
                            )}
                          </span>
                          <span
                            className={cn(
                              'text-right font-display-italic text-title',
                              you ? 'text-lime' : 'text-text',
                            )}
                          >
                            {entry.score.toLocaleString('en-US')}
                          </span>
                          <span className="text-right font-display text-caption font-semibold text-text-muted">
                            {relativeTime(entry.at, now)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
        {kiosk && (
          <aside className="flex flex-col items-center justify-center gap-6 border-l border-glass-border pl-8 text-center">
            <QrCode className="size-10 text-cyan" />
            <h2 className="font-display-italic text-title text-cyan">PLAY ON YOUR LAPTOP</h2>
            <div className="qr-stage grid aspect-square w-full max-w-[240px] place-items-center rounded-2xl border border-cyan/40 p-4">
              {qrSlot ?? (
                <div className="grid size-full place-items-center rounded-xl border border-dashed border-glass-border">
                  <QrCode className="size-24 text-text-dim" />
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </Screen>
  );
}
