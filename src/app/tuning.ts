// Every tunable number for src/app (AGENTS.md rule 10).

/** The HUD re-renders from a poll at this interval, never per frame (AGENTS.md rule 6). */
export const HUD_POLL_MS = 100;

/**
 * After the game emits 'finished', wait this long before showing the results, so the game's
 * finish arch and fanfare can play (Patrick's request #5).
 */
export const FINISH_DELAY_MS = 1500;
