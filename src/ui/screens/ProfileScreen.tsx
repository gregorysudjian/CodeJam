import * as React from 'react';
import {
  Check,
  Dices,
  Dumbbell,
  Footprints,
  HeartPulse,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import type { FitnessLevel, Goal, Profile } from '@/contracts';
import {
  Eyebrow,
  GameButton,
  NavBar,
  SectionTitle,
  SegmentedControl,
  Screen,
  ScreenFooter,
  TextField,
  useHotkey,
  type NavBarProps,
} from '@/ui/kit';
import { cn } from '@/ui/lib/utils';
import {
  optionalNumbers,
  profileName,
  randomGuestName,
  validateRange,
} from '@/ui/screens/profileRules';

export type ProfileInput = Omit<Profile, 'id'>;

export interface ProfileScreenProps {
  initial?: Partial<ProfileInput>;
  onSubmit(p: ProfileInput): void;
  onBack(): void;
  /** The nav bar on top (current: 'profile'), only when an existing player edits their profile;
   *  absent (first-time setup): no bar, as before. */
  nav?: NavBarProps;
}

/** Skip's values. Its displayName is only a type filler: Skip and an empty field save the
 *  screen's fallback name instead (profileRules.ts). */
export const PROFILE_DEFAULTS: ProfileInput = {
  displayName: 'Guest',
  goal: 'getMoving',
  level: 'beginner',
  weeklyGoalMin: 60,
};

const GOALS: { value: Goal; label: string; body: string; icon: LucideIcon }[] = [
  { value: 'getMoving', label: 'Get moving', body: 'Build a daily habit', icon: Footprints },
  {
    value: 'buildStrength',
    label: 'Build strength',
    body: 'Squats, presses, power',
    icon: Dumbbell,
  },
  { value: 'cardio', label: 'Cardio', body: 'Keep the heart rate up', icon: HeartPulse },
];

const LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'regular', label: 'Regular' },
  { value: 'athlete', label: 'Athlete' },
] as const satisfies readonly { value: FitnessLevel; label: string }[];

const WEEKLY = [
  { value: '30', label: '30' },
  { value: '60', label: '60' },
  { value: '90', label: '90' },
  { value: '150', label: '150 min' },
] as const;
type WeeklyValue = (typeof WEEKLY)[number]['value'];

export function validateWeight(raw: string): string | null {
  return validateRange('weightKg', raw);
}

