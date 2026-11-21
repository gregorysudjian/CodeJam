import * as React from "react";
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
} from "lucide-react";
import type { FitnessLevel, Goal, Profile } from "@/contracts";
import {
  Eyebrow,
  GameButton,
  SectionTitle,
  SegmentedControl,
  Screen,
  ScreenFooter,
  TextField,
  useHotkey,
} from "@/ui/kit";
import { cn } from "@/ui/lib/utils";

export type ProfileInput = Omit<Profile, "id">;

export interface ProfileScreenProps {
  initial?: Partial<ProfileInput>;
  onSubmit(p: ProfileInput): void;
  onBack(): void;
}

export const PROFILE_DEFAULTS: ProfileInput = {
  displayName: "Guest-1234",
  goal: "getMoving",
  level: "beginner",
  weeklyGoalMin: 60,
};

const GOALS: { value: Goal; label: string; body: string; icon: LucideIcon }[] = [
  { value: "getMoving", label: "Get moving", body: "Build a daily habit", icon: Footprints },
  {
    value: "buildStrength",
    label: "Build strength",
    body: "Squats, presses, power",
    icon: Dumbbell,
  },
  { value: "cardio", label: "Cardio", body: "Keep the heart rate up", icon: HeartPulse },
];

const LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "regular", label: "Regular" },
  { value: "athlete", label: "Athlete" },
] as const satisfies readonly { value: FitnessLevel; label: string }[];

const WEEKLY = [
  { value: "30", label: "30" },
  { value: "60", label: "60" },
  { value: "90", label: "90" },
  { value: "150", label: "150 min" },
] as const;
type WeeklyValue = (typeof WEEKLY)[number]["value"];

const randomGuest = () => `Guest-${String(Math.floor(1000 + Math.random() * 9000))}`;

export function validateWeight(raw: string): string | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 30 || n > 250) return "Enter a weight between 30 and 250 kg.";
  return null;
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
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                go(i + 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                go(i - 1);
              }
            }}
            className={cn(
              "glass focus-ring relative flex min-h-36 cursor-pointer flex-col items-start justify-between gap-4 rounded-[24px] p-4 text-left transition-[border-color,box-shadow,transform] duration-200 ease-arena active:scale-[0.98]",
              selected ? "glow-edge-lime" : "hover:border-white/20",
            )}
          >
            <span
              className={cn(
                "grid size-10 place-items-center rounded-2xl",
                selected ? "bg-lime text-bg" : "bg-white/[0.06] text-text-muted",
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

/** Player setup: name, goal, level, weekly minutes and optional weight. */
export function ProfileScreen({ initial, onSubmit, onBack }: ProfileScreenProps) {
  const [name, setName] = React.useState(initial?.displayName ?? "");
  const [goal, setGoal] = React.useState<Goal>(initial?.goal ?? PROFILE_DEFAULTS.goal);
  const [level, setLevel] = React.useState<FitnessLevel>(initial?.level ?? PROFILE_DEFAULTS.level);
  const [weekly, setWeekly] = React.useState<WeeklyValue>(() => {
    const v = String(initial?.weeklyGoalMin ?? PROFILE_DEFAULTS.weeklyGoalMin);
    return WEEKLY.find((w) => w.value === v)?.value ?? "60";
  });
  const [weight, setWeight] = React.useState(
    initial?.weightKg != null ? String(initial.weightKg) : "",
  );
  const [more, setMore] = React.useState(false);
  const weightError = validateWeight(weight);

  const submit = () => {
    if (weightError) return;
    const out: ProfileInput = {
      displayName: name.trim().slice(0, 20) || PROFILE_DEFAULTS.displayName,
      goal,
      level,
      weeklyGoalMin: Number(weekly),
    };
    if (weight.trim() !== "") out.weightKg = Number(weight);
    onSubmit(out);
  };

  useHotkey("Enter", submit, !weightError);
  useHotkey("Escape", onBack);
  useHotkey("s", () => onSubmit({ ...PROFILE_DEFAULTS }));

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
              disabled={Boolean(weightError)}
            >
              CONTINUE
            </GameButton>
          }
        />
      }
    >
      <SectionTitle
        as="h1"
        size="lg"
        title="Who's playing?"
        right={
          <GameButton
            variant="ghost"
            size="md"
            className="h-9 px-2 text-[20px]"
            onClick={() => onSubmit({ ...PROFILE_DEFAULTS })}
          >
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
            placeholder="Guest-1234"
            maxLength={20}
            autoComplete="nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            hint=""
            trailing={
              <button
                type="button"
                aria-label="Random guest name"
                onClick={() => setName(randomGuest())}
                className="focus-ring grid size-12 cursor-pointer place-items-center rounded-xl text-text-muted transition-colors hover:bg-white/[0.08] hover:text-lime"
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
              {" "}
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
                trailing={
                  <span className="px-4 font-display-italic text-title text-text-muted">kg</span>
                }
              />
            </div>
          )}
        </div>
      </form>
    </Screen>
  );
}
