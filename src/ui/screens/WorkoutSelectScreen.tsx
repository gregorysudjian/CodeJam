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
  Screen,
  SectionTitle,
  SegmentedControl,
  ToggleRow,
  WORKOUT_COLORS,
  WORKOUT_LABELS,
  useHotkey,
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

const DURATIONS = [
  { value: '45', label: '45 S' },
  { value: '90', label: '90 S' },
  { value: '180', label: '180 S' },
] as const;
type DurationValue = (typeof DURATIONS)[number]['value'];

/** "LEGS · FLOOR · 90 S" */
export function sessionLabel(c: Pick<SessionConfig, 'workout' | 'mode' | 'durationSec'>): string {
  return `${WORKOUT_LABELS[c.workout]} · ${MODE_LABELS[c.mode]} · ${c.durationSec} S`;
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
      style={
        selected
          ? {
              boxShadow: `0 0 0 1px ${color}99, 0 24px 60px -20px ${color}66, 0 0 80px -20px ${color}55`,
            }
          : undefined
      }
      className={cn(
        'glass focus-ring group relative flex min-h-[360px] cursor-pointer flex-col overflow-hidden rounded-[28px] p-6 text-left transition-[transform,box-shadow,border-color,filter,opacity] duration-300 ease-arena',
        selected
          ? '-translate-y-2 border-transparent'
          : 'hover:-translate-y-1 hover:border-white/20',
        disabled && 'cursor-not-allowed opacity-45 grayscale hover:translate-y-0',
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: color, boxShadow: `0 0 24px 2px ${color}aa` }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[60%] transition-opacity duration-300"
        style={{
          background: `radial-gradient(60% 60% at 50% 45%, ${color}33, transparent 70%)`,
          opacity: selected || hover ? 1 : 0.55,
        }}
      />
      <span className="relative flex items-start justify-between">
        <span />
        {selected ? (
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full text-bg"
            style={{ background: color, boxShadow: `0 0 20px ${color}aa` }}
          >
            <Check className="size-5" strokeWidth={3} />
          </span>
        ) : disabled ? (
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full bg-white/10 text-text-muted"
          >
            <Lock className="size-4" />
          </span>
        ) : null}
      </span>
      <span aria-hidden="true" className="relative flex flex-1 items-center justify-center py-4">
        <MoveFigure
          pose={WORKOUT_SIGNATURE[info.id]}
          color={color}
          animate={!disabled && (selected || hover)}
          size={145}
        />
      </span>
      <span className="relative flex flex-col gap-3">
        <span className="font-display-italic pr-[0.06em] text-display-md leading-[0.9] xl:text-display-sm">
          {info.name}
        </span>
        <span className="text-caption text-text-muted">
          {disabled
            ? info.id === 'legs' && mode === 'treadmill'
              ? 'Running is your leg work'
              : `Not available on ${MODE_LABELS[mode].toLowerCase()}`
            : info.tagline}
        </span>
        <span className="flex flex-wrap gap-1.5 pt-1">
          {info.moves.map((m) => (
            <MoveChip key={m} move={m} size="sm" showIcon={false} />
          ))}
        </span>
      </span>
    </button>
  );
}

/** Step 1 of session setup: mode, workout, duration and low-impact, with an optional coach's pick. */
export function WorkoutSelectScreen({
  workouts,
  coachPick,
  initial,
  settingsSlot,
  onStart,
  onBack,
}: WorkoutSelectScreenProps) {
  const [mode, setMode] = React.useState<PlayMode>(initial?.mode ?? 'floor');
  const [workout, setWorkout] = React.useState<WorkoutId>(() =>
    firstAvailable(workouts, initial?.mode ?? 'floor', initial?.workout ?? 'fullBody'),
  );
  const [duration, setDuration] = React.useState<DurationValue>(() => {
    const v = String(initial?.durationSec ?? 90);
    return DURATIONS.find((d) => d.value === v)?.value ?? '90';
  });
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

  const nav = (from: number, dir: 1 | -1) => {
    const n = workouts.length;
    for (let step = 1; step <= n; step++) {
      const i = (from + dir * step + n) % n;
      if (isAvailable(workouts[i], mode)) {
        select(i, true);
        return;
      }
    }
  };

  const durationSec = Number(duration);
  const effectiveLowImpact = mode === 'floor' && lowImpact;

  const start = () => {
    const config: SessionConfig = { workout, mode, durationSec, lowImpact: effectiveLowImpact };
    if (initial?.difficulty !== undefined) config.difficulty = initial.difficulty;
    if (initial?.seed !== undefined) config.seed = initial.seed;
    onStart(config);
  };

  useHotkey('Enter', start);
  useHotkey('Escape', onBack);
  useHotkey('c', () => coachPick && onStart(coachPick.next), Boolean(coachPick));
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
          <span className="font-display-italic text-title">
            {sessionLabel({ workout, mode, durationSec })}
          </span>
          {effectiveLowImpact && <span className="ml-3 text-caption text-cyan">LOW IMPACT</span>}
        </ScreenFooter>
      }
    >
      <SectionTitle as="h1" size="lg" title="Pick a workout" />

      {coachPick && <CoachBanner advice={coachPick} onPlay={onStart} />}

      <div
        role="radiogroup"
        aria-label="Workout"
        className="grid gap-6 pt-2 sm:grid-cols-2 xl:grid-cols-4"
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
            onKeyNav={(dir) => nav(i, dir)}
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
        <SegmentedControl<DurationValue>
          aria-label="Duration"
          value={duration}
          onChange={setDuration}
          options={DURATIONS}
          size="md"
        />
        {mode === 'floor' && (
          <ToggleRow
            className="min-h-14 border-0 bg-transparent p-0 shadow-none backdrop-blur-none [&_label>span:first-child]:text-[22px]"
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
