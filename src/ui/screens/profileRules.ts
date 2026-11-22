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

/** The optional numbers to save: only the filled, valid ones (an age is a whole number). */
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
    out[field] = field === 'age' ? Math.round(n) : n;
  }
  return out;
}
