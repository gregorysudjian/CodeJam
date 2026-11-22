import * as React from 'react';
import { useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Dices, Loader2, Lock, Play, Trophy, UserPlus } from 'lucide-react';
import type { FitnessLevel, Goal, LeaderboardEntry } from '@/contracts';
import {
  Eyebrow,
  GameButton,
  GlassPanel,
  Screen,
  SegmentedControl,
  TextField,
  useHotkey,
} from '@/ui/kit';
import { formatNumber } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { PROFILE_DEFAULTS, type ProfileInput } from '@/ui/screens/ProfileScreen';
import {
  MAX_NAME_LENGTH,
  optionalNumbers,
  profileName,
  randomGuestName,
  useUsernameTaken,
  USERNAME_TAKEN,
  validateName,
  validateRange,
  type RangedField,
  type UsernameCheck,
} from '@/ui/screens/profileRules';

export interface LandingScreenProps {
  appName: string;
  onPlayAsGuest(): void;
  /** New player: the sign-up card's START. Without it the landing shows the old big
   *  "Play as guest" button instead of the card. */
  onSignUp?(p: ProfileInput): void;
  /** Sign-up: is this username taken? (DataStore.isUsernameTaken). Asked after a pause in
   *  typing; true shows "Username taken" and disables START; false or null (unknown) show
   *  nothing. Absent: no check, as before. */
  checkUsername?: UsernameCheck;
  returning?: { displayName: string; bestScore?: number } | null;
  onContinue?(): void;
  onLeaderboard?(): void;
  topScores?: LeaderboardEntry[];
  qrSlot?: React.ReactNode;
  publicUrl?: string;
  /** True while the sign-in runs: the start buttons show a spinner and ignore clicks/Enter. */
  busy?: boolean;
}

/** Busy start button: still bright (it is working, not off), with its leading icon spinning
 *  (the global reduced-motion rule stops the spin). */
const SPIN =
  'cursor-wait disabled:opacity-80 disabled:saturate-100 [&>svg:first-of-type]:animate-spin';

const GOALS = [
  { value: 'getMoving', label: 'Get moving' },
  { value: 'buildStrength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
] as const satisfies readonly { value: Goal; label: string }[];

const LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'regular', label: 'Regular' },
  { value: 'athlete', label: 'Athlete' },
] as const satisfies readonly { value: FitnessLevel; label: string }[];

const NUMBER_FIELDS: { field: RangedField; label: string; unit: string }[] = [
  { field: 'age', label: 'Age', unit: 'yrs' },
  { field: 'weightKg', label: 'Weight', unit: 'kg' },
  { field: 'heightCm', label: 'Height', unit: 'cm' },
];

/** The landing clip (Greg's g2-media). Served from public/, so the demo works offline. */
const HERO_VIDEO = '/media/landing-montreal.mp4';

/** Muted looping clip behind the hero. Invisible until it really plays, so a missing file, a
 *  decode error or a blocked autoplay leaves the plain panel underneath; never mounted under
 *  prefers-reduced-motion. */
