import * as React from 'react';
import { ArrowLeft, Check, Gauge, Lock, PersonStanding, Play } from 'lucide-react';
import type {
  CoachAdvice,
  MoveType,
  PlayMode,
  SessionConfig,
  WorkoutId,
  WorkoutInfo,
} from '@/contracts';
import {
  GameButton,
  CoachBanner,
  ScreenFooter,
  MODE_LABELS,
  MoveChip,
  MoveFigure,
  NavBar,
  ROUND_LEVELS,
  ROUND_LIVES,
  ROUND_SEC,
  Screen,
  SectionTitle,
  SegmentedControl,
  TIER_DIFFICULTY,
  TIER_LABELS,
  ToggleRow,
  WORKOUT_COLORS,
  WORKOUT_LABELS,
  asRound,
  tierOf,
  useHotkey,
  type NavBarProps,
  type Tier,
} from '@/ui/kit';
import { cn } from '@/ui/lib/utils';

export interface WorkoutSelectScreenProps {
  workouts: WorkoutInfo[];
  coachPick?: CoachAdvice | null;
  initial?: Partial<SessionConfig>;
  /** App-provided extra control rendered last in the compact settings row, e.g. a "Low graphics" switch. */
  settingsSlot?: React.ReactNode;
  onStart(config: SessionConfig): void;
  onBack(): void;
  /** The nav bar on top (current: 'play'); absent: no bar, as before. */
  nav?: NavBarProps;
}

/** Signature move drawn on each workout card. */
export const WORKOUT_SIGNATURE: Record<WorkoutId, MoveType> = {
  legs: 'squat',
  arms: 'reachRight',
  shoulders: 'armsUp',
  fullBody: 'jump',
};

const MODES = [
  { value: 'floor', label: 'Floor', icon: PersonStanding },
  { value: 'treadmill', label: 'Treadmill', icon: Gauge },
] as const satisfies readonly { value: PlayMode; label: string; icon: typeof Gauge }[];

// No round length to pick: a round is always every level (ROUND_SEC).
const TIERS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'regular', label: 'Regular' },
  { value: 'athlete', label: 'Athlete' },
] as const satisfies readonly { value: Tier; label: string }[];

/** "LEGS · FLOOR · REGULAR" */
export function sessionLabel(c: Pick<SessionConfig, 'workout' | 'mode' | 'difficulty'>): string {
  return `${WORKOUT_LABELS[c.workout]} · ${MODE_LABELS[c.mode]} · ${TIER_LABELS[tierOf(c.difficulty)]}`;
}

const isAvailable = (w: WorkoutInfo | undefined, mode: PlayMode) =>
  Boolean(w && w.availableIn.includes(mode));

function firstAvailable(workouts: WorkoutInfo[], mode: PlayMode, preferred: WorkoutId): WorkoutId {
  const pref = workouts.find((w) => w.id === preferred);
  if (isAvailable(pref, mode)) return preferred;
  return workouts.find((w) => isAvailable(w, mode))?.id ?? preferred;
}

