import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { ArrowLeft, Check, Crown, Play, QrCode, Trophy, UserPlus, Users, X } from 'lucide-react';
import type {
  AddFriendResult,
  FriendBoardEntry,
  LeaderboardEntry,
  PlayMode,
  WorkoutId,
} from '@/contracts';
import { Skeleton } from '@/ui/components/ui/skeleton';
import {
  AnimatedNumber,
  EmptyState,
  Eyebrow,
  GameButton,
  GlassPanel,
  NavBar,
  Screen,
  ScreenFooter,
  SegmentedControl,
  TextField,
  WORKOUT_LABELS,
  MODE_LABELS,
  ROUND_SEC,
  useHotkey,
  useNow,
  type NavBarProps,
} from '@/ui/kit';
import { cn } from '@/ui/lib/utils';
import { relativeTime } from '@/ui/screens/dashboardStats';
import {
  POSTED_CLOCK_MS,
  addFriendMessage,
  leaderboardFilter,
} from '@/ui/screens/leaderboardRules';

export interface LeaderboardScreenProps {
  entries: LeaderboardEntry[];
  workout: WorkoutId;
  mode: PlayMode;
  /** One board per workout and mode (every round is all 6 levels). Not shown; only handed back
   *  to `onChangeFilter`, so the app's fetch keeps working until the store drops it. */
  durationSec?: number;
  onChangeFilter(workout: WorkoutId, mode: PlayMode, durationSec: number): void;
  currentName?: string;
  loading?: boolean;
  kiosk?: boolean;
  qrSlot?: ReactNode;
  onBack(): void;
  onPlay?(): void;
  /** The nav bar on top (current: 'leaderboard'); absent: no bar, as before. Never on the kiosk. */
  nav?: NavBarProps;
  /** The friends board (never on the kiosk): adds an EVERYONE | FRIENDS toggle. The screen makes
   *  no network calls; the app fetches `entries` and `names` and does the add. */
  friends?: {
    entries: FriendBoardEntry[];
    names: string[];
    onAdd(username: string): Promise<AddFriendResult>;
  };
}
type BoardView = 'everyone' | 'friends';
/** Your own row: `isMe` on the friends board, your name on the public one. */
const isYouOn = (currentName: string | undefined) => (entry: LeaderboardEntry) =>
  'isMe' in entry ? entry.isMe === true : entry.displayName === currentName;