function HeroVideo({ src }: { src: string }) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // The property too: React does not always reflect `muted`, and Chrome autoplays only muted.
    video.muted = true;
    video.play().catch(() => setFailed(true));
  }, [src, reduce]);
  if (reduce || failed) return null;
  return (
    <video
      ref={ref}
      src={src}
      muted
      autoPlay
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      aria-hidden="true"
      tabIndex={-1}
      onPlaying={() => setPlaying(true)}
      onError={() => setFailed(true)}
      className={cn(
        'absolute inset-0 size-full object-cover transition-opacity duration-1000',
        playing ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}

/** The sign-up card: username, optional age/weight/height, goal and level, one START. */
function SignUpCard({
  onSignUp,
  checkUsername,
  onPlayAsGuest,
  onCancel,
  busy,
}: {
  onSignUp(p: ProfileInput): void;
  checkUsername?: UsernameCheck;
  onPlayAsGuest(): void;
  /** Back to "Continue as …" (a returning player who chose New player). */
  onCancel?: () => void;
  busy: boolean;
}) {
  const [name, setName] = React.useState('');
  const [numbers, setNumbers] = React.useState<Record<RangedField, string>>({
    age: '',
    weightKg: '',
    heightCm: '',
  });
  const [goal, setGoal] = React.useState<Goal>(PROFILE_DEFAULTS.goal);
  const [level, setLevel] = React.useState<FitnessLevel>(PROFILE_DEFAULTS.level);
  // The name error waits for the first START, so the card doesn't open on a red field.
  const [tried, setTried] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);

  const taken = useUsernameTaken(name, checkUsername);
  const nameError = taken ? USERNAME_TAKEN : tried ? validateName(name) : null;
  const rangeErrors = NUMBER_FIELDS.map(({ field }) => validateRange(field, numbers[field]));
  const invalid = validateName(name) !== null || rangeErrors.some(Boolean);

  const submit = () => {
    if (busy || taken) return;
    setTried(true);
    if (invalid) {
      if (validateName(name)) nameRef.current?.focus();
      return;
    }
    onSignUp({
      ...PROFILE_DEFAULTS,
      displayName: profileName(name, ''),
      goal,
      level,
      ...optionalNumbers(numbers),
    });
  };

  // Enter in a field submits the form; this covers Enter with nothing focused.
  useHotkey('Enter', submit, !busy);
  useHotkey('Escape', () => onCancel?.(), Boolean(onCancel));

  return (
    <GlassPanel as="section" padding="none" aria-label="New player" className="landing-signup p-6">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <TextField
          ref={nameRef}
          label="Username"
          placeholder="e.g. MapleRunner"
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError}
          trailing={
            <button
              type="button"
              aria-label="Random username"
              onClick={() => setName(randomGuestName())}
              className="focus-ring grid size-11 cursor-pointer place-items-center rounded-xl text-text-muted transition-colors hover:bg-text/[0.07] hover:text-lime"
            >
              <Dices className="size-6" />
            </button>
          }
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="eyebrow mb-2 text-text-muted">
            Optional · for calories and your coach
          </legend>
          <div className="grid grid-cols-3 gap-3">
            {NUMBER_FIELDS.map(({ field, label, unit }, i) => (
              <TextField
                key={field}
                label={label}
                type="number"
                inputMode="decimal"
                value={numbers[field]}
                onChange={(e) => setNumbers((n) => ({ ...n, [field]: e.target.value }))}
                error={rangeErrors[i]}
                trailing={<span className="pr-3 text-caption text-text-muted">{unit}</span>}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <span className="eyebrow text-text-muted">Goal</span>
          <SegmentedControl<Goal>
            aria-label="Goal"
            size="md"
            value={goal}
            onChange={setGoal}
            options={GOALS}
            className="w-full [&>button]:min-w-0 [&>button]:flex-1 [&>button]:px-2"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="eyebrow text-text-muted">Fitness level · sets your starting tier</span>
          <SegmentedControl<FitnessLevel>
            aria-label="Fitness level"
            size="md"
            value={level}
            onChange={setLevel}
            options={LEVELS}
            className="w-full [&>button]:min-w-0 [&>button]:flex-1 [&>button]:px-2"
          />
        </div>

        <GameButton
          type="submit"
          size="lg"
          keyHint={busy ? undefined : 'ENTER'}
          leadingIcon={busy ? Loader2 : Play}
          className={cn('w-full', busy && SPIN)}
          disabled={busy || taken}
          aria-busy={busy}
        >
          {busy ? 'Starting…' : 'Start'}
        </GameButton>
        <div className="flex items-center justify-between gap-4">
          {onCancel ? (
            <GameButton
              type="button"
              variant="ghost"
              size="md"
              leadingIcon={ArrowLeft}
              keyHint="ESC"
              className="h-9 px-2 text-[18px]"
              onClick={onCancel}
            >
              Back
            </GameButton>
          ) : (
            <span />
          )}
          <GameButton
            type="button"
            variant="ghost"
            size="md"
            className="h-9 px-2 text-[18px]"
            onClick={onPlayAsGuest}
            disabled={busy}
          >
            Play as guest
          </GameButton>
        </div>
      </form>
    </GlassPanel>
  );
}

/** First screen and sign-up in one: hero on the left; on the right the sign-up card for a new
 *  player, or "Continue as …" for a returning one. Top 3 and the QR sit small under the hero. */
export function LandingScreen({
  appName,
  onPlayAsGuest,
  onSignUp,
  checkUsername,
  returning,
  onContinue,
  onLeaderboard,
  topScores,
  qrSlot,
  publicUrl,
  busy = false,
}: LandingScreenProps) {
  const isReturning = Boolean(returning && onContinue);
  // A returning player who taps "New player" gets the sign-up card (or a guest, without one).
  const [newPlayer, setNewPlayer] = React.useState(false);
  const showSignUp = Boolean(onSignUp) && (!isReturning || newPlayer);
  const scores = (topScores ?? []).slice(0, 3);
  const topThree = (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1">
      <Eyebrow accent="cyan">Today's top 3</Eyebrow>
      <ol className="flex flex-wrap gap-x-5 gap-y-1">
        {scores.map((entry, i) => (
          <li
            key={`${entry.displayName}-${entry.at}`}
            className="flex items-baseline gap-2 font-display-italic text-[20px]"
          >
            <span className={i === 0 ? 'text-lime' : 'text-text-dim'}>{i + 1}</span>
            <span className="max-w-28 truncate">{entry.displayName}</span>
            <span className="text-lime">{formatNumber(entry.score)}</span>
          </li>
        ))}
      </ol>
    </div>
  );

  // The sign-up card binds its own Enter; this is the returning and the no-card case.
  useHotkey(
    'Enter',
    () => (isReturning && onContinue ? onContinue() : onPlayAsGuest()),
    !busy && !showSignUp,
  );

  return (
    <Screen backdrop="track" className="landing-screen polish-screen">
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-11 place-items-center rounded-xl bg-lime text-bg shadow-[var(--na-shadow)]"
          >
            <Play className="size-5 fill-current" strokeWidth={2.5} />
          </span>
          <span className="font-display-italic text-[28px] leading-none">{appName}</span>
        </div>
        {scores.length > 0 ? (
          <div className="hidden min-w-0 flex-1 justify-center lg:flex">{topThree}</div>
        ) : null}
        {onLeaderboard ? (
          <GameButton variant="ghost" size="md" leadingIcon={Trophy} onClick={onLeaderboard}>
            Leaderboard
          </GameButton>
        ) : null}
      </header>

      <section className="landing-grid grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)]">
        {/* Hero */}
        <div className="landing-hero flex min-w-0 flex-col gap-5">
          {/* The stage: the Montreal clip behind the title, on a dark slate panel. The awning and
              fleur-de-lis show while the clip loads, if it fails and under reduced motion. */}
          <div className="landing-stage relative overflow-hidden rounded-[28px] bg-[var(--na-slate)] shadow-[var(--na-shadow)]">
            <div aria-hidden="true" className="landing-photo">
              <img
                src="/media/ui/fleurdelis.webp"
                alt=""
                className="landing-photo-fade absolute bottom-0 right-[225px] h-40 w-auto max-sm:hidden"
              />
              <img
                src="/media/ui/awning.webp"
                alt=""
                className="landing-photo-fade absolute right-0 top-0 h-36 w-auto"
              />
            </div>
            <HeroVideo src={HERO_VIDEO} />
            <div aria-hidden="true" className="landing-stage-scrim absolute inset-0" />
            <div className="relative flex flex-col gap-3 p-7 short:p-6">
              <Eyebrow accent="muted">Webcam fitness game · Montréal</Eyebrow>
              <h1 className="font-display-italic text-display-md leading-[0.9] text-text sm:text-display-lg short:text-display-md">
                Run Montréal <span className="text-lime">with your body</span>
              </h1>
              <p className="max-w-xl text-body text-text-muted">
                Sidestep, jump, squat and reach through the city. Your webcam is the controller.
              </p>
              <p className="landing-stage-levels font-display-italic text-title leading-none text-text">
                6 levels · 3 lives
              </p>
            </div>
          </div>

          <p className="flex items-center gap-2 text-caption text-text-muted">
            <Lock aria-hidden="true" className="size-4 text-cyan" />
            Tracking runs on this laptop. Your video never leaves it.
          </p>

          {scores.length > 0 || (qrSlot && publicUrl) ? (
            <div className="landing-extras flex flex-wrap items-center justify-between gap-6 border-t border-glass-border pt-4">
              {scores.length > 0 ? <div className="lg:hidden">{topThree}</div> : null}
              {qrSlot && publicUrl ? (
                <div className="flex items-center gap-3">
                  {/* Dark modules on a white tile: the polarity every phone camera scans. */}
                  <div className="grid size-20 shrink-0 place-items-center rounded-lg border border-glass-border bg-white p-1.5 text-[#1f2429] [&>svg]:size-full">
                    {qrSlot}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display-italic text-[20px] leading-none text-cyan">
                      Play on your laptop
                    </p>
                    <p className="mt-1 max-w-48 truncate text-caption text-text-muted">
                      {publicUrl}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Right: sign-up, continue, or the old guest button */}
        <div className="min-w-0">
          {showSignUp && onSignUp ? (
            <SignUpCard
              onSignUp={onSignUp}
              checkUsername={checkUsername}
              onPlayAsGuest={onPlayAsGuest}
              onCancel={isReturning ? () => setNewPlayer(false) : undefined}
              busy={busy}
            />
          ) : isReturning && returning ? (
            <GlassPanel as="section" aria-label="Returning player" className="flex flex-col gap-5">
              <Eyebrow>Welcome back</Eyebrow>
              <GameButton
                size="xl"
                keyHint={busy ? undefined : 'ENTER'}
                {...(busy ? { leadingIcon: Loader2 } : { trailingIcon: ArrowRight })}
                onClick={onContinue}
                className={cn('w-full', busy && SPIN)}
                disabled={busy}
                aria-busy={busy}
              >
                <span className="block min-w-0 truncate">
                  {busy ? 'Starting…' : `Continue as ${returning.displayName}`}
                </span>
              </GameButton>
              {returning.bestScore != null ? (
                <p className="text-caption text-text-muted">
                  Your best:{' '}
                  <span className="font-semibold text-text">
                    {formatNumber(returning.bestScore)}
                  </span>
                </p>
              ) : null}
              <GameButton
                variant="ghost"
                size="md"
                leadingIcon={UserPlus}
                className="h-10 self-start px-2 text-[20px]"
                onClick={() => (onSignUp ? setNewPlayer(true) : onPlayAsGuest())}
                disabled={busy}
              >
                New player
              </GameButton>
            </GlassPanel>
          ) : (
            <GlassPanel as="section" aria-label="Play" className="flex flex-col gap-4">
              <GameButton
                size="xl"
                keyHint={busy ? undefined : 'ENTER'}
                leadingIcon={busy ? Loader2 : Play}
                onClick={onPlayAsGuest}
                className={cn('w-full', busy && SPIN)}
                disabled={busy}
                aria-busy={busy}
              >
                {busy ? 'Starting…' : 'Play as guest'}
              </GameButton>
            </GlassPanel>
          )}
        </div>
      </section>
    </Screen>
  );
}
