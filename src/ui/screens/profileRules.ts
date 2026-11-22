import * as React from 'react';

/** Longest name the board shows; longer input is cut. */
export const MAX_NAME_LENGTH = 20;

/** "Guest-4821": four random digits. */
export function randomGuestName(random: () => number = Math.random): string {
  return `Guest-${String(Math.floor(1000 + random() * 9000))}`;
}

/**
 * The name to save: what the player typed, trimmed and cut, or, when the field is empty, their
 * fallback (their current name, or a guest name drawn once for this visit). Never a fixed
 * placeholder: every cleared name used to become the same "Guest-1234" on the board.
 */
export function profileName(typed: string, fallback: string): string {
  return typed.trim().slice(0, MAX_NAME_LENGTH) || fallback;
}

/** Sign-up on the landing page: the username is required (the dice fills a guest name). */
export function validateName(typed: string): string | null {
  return typed.trim() === '' ? 'Pick a username, or roll the dice for one.' : null;
}

/** Optional number fields: what each one accepts (contracts: Profile.age, weightKg, heightCm). */
export const PROFILE_RANGES = {
  age: { min: 10, max: 100, unit: 'years', what: 'an age' },
  weightKg: { min: 30, max: 250, unit: 'kg', what: 'a weight' },
  heightCm: { min: 100, max: 250, unit: 'cm', what: 'a height' },
} as const;
export type RangedField = keyof typeof PROFILE_RANGES;

/** Empty is fine (the field is optional); otherwise a number inside the field's range. */
export function validateRange(field: RangedField, raw: string): string | null {
  if (raw.trim() === '') return null;
  const { min, max, unit, what } = PROFILE_RANGES[field];
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    return `Enter ${what} between ${min} and ${max} ${unit}.`;
  }
  return null;
}

/** The optional numbers to save: only the filled, valid ones, rounded as the database stores them. */
export function optionalNumbers(raw: Record<RangedField, string>): {
  age?: number;
  weightKg?: number;
  heightCm?: number;
} {
  const out: { age?: number; weightKg?: number; heightCm?: number } = {};
  for (const field of Object.keys(PROFILE_RANGES) as RangedField[]) {
    const value = raw[field];
    if (value.trim() === '' || validateRange(field, value)) continue;
    const n = Number(value);
    // The database stores age as a whole number and height to 0.1 cm (migration 0006).
    out[field] =
      field === 'age' ? Math.round(n) : field === 'heightCm' ? Math.round(n * 10) / 10 : n;
  }
  return out;
}

// ── Unique usernames (PR #116: DataStore.isUsernameTaken) ──

/** Tuning: how long the username field waits after the last keystroke before asking whether
 *  the name is taken (one request per pause, not per key). */
export const USERNAME_CHECK_DELAY_MS = 400;

/** "Is this username taken?": true, false, or null when unknown (offline, local store). */
export type UsernameCheck = (name: string) => Promise<boolean | null>;

/** Shown under the name field when the check says the name is taken. */
export const USERNAME_TAKEN = 'Username taken';

/**
 * The name a check asks about: what would be saved (trimmed and cut). '' means nothing to ask:
 * an empty field, or the player's own current name (usernames are unique ignoring case, and the
 * player's own name would always come back taken).
 */
export function usernameToCheck(typed: string, ownName?: string): string {
  const name = typed.trim().slice(0, MAX_NAME_LENGTH);
  if (ownName && name.toLowerCase() === ownName.trim().toLowerCase()) return '';
  return name;
}

/**
 * Debounced username check, without React so it can be tested with fake timers. `update` waits
 * `delayMs` after the last call, then asks; only the latest name's answer is reported. A check
 * that throws or rejects counts as unknown (null).
 */
export function createUsernameChecker(
  check: UsernameCheck,
  onAnswer: (name: string, taken: boolean | null) => void,
  delayMs: number = USERNAME_CHECK_DELAY_MS,
): { update(name: string): void; dispose(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest = 0;
  return {
    update(name) {
      clearTimeout(timer);
      const ticket = ++latest;
      if (!name) return;
      timer = setTimeout(() => {
        Promise.resolve()
          .then(() => check(name))
          .catch(() => null)
          .then((taken) => {
            if (ticket === latest) onAnswer(name, taken ?? null);
          });
      }, delayMs);
    },
    dispose() {
      clearTimeout(timer);
      latest++;
    },
  };
}

/** True once the check says the typed name is taken; false while typing, for a free or unknown
 *  name, for the player's own name, and when there is no check. */
export function useUsernameTaken(typed: string, check?: UsernameCheck, ownName?: string): boolean {
  const name = usernameToCheck(typed, ownName);
  const enabled = Boolean(check);
  const [answer, setAnswer] = React.useState<{ name: string; taken: boolean | null } | null>(null);
  // The latest check without restarting the timer when the caller passes a new function.
  const checkRef = React.useRef(check);
  React.useEffect(() => {
    checkRef.current = check;
  });
  React.useEffect(() => {
    if (!enabled || !name) return;
    const checker = createUsernameChecker(
      (n) => checkRef.current?.(n) ?? Promise.resolve(null),
      (n, taken) => setAnswer({ name: n, taken }),
    );
    checker.update(name);
    return () => checker.dispose();
  }, [name, enabled]);
  return enabled && name !== '' && answer?.name === name && answer.taken === true;
}
