// Every tunable number for src/app (AGENTS.md rule 10).

/** The HUD re-renders from a poll at this interval, never per frame (AGENTS.md rule 6). */
export const HUD_POLL_MS = 100;

/**
 * After the game emits 'finished', wait this long before showing the results, so the game's
 * finish arch and fanfare can play (Patrick's request #5).
 */
export const FINISH_DELAY_MS = 1500;

/** After the player has been out of frame this long, offer the keyboard under the HUD. */
export const TRACKING_LOST_HINT_MS = 3000;

/** Kiosk leaderboard (?kiosk=1) for the demo table: refresh interval and number of rows. */
export const KIOSK_REFRESH_MS = 15000;
export const LEADERBOARD_SIZE = 20;
/** The board shown first (landing top 3, kiosk, leaderboard): judges play the 45 s demo round. */
export const BOARD_DEFAULT_DURATION_SEC = 45;

/** "Try each move" tutorial before a player's first round: time per move (about 15 s in total). */
export const TUTORIAL_STEP_MS = 2500;
/** Results with the camera: raising both arms plays again, but only after this long, so arms still
 * up from the last obstacle can't restart the round by accident. */
export const HANDS_FREE_ARM_MS = 1500;
