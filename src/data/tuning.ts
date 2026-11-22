// Every tunable number for src/data (AGENTS.md rule 10).

/** The client gives up on /api/coach after this long and uses the rule-based coach. */
export const COACH_CLIENT_TIMEOUT_MS = 8000;
/** signOut waits at most this long to send queued sessions before signing out anyway (bad wifi). */
export const SIGNOUT_FLUSH_TIMEOUT_MS = 2000;
/** A Supabase call slower than this counts as offline (the session is queued). */
export const SUPABASE_TIMEOUT_MS = 5000;
/** A read slower than this answers from the cache when there is one (the request carries on). */
export const READ_CACHE_AFTER_MS = 1000;
/** saveSession waits this long for the send, then answers "queued" (the send carries on). */
export const SAVE_WAIT_MS = 1500;

/** Rule-based coach (docs/CONTRACTS.md). */
export const DIFFICULTY_DEFAULT = 0.5;
/** Difficulty is a tier (CONTRACTS.md): beginner, regular, athlete. The coach moves one tier. */
export const COACH_TIERS = [0, 0.5, 1] as const;
export const ACCURACY_RAISE_ABOVE = 0.85;
export const ACCURACY_LOWER_BELOW = 0.6;
/** Out of lives before reaching this level: one tier down, whatever the accuracy. */
export const COACH_STRUGGLE_BELOW_LEVEL = 3;
export const COACH_WEEK_MS = 7 * 24 * 3600 * 1000;
/** A round is every level in a row: 6 levels of 30 s. */
export const COACH_ROUND_SEC = 180;
export const LEVEL_SEC = 30;

/** Display names (names.ts): the profile screen's limit; the database allows 40. */
export const NAME_MAX_LENGTH = 20;
/** Combining marks kept on one letter (enough for Hindi, Thai, Vietnamese; stops "Zalgo"). */
export const NAME_MAX_COMBINING_MARKS = 3;

/** Local storage. */
export const LOCAL_MAX_SESSIONS = 200;
export const DEFAULT_WEEKLY_GOAL_MIN = 60;