function WorkoutCard({
  info,
  index,
  selected,
  disabled,
  mode,
  onSelect,
  onKeyNav,
  buttonRef,
}: {
  info: WorkoutInfo;
  index: number;
  selected: boolean;
  disabled: boolean;
  mode: PlayMode;
  onSelect: () => void;
  onKeyNav: (dir: 1 | -1) => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  const [hover, setHover] = React.useState(false);
  const color = WORKOUT_COLORS[info.id];
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${index + 1}. ${info.name}. ${disabled ? (info.id === 'legs' && mode === 'treadmill' ? 'Running is your leg work' : 'Unavailable in this mode') : info.tagline}`}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          onKeyNav(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          onKeyNav(-1);
        }
      }}
      // Picked: a 2 px ring in the workout's colour over the card's soft shadow (no neon halo).
      style={selected ? { boxShadow: `0 0 0 2px ${color}, var(--na-shadow)` } : undefined}
      className={cn(
        // short: 16 px padding, so the nav bar fits above the cards at 1280×720 with the coach's pick.
        'glass focus-ring group relative flex min-h-[360px] cursor-pointer flex-col overflow-hidden rounded-[24px] p-6 text-left transition-[transform,box-shadow,border-color,filter,opacity] duration-300 ease-arena short:p-4',
        // Picked = ring and check only: no lift or size change, so the row never jumps.
        selected ? 'border-transparent' : 'hover:-translate-y-1 hover:border-text/25',
        disabled && 'cursor-not-allowed opacity-45 grayscale hover:translate-y-0',
      )}
    >
      {/* A street-sign colour band on top, and a light wash of the same colour behind the figure. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: color }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[55%] transition-opacity duration-300"
        style={{
          background: `linear-gradient(to bottom, color-mix(in srgb, ${color} 10%, transparent), transparent)`,
          opacity: selected || hover ? 1 : 0.6,
        }}
      />
      {/* The badge floats in the corner: as a row it made the picked card 36 px taller and the
          whole grid row with it. */}
      <span className="absolute top-5 right-5 z-10 tight:top-3 tight:right-3">
        {selected ? (
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full text-bg"
            style={{ background: color }}
          >
            <Check className="size-5" strokeWidth={3} />
          </span>
        ) : disabled ? (
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full bg-glass-strong text-text-muted"
          >
            <Lock className="size-4" />
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className="relative flex items-center justify-center py-4 short:py-2 tight:py-1"
      >
        <MoveFigure
          pose={WORKOUT_SIGNATURE[info.id]}
          color={color}
          animate={!disabled && (selected || hover)}
          size={145}
        />
      </span>
      {/* flex-1 + top-aligned: every title sits at the same height; a card with fewer chip rows
          keeps its spare space at the bottom. */}
      <span className="relative flex flex-1 flex-col gap-3 short:gap-2">
        {/* md–xl: four narrow cards, so the title steps down (SHOULDERS must fit). */}
        <span className="font-display-italic pr-[0.06em] text-display-md leading-[0.9] md:text-title xl:text-display-sm tight:text-title">
          {info.name}
        </span>
        <span className="text-caption text-text-muted tight:hidden">
          {disabled
            ? info.id === 'legs' && mode === 'treadmill'
              ? 'Running is your leg work'
              : `Not available on ${MODE_LABELS[mode].toLowerCase()}`
            : info.tagline}
        </span>
        <span className="flex flex-wrap gap-1.5 pt-1 cramped:hidden">
          {info.moves.map((m) => (
            <MoveChip key={m} move={m} size="sm" showIcon={false} />
          ))}
        </span>
      </span>
    </button>
  );
}

/** Step 1 of session setup: mode, workout, tier and low-impact, with an optional coach's pick. */
export function WorkoutSelectScreen({
  workouts,
  coachPick,
  initial,
  settingsSlot,
  onStart,
  onBack,
  nav,
}: WorkoutSelectScreenProps) {
  const [mode, setMode] = React.useState<PlayMode>(initial?.mode ?? 'floor');
  const [workout, setWorkout] = React.useState<WorkoutId>(() =>
    firstAvailable(workouts, initial?.mode ?? 'floor', initial?.workout ?? 'fullBody'),
  );
  const [tier, setTier] = React.useState<Tier>(() => tierOf(initial?.difficulty));
  const [lowImpact, setLowImpact] = React.useState(initial?.lowImpact ?? false);
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const changeMode = (m: PlayMode) => {
    setMode(m);
    setWorkout((w) => firstAvailable(workouts, m, w));
  };

  const select = (i: number, focus = false) => {
    const w = workouts[i];
    if (!w || !isAvailable(w, mode)) return;
    setWorkout(w.id);
    if (focus) refs.current[i]?.focus();
  };

  const moveSelection = (from: number, dir: 1 | -1) => {
    const n = workouts.length;
    for (let step = 1; step <= n; step++) {
      const i = (from + dir * step + n) % n;
      if (isAvailable(workouts[i], mode)) {
        select(i, true);
        return;
      }
    }
  };

  const difficulty = TIER_DIFFICULTY[tier];
  const effectiveLowImpact = mode === 'floor' && lowImpact;

  const start = () => {
    const config: SessionConfig = {
      workout,
      mode,
      durationSec: ROUND_SEC,
      difficulty,
      lowImpact: effectiveLowImpact,
    };
    if (initial?.seed !== undefined) config.seed = initial.seed;
    onStart(config);
  };

  useHotkey('Enter', start);
  useHotkey('Escape', onBack);
  useHotkey('c', () => coachPick && onStart(asRound(coachPick.next)), Boolean(coachPick));
  useHotkey('1', () => select(0));
  useHotkey('2', () => select(1));
  useHotkey('3', () => select(2));
  useHotkey('4', () => select(3));

  return (
    <Screen
      backdrop="arena"
      className="workout-screen polish-screen"
      footer={
        <ScreenFooter
          left={
            <GameButton
              variant="ghost"
              size="md"
              leadingIcon={ArrowLeft}
              keyHint="ESC"
              onClick={onBack}
            >
              BACK
            </GameButton>
          }
          right={
            <GameButton size="lg" leadingIcon={Play} keyHint="ENTER" onClick={start}>
              START
            </GameButton>
          }
        >
          <span className="block font-display-italic text-title tight:text-body">
            {sessionLabel({ workout, mode, difficulty })}
          </span>
          <span className="block text-caption text-text-muted">
            {ROUND_LEVELS} LEVELS · {ROUND_LIVES} LIVES
            {effectiveLowImpact && <span className="text-cyan"> · LOW IMPACT</span>}
          </span>
        </ScreenFooter>
      }
    >
      {nav && <NavBar {...nav} />}

      <SectionTitle as="h1" size="lg" title="Pick a workout" />

      {coachPick && <CoachBanner advice={coachPick} onPlay={onStart} />}

      <div
        role="radiogroup"
        aria-label="Workout"
        className="grid gap-4 pt-2 sm:grid-cols-2 md:grid-cols-4 xl:gap-6 short:pt-0"
      >
        {workouts.map((w, i) => (
          <WorkoutCard
            key={w.id}
            info={w}
            index={i}
            mode={mode}
            selected={w.id === workout}
            disabled={!isAvailable(w, mode)}
            onSelect={() => select(i)}
            onKeyNav={(dir) => moveSelection(i, dir)}
            buttonRef={(el) => {
              refs.current[i] = el;
            }}
          />
        ))}
      </div>

      <div className="workout-settings flex flex-wrap items-center justify-between gap-3 border-t border-glass-border pt-5 xl:gap-5">
        <SegmentedControl<PlayMode>
          aria-label="Play mode"
          value={mode}
          onChange={changeMode}
          options={MODES}
          size="md"
        />
        <SegmentedControl<Tier>
          aria-label="Tier"
          value={tier}
          onChange={setTier}
          options={TIERS}
          size="md"
        />
        {mode === 'floor' && (
          <ToggleRow
            // Same box as the segmented controls beside it: glass, 20 px radius, 6 px padding,
            // a 48 px content row.
            className="min-h-0 gap-4 rounded-[20px] py-1.5 pr-3 pl-5 [&_label>span:first-child]:text-[22px] [&>label]:min-h-12 [&>label]:justify-center tight:[&>label]:min-h-11"
            label="Low impact"
            description="No jumps"
            checked={lowImpact}
            onCheckedChange={setLowImpact}
          />
        )}
        {settingsSlot ? <div className="flex min-h-14 items-center">{settingsSlot}</div> : null}
      </div>
    </Screen>
  );
}