function GoalPicker({ value, onChange }: { value: Goal; onChange: (g: Goal) => void }) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const go = (i: number) => {
    const n = (i + GOALS.length) % GOALS.length;
    const g = GOALS[n];
    if (!g) return;
    onChange(g.value);
    refs.current[n]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Goal" className="grid gap-4 sm:grid-cols-3">
      {GOALS.map((g, i) => {
        const selected = g.value === value;
        const Icon = g.icon;
        return (
          <button
            key={g.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(g.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                go(i + 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                go(i - 1);
              }
            }}
            className={cn(
              'glass focus-ring relative flex min-h-36 cursor-pointer flex-col items-start justify-between gap-4 rounded-[24px] p-4 text-left transition-[border-color,box-shadow,transform] duration-200 ease-arena active:scale-[0.98]',
              selected ? 'glow-edge-lime' : 'hover:border-text/30',
            )}
          >
            <span
              className={cn(
                'grid size-10 place-items-center rounded-2xl',
                selected ? 'bg-lime text-bg' : 'bg-glass-strong text-text-muted',
              )}
            >
              <Icon aria-hidden="true" className="size-6" strokeWidth={2.25} />
            </span>
            <span className="flex flex-col gap-1">
              <span className="font-display-italic pr-[0.06em] text-title">{g.label}</span>
            </span>
            {selected ? (
              <span
                aria-hidden="true"
                className="absolute right-5 top-5 grid size-8 place-items-center rounded-full bg-lime text-bg shadow-glow-lime"
              >
                <Check className="size-5" strokeWidth={3} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Player setup (edit profile): name, goal, level, weekly minutes and optional weight, age and height. */
export function ProfileScreen({ initial, onSubmit, onBack, nav }: ProfileScreenProps) {
  const [name, setName] = React.useState(initial?.displayName ?? '');
  const [goal, setGoal] = React.useState<Goal>(initial?.goal ?? PROFILE_DEFAULTS.goal);
  const [level, setLevel] = React.useState<FitnessLevel>(initial?.level ?? PROFILE_DEFAULTS.level);
  const [weekly, setWeekly] = React.useState<WeeklyValue>(() => {
    const v = String(initial?.weeklyGoalMin ?? PROFILE_DEFAULTS.weeklyGoalMin);
    return WEEKLY.find((w) => w.value === v)?.value ?? '60';
  });
  const [weight, setWeight] = React.useState(
    initial?.weightKg != null ? String(initial.weightKg) : '',
  );
  const [age, setAge] = React.useState(initial?.age != null ? String(initial.age) : '');
  const [height, setHeight] = React.useState(
    initial?.heightCm != null ? String(initial.heightCm) : '',
  );
  // Open when the player already saved one of the optional numbers, so they see them.
  const [more, setMore] = React.useState(
    initial?.weightKg != null || initial?.age != null || initial?.heightCm != null,
  );
  const weightError = validateWeight(weight);
  const ageError = validateRange('age', age);
  const heightError = validateRange('heightCm', height);
  const fieldError = Boolean(weightError || ageError || heightError);
  // An empty name or Skip saves this: the player's current name, else a guest name drawn once
  // for this visit (it is also the field's placeholder, so what you see is what you get).
  const [fallbackName] = React.useState(() => initial?.displayName?.trim() || randomGuestName());
  const skip = () => onSubmit({ ...PROFILE_DEFAULTS, displayName: fallbackName });

  const submit = () => {
    if (fieldError) {
      setMore(true);
      return;
    }
    onSubmit({
      displayName: profileName(name, fallbackName),
      goal,
      level,
      weeklyGoalMin: Number(weekly),
      ...optionalNumbers({ age, weightKg: weight, heightCm: height }),
    });
  };

  useHotkey('Enter', submit, !fieldError);
  useHotkey('Escape', onBack);
  useHotkey('s', skip);

  return (
    <Screen
      backdrop="arena"
      className="profile-screen polish-screen"
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
            <GameButton
              type="submit"
              form="profile-form"
              size="lg"
              trailingIcon={ArrowRight}
              keyHint="ENTER"
              disabled={fieldError}
            >
              CONTINUE
            </GameButton>
          }
        />
      }
    >
      {nav && <NavBar {...nav} />}

      <SectionTitle
        as="h1"
        size="lg"
        title="Who's playing?"
        right={
          <GameButton variant="ghost" size="md" className="h-9 px-2 text-[20px]" onClick={skip}>
            Skip
          </GameButton>
        }
      />

      <form
        id="profile-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-7"
      >
        <div className="flex flex-col gap-6">
          <TextField
            label="Name"
            placeholder={fallbackName}
            maxLength={20}
            autoComplete="nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            hint=""
            trailing={
              <button
                type="button"
                aria-label="Random guest name"
                onClick={() => setName(randomGuestName())}
                className="focus-ring grid size-12 cursor-pointer place-items-center rounded-xl text-text-muted transition-colors hover:bg-text/[0.07] hover:text-lime"
              >
                <Dices className="size-6" />
              </button>
            }
          />
          <div className="flex flex-col gap-4">
            <span className="font-display text-caption text-text-muted">GOAL</span>
            <GoalPicker value={goal} onChange={setGoal} />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <span className="font-display text-caption text-text-muted">LEVEL</span>
            <SegmentedControl<FitnessLevel>
              aria-label="Level"
              value={level}
              onChange={setLevel}
              options={LEVELS}
              className="w-full [&>button]:min-w-0 [&>button]:flex-1"
            />
          </div>
          <GameButton
            variant="ghost"
            size="md"
            className="h-10 self-start px-0 text-[20px]"
            trailingIcon={ChevronDown}
            aria-expanded={more}
            aria-controls="profile-more"
            onClick={() => setMore((value) => !value)}
          >
            MORE OPTIONS
          </GameButton>
          {more && (
            <div
              id="profile-more"
              className="flex flex-col gap-6 border-t border-glass-border pt-5"
            >
              {' '}
              <div className="flex flex-col gap-4">
                <Eyebrow accent="muted">Weekly goal · minutes</Eyebrow>
                <SegmentedControl<WeeklyValue>
                  aria-label="Weekly goal in minutes"
                  value={weekly}
                  onChange={setWeekly}
                  options={WEEKLY}
                  className="w-full [&>button]:min-w-0 [&>button]:flex-auto [&>button]:px-4"
                />
                <p className="text-caption text-text-muted">Your weekly active-minute target.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  label="Weight (optional)"
                  type="number"
                  inputMode="decimal"
                  min={30}
                  max={250}
                  placeholder="70"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  error={weightError}
                  hint="For calorie estimates."
                  trailing={<span className="pr-3 text-caption text-text-muted">kg</span>}
                />
                <TextField
                  label="Age (optional)"
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={100}
                  placeholder="25"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  error={ageError}
                  hint="For your coach only."
                  trailing={<span className="pr-3 text-caption text-text-muted">yrs</span>}
                />
                <TextField
                  label="Height (optional)"
                  type="number"
                  inputMode="numeric"
                  min={100}
                  max={250}
                  placeholder="170"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  error={heightError}
                  hint="For your coach only."
                  trailing={<span className="pr-3 text-caption text-text-muted">cm</span>}
                />
              </div>
            </div>
          )}
        </div>
      </form>
    </Screen>
  );
}