/** Kiosk rows stop after this rank: two columns of four, with no scrolling on a projector. */
const KIOSK_LAST_RANK = 11;
const PODIUM = [
  { rank: 2, tone: 'text-cyan', height: 'min-h-[300px]' },
  { rank: 1, tone: 'text-lime', height: 'min-h-[350px]' },
  { rank: 3, tone: 'text-violet', height: 'min-h-[280px]' },
] as const;
function Podium({
  entries,
  isYou,
  now,
  kiosk,
}: {
  entries: LeaderboardEntry[];
  isYou: (entry: LeaderboardEntry) => boolean;
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
            {isYou(entry) && (
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
/** Add a friend by username, the result line, and the friends you have. */
function FriendsPanel({
  names,
  onAdd,
}: {
  names: string[];
  onAdd(username: string): Promise<AddFriendResult>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const typed = name.trim();
    if (!typed || busy) return;
    setBusy(true);
    // onAdd never rejects (DataStore contract); a throw is treated as no connection anyway.
    const result = await onAdd(typed).catch((): AddFriendResult => ({
      ok: false,
      reason: 'offline',
    }));
    setBusy(false);
    setMessage(addFriendMessage(result, typed));
    if (result.ok) setName('');
  };
  return (
    <GlassPanel
      as="aside"
      aria-label="Friends"
      className="flex min-w-0 flex-col gap-5 self-start p-5 md:p-6"
    >
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <TextField
          label="ADD FRIEND"
          placeholder="Username"
          autoComplete="off"
          spellCheck={false}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setMessage(null);
          }}
          trailing={
            <GameButton
              type="submit"
              size="md"
              leadingIcon={UserPlus}
              disabled={!name.trim() || busy}
              className="h-12 px-4 text-[20px]"
            >
              ADD
            </GameButton>
          }
        />
        <p
          role="status"
          className={cn(
            'flex min-h-6 items-center gap-2 font-display text-[20px] font-semibold',
            message?.ok ? 'text-violet' : 'text-danger',
          )}
        >
          {message && (
            <>
              {message.ok ? (
                <Check aria-hidden="true" className="size-5 shrink-0" strokeWidth={3} />
              ) : (
                <X aria-hidden="true" className="size-5 shrink-0" strokeWidth={3} />
              )}
              <span className="min-w-0 break-words">{message.text}</span>
            </>
          )}
        </p>
      </form>
      <section aria-label="Your friends" className="border-t border-glass-border pt-4">
        <Eyebrow accent="muted" className="mb-3">
          YOUR FRIENDS · {names.length}
        </Eyebrow>
        {names.length === 0 ? (
          <p className="text-caption text-text-muted">No friends yet.</p>
        ) : (
          <ul className="flex max-h-[220px] flex-wrap gap-2 overflow-y-auto [scrollbar-width:thin]">
            {names.map((friend) => (
              <li
                key={friend}
                title={friend}
                className="max-w-full truncate rounded-full border border-glass-border bg-glass-strong px-3 py-1 font-display-italic text-[20px]"
              >
                {friend}
              </li>
            ))}
          </ul>
        )}
      </section>
    </GlassPanel>
  );
}
export function LeaderboardScreen({
  entries,
  workout,
  mode,
  durationSec = ROUND_SEC,
  onChangeFilter,
  currentName,
  loading = false,
  kiosk = false,
  qrSlot,
  onBack,
  onPlay,
  nav,
  friends,
}: LeaderboardScreenProps) {
  const reduce = useReducedMotion();
  const [view, setView] = useState<BoardView>('everyone');
  const showFriends = Boolean(friends) && !kiosk && view === 'friends';
  const board: LeaderboardEntry[] = showFriends && friends ? friends.entries : entries;
  const isYou = isYouOn(currentName);
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
  }, [currentName, board, loading, reduce]);
  const change = (nextWorkout: WorkoutId, nextMode: PlayMode) => {
    const filter = leaderboardFilter(nextWorkout, nextMode);
    onChangeFilter(filter.workout, filter.mode, durationSec);
  };
  useHotkey('Escape', onBack, !kiosk);
  useHotkey('Enter', () => onPlay?.(), Boolean(onPlay) && !kiosk);
  const top = entries[0];
  // The kiosk can't scroll, so it shows ranks 4–11 in two columns (4–9 on short screens).
  const rows = board.slice(3, kiosk ? KIOSK_LAST_RANK : 20);
  const crown =
    kiosk && top && !loading ? (
      // Not .kiosk-crown-banner: its opacity pulse drops cream on maple red below 4.5:1.
      <div className="flex items-center gap-4 rounded-2xl bg-lime px-6 py-3 text-bg shadow-[var(--na-shadow)] tight:py-1.5">
        <Crown className="size-10 shrink-0 tight:size-8" aria-hidden="true" />
        <p className="font-display-italic text-[40px] leading-none tight:text-[32px] 2xl:text-display-sm">
          BEAT {top.score.toLocaleString('en-US')} TO TAKE THE CROWN
        </p>
      </div>
    ) : null;
  return (
    <Screen
      backdrop="track"
      className={cn(
        'leaderboard-screen polish-screen',
        // Full screen on the projector: use the width a 1920 px screen has.
        kiosk && 'leaderboard-kiosk [&>main]:max-w-[1760px]',
      )}
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
      {nav && !kiosk && <NavBar {...nav} />}
      {(!kiosk || loading || entries.length > 0) && (
        <header
          className={cn(
            'flex flex-wrap justify-between gap-6',
            kiosk ? 'items-center' : 'items-end',
          )}
        >
          <div>
            <Eyebrow className={cn('mb-3', kiosk && 'text-[18px]')}>LEADERBOARD</Eyebrow>
            <h1 className="leaderboard-title font-display-italic text-display-md">
              {WORKOUT_LABELS[workout]} <span className="text-text-dim">·</span> {MODE_LABELS[mode]}
            </h1>
          </div>
          {crown}
          {!kiosk && (
            <div className="leaderboard-filters flex flex-wrap items-center gap-4">
              {friends && (
                <SegmentedControl
                  size="md"
                  aria-label="Leaderboard view"
                  value={view}
                  options={[
                    { value: 'everyone', label: 'EVERYONE' },
                    { value: 'friends', label: 'FRIENDS', icon: Users },
                  ]}
                  onChange={setView}
                />
              )}
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
            </div>
          )}
        </header>
      )}
      {/* The kiosk keeps the QR beside the podium from 768 px wide, so it stays in view at
          125–150 % scaling (QA Q20). */}
      <div
        className={cn(
          'grid min-w-0 gap-8',
          kiosk && 'md:grid-cols-[minmax(0,1fr)_200px] 2xl:grid-cols-[minmax(0,1fr)_280px]',
          showFriends && 'lg:grid-cols-[minmax(0,1fr)_340px]',
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
          ) : showFriends && friends?.names.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="NO FRIENDS YET"
              body="Add a friend by their username to compare scores"
              className="min-h-[430px]"
            />
          ) : showFriends && board.length === 0 ? (
            <EmptyState
              icon={Users}
              title="NO ROUNDS HERE YET"
              body={`Nobody on your friends board has played ${WORKOUT_LABELS[workout]} · ${MODE_LABELS[mode]} yet.`}
              className="min-h-[430px]"
            />
          ) : board.length === 0 ? (
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
              <Podium entries={board} isYou={isYou} now={now} kiosk={kiosk} />
              {rows.length > 0 &&
                (kiosk ? (
                  <section
                    className="glass mt-6 overflow-hidden rounded-[24px] short:mt-4 tight:mt-3"
                    aria-label="Leaderboard rankings"
                  >
                    <div
                      role="list"
                      className="grid grid-flow-col grid-rows-4 gap-x-px bg-glass-border short:grid-rows-3 lg:grid-cols-2 max-lg:grid-flow-row max-lg:grid-rows-none short:[&>*:nth-child(n+7)]:hidden"
                    >
                      {rows.map((entry, i) => (
                        <div
                          key={`${entry.displayName}-${entry.at}-${i}`}
                          role="listitem"
                          aria-label={`Rank ${i + 4}, ${entry.displayName}, ${entry.score} points`}
                          className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 border-t border-glass-border bg-bg-raised px-6 py-3 short:py-2 tight:grid-cols-[36px_minmax(0,1fr)_auto] tight:gap-3 tight:px-4 tight:py-1.5 2xl:py-4"
                        >
                          <span className="font-display-italic text-[40px] leading-none text-text-dim tight:text-[30px]">
                            {i + 4}
                          </span>
                          <span
                            title={entry.displayName}
                            className="min-w-0 truncate pr-[0.06em] font-display-italic text-[36px] leading-tight tight:text-[26px] 2xl:text-[44px]"
                          >
                            {entry.displayName}
                          </span>
                          <span className="text-right font-display-italic text-[40px] leading-none tabular-nums text-text tight:text-[32px] 2xl:text-[48px]">
                            {entry.score.toLocaleString('en-US')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  <section
                    className="glass mt-8 overflow-hidden rounded-[24px]"
                    aria-label="Leaderboard rankings"
                  >
                    <div className="leaderboard-row grid grid-cols-[50px_minmax(0,1fr)_130px_120px] gap-4 px-5 pt-4 pb-3 font-display text-caption text-text-dim">
                      <span>RANK</span>
                      <span>PLAYER</span>
                      <span className="text-right">SCORE</span>
                      <span className="text-right">POSTED</span>
                    </div>
                    <div
                      ref={listRef}
                      className="max-h-[210px] overflow-y-auto overscroll-contain [scroll-padding:8px] [scrollbar-color:var(--na-text-dim)_transparent] [scrollbar-width:thin] [@media(min-height:1000px)]:max-h-[250px]"
                      role="list"
                    >
                      {rows.map((entry, i) => {
                        const you = isYou(entry);
                        return (
                          <div
                            key={`${entry.displayName}-${entry.at}-${i}`}
                            ref={you ? youRow : undefined}
                            role="listitem"
                            tabIndex={0}
                            aria-label={`Rank ${i + 4}, ${entry.displayName}${you ? ', you' : ''}, ${entry.score} points`}
                            className={cn(
                              'leaderboard-row focus-ring grid grid-cols-[50px_minmax(0,1fr)_130px_120px] items-center gap-4 border-t border-glass-border px-5 py-3.5 transition-colors hover:bg-glass-strong/60 focus-visible:bg-glass-strong/60',
                              you && 'border-l-4 border-l-lime bg-lime/10 pl-4',
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
                                'text-right font-display-italic text-title tabular-nums',
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
                ))}
            </>
          )}
        </div>
        {showFriends && friends && <FriendsPanel names={friends.names} onAdd={friends.onAdd} />}
        {kiosk && (
          <section
            aria-label="Play on your laptop"
            className="glass flex flex-col items-center justify-center gap-4 self-start rounded-[24px] p-5 text-center tight:gap-2 tight:p-3 2xl:p-6"
          >
            <QrCode className="size-9 text-cyan tight:hidden" aria-hidden="true" />
            <h2 className="font-display-italic text-[28px] leading-none text-cyan tight:text-[22px] 2xl:text-title">
              PLAY ON YOUR LAPTOP
            </h2>
            <div className="grid aspect-square w-full place-items-center rounded-2xl border-2 border-cyan/40 bg-bg-raised p-3 text-text">
              {qrSlot ?? (
                <div className="grid size-full place-items-center rounded-xl border border-dashed border-glass-border">
                  <QrCode className="size-24 text-text-dim" />
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </Screen>
  );
}
