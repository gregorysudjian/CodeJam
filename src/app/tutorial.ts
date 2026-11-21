// "Try each move" tutorial: which moves to show, and how to do each one. Pure; see tutorial.test.ts.
import type { InputSource, MoveType, SessionConfig } from '@/contracts';

const FLOOR: MoveType[] = ['sidestep', 'jump', 'squat', 'armsUp', 'reachLeft', 'reachRight'];
const TREADMILL: MoveType[] = ['reachLeft', 'reachRight', 'armsUp']; // upper body only

/** The moves the coming round can ask for: treadmill is upper body, low impact has no jumps. */
export function tutorialMoves(config: Pick<SessionConfig, 'mode' | 'lowImpact'>): MoveType[] {
  if (config.mode === 'treadmill') return TREADMILL;
  return config.lowImpact ? FLOOR.filter((m) => m !== 'jump') : FLOOR;
}

const BODY: Record<MoveType, string> = {
  sidestep: 'Step to the side',
  jump: 'Jump',
  squat: 'Squat down and hold',
  armsUp: 'Raise both arms',
  reachLeft: 'Raise your left arm',
  reachRight: 'Raise your right arm',
};

const KEYS: Record<MoveType, string> = {
  sidestep: '← or →',
  jump: '↑ or Space',
  squat: 'hold ↓',
  armsUp: 'hold W',
  reachLeft: 'hold Q',
  reachRight: 'hold E',
};

/** What to tell the player for a move, for the input they are using. */
export function moveHint(move: MoveType, kind: InputSource['kind']): string {
  return kind === 'keyboard' ? `${BODY[move]}: ${KEYS[move]}` : BODY[move];
}
