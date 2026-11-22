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
