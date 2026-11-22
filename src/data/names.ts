// Display names go on a projector at the expo (kiosk, leaderboard). cleanDisplayName runs before
// any name is saved, in both stores; migration 0006 applies the same rules in the database, for
// names sent straight to the REST API. Keep the two term lists identical (names.test.ts checks).
import { NAME_MAX_COMBINING_MARKS, NAME_MAX_LENGTH } from './tuning';

/**
 * Blocked wherever the letters appear, even across spaces or inside a longer word. Only terms that
 * do not occur inside real names. Matched on lower-case letters with leetspeak folded (0→o, 1→i,
 * 3→e, 4→a, 5→s, 7→t, @→a, $→s, !→i), accents removed, and each letter allowed to repeat.
 */
export const BLOCKED_ANYWHERE = [
  'nigger',
  'nigga',
  'faggot',
  'fuck',
  'hitler',
  'whore',
  'bitch',
  'motherf',
];
/** Blocked only as a whole word: these letters also occur inside real names (Hancock, Nazir). */
export const BLOCKED_WORDS = [
  'fag',
  'cunt',
  'nazi',
  'slut',
  'kike',
  'chink',
  'spic',
  'retard',
  'rape',
  'porn',
  'shit',
  'dick',
  'cock',
  'pussy',
  'penis',
  'cum',
  'sex',
  'anal',
  'tits',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};
/** "fuck" → /f+u+c+k+/: catches "fuuuck" without blocking "Niger" for a double-g term. */
const loose = (term: string) => term.replace(/(.)/g, '$1+');
const ANYWHERE_RE = new RegExp(BLOCKED_ANYWHERE.map(loose).join('|'));
const WORD_RE = new RegExp(`^(?:${BLOCKED_WORDS.map(loose).join('|')})s?$`);

/** Lower case, accents removed, leetspeak folded; everything else that isn't a-z becomes a space. */
function fold(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[013457@$!]/g, (c) => LEET[c])
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

export function guestName(): string {
  return `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
}

/** Shown for a stored name that is blocked or unreadable (one saved before this cleaning). */
export const HIDDEN_NAME = 'Guest';

/** For saving: the cleaned name, or a new Guest-NNNN. */
export function nameOrGuest(raw: string | null | undefined): string {
  return cleanDisplayName(raw) ?? guestName();
}

/** For showing a name read back from the database or the cache. */
export function shownName(stored: string | null | undefined): string {
  return cleanDisplayName(stored) ?? HIDDEN_NAME;
}

/** A profile patch with its displayName (if any) cleaned for saving. */
export function cleanNamePatch<T extends { displayName?: string }>(patch: T): T {
  return patch.displayName === undefined
    ? patch
    : { ...patch, displayName: nameOrGuest(patch.displayName) };
}

export function isBlockedName(name: string): boolean {
  const folded = fold(name);
  if (ANYWHERE_RE.test(folded.replace(/ /g, ''))) return true;
  return folded.split(' ').some((w) => WORD_RE.test(w));
}

/**
 * The name as it will be shown, or null when nothing usable is left (empty, only invisible
 * characters or punctuation, or blocked): the caller then uses a Guest-NNNN name.
 */
export function cleanDisplayName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw
    .normalize('NFKC') // full-width and styled letters (𝐟𝐮𝐜𝐤) become plain ones
    // Invisible characters: zero-width spaces and joiners, bidi overrides (‮ shows text
    // reversed), soft hyphens, BOM, private-use and unassigned code points, lone surrogates.
    .replace(/[\p{Cf}\p{Co}\p{Cn}\p{Cs}]/gu, '')
    // Control characters (newline, tab) and line separators count as spaces.
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
    // "Zalgo": keep at most a few combining marks on one letter.
    .replace(new RegExp(`(\\p{M}{${NAME_MAX_COMBINING_MARKS}})\\p{M}+`, 'gu'), '$1')
    .replace(/\s+/gu, ' ')
    .trim();
  // Cut by code points, so an emoji is never split in half (half an emoji is invalid JSON).
  s = Array.from(s).slice(0, NAME_MAX_LENGTH).join('').trim();
  if (!/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(s)) return null;
  if (isBlockedName(s)) return null;
  return s;
}
