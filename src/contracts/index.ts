// src/contracts/index.ts

/* ───────── Vocabulary ───────── */

export type WorkoutId = 'legs' | 'arms' | 'shoulders' | 'fullBody';
export type PlayMode = 'floor' | 'treadmill';
export type Lane = -1 | 0 | 1; // player's left, centre, player's right

export type MoveType = 'sidestep' | 'jump' | 'squat' | 'armsUp' | 'reachLeft' | 'reachRight';

export type ObstacleKind = 'block' | 'hurdle' | 'beam' | 'crate' | 'orb';

export interface SessionConfig {
  workout: WorkoutId;
  mode: PlayMode;
  durationSec: number; // 45 demo, 90 standard, 180 long
  difficulty?: number; // 0 to 1, default 0.5; the coach sets it from history
  lowImpact?: boolean; // true = no hurdles
  seed?: number; // same seed, same level; integer 0 to 2^31 - 1 (stored as Postgres int)
}

/* ───────── Input: owner A (pose) and B (keyboard) ───────── */

export interface InputState {
  tracking: boolean; // false = player not visible, game should pause
  lane: Lane;
  ducking: boolean; // true while the squat is held
  airborne: boolean; // true from take-off for at least 450 ms
  leftArmUp: boolean;
  rightArmUp: boolean;
}

export interface MoveEvent {
  type: MoveType;
  t: number; // performance.now()
}

export interface InputSource {
  readonly kind: 'pose' | 'keyboard';
  start(): Promise<void>; // pose: asks for the camera
  stop(): void;
  getState(): InputState; // the game polls this once per frame
  onMove(cb: (e: MoveEvent) => void): () => void; // one event per rep; returns unsubscribe
}

export interface CalibrationStatus {
  step: 'noBody' | 'tooClose' | 'tooFar' | 'holdStill' | 'done';
  progress: number; // 0 to 1 while holding still
  message: string; // text the UI shows as is
}

export interface PoseInputSource extends InputSource {
  readonly kind: 'pose';
  readonly video: HTMLVideoElement; // the UI mirrors it with CSS scaleX(-1)
  calibrate(mode: PlayMode, onStatus: (s: CalibrationStatus) => void): Promise<void>;
  drawSkeleton(ctx: CanvasRenderingContext2D): void; // for the preview and debug overlay
}

// src/pose/index.ts      export function createPoseInput(): PoseInputSource
// src/input/index.ts     export function createKeyboardInput(): InputSource

/* ───────── Level: owner C ───────── */

export interface Spawn {
  kind: ObstacleKind;
  lanes: Lane[]; // lanes it occupies; hurdle, beam and crate use all three
  requires: MoveType; // the move that clears it; also drives the HUD cue
  holdSec?: number; // length of a long object (squat hold, overhead hold); default 0
}

export interface Wave {
  t: number; // second at which it reaches the player
  intensity: number; // 0 to 1; the game maps it to speed, the UI to music
  spawns: Spawn[];
}

export interface Level {
  config: SessionConfig;
  waves: Wave[]; // sorted by t
}

// src/workout/index.ts   export function generateLevel(config: SessionConfig): Level
//                        Always returns a complete level.config: fills difficulty (0.5),
//                        lowImpact (false) and seed (random when missing). The app passes
//                        level.config, not its own config, to createSessionTracker, so the
//                        saved session records the seed that was actually played.
//                        export const WORKOUTS: Record<WorkoutId, WorkoutInfo>

export interface WorkoutInfo {
  id: WorkoutId;
  name: string;
  tagline: string;
  moves: MoveType[]; // shown on the select card
  availableIn: PlayMode[];
}

/* ───────── Game: owner B ───────── */

export type GameEvent =
  | { type: 'cue'; wave: Wave; inSec: number } // fired about 2 s before a wave arrives
  | { type: 'cleared'; spawn: Spawn; t: number }
  | { type: 'hit'; spawn: Spawn; t: number }
  | { type: 'collected'; spawn: Spawn; t: number } // orbs only
  | { type: 'paused'; reason: 'trackingLost' | 'user' }
  | { type: 'resumed' }
  | { type: 'finished' };

export interface Game {
  start(): void;
  pause(): void;
  resume(): void;
  destroy(): void; // stops the loop and frees WebGL resources
  getElapsedSec(): number;
  onEvent(cb: (e: GameEvent) => void): () => void;
}

// src/game/index.ts      export function createGame(
//                          canvas: HTMLCanvasElement, level: Level, input: InputSource): Game

/* ───────── Stats: owner C ───────── */

export interface LiveStats {
  score: number;
  streak: number;
  multiplier: number;
  reps: Record<MoveType, number>;
  kcal: number;
}

export interface SessionSummary extends LiveStats {
  config: SessionConfig;
  bestStreak: number;
  cleared: number;
  hit: number;
  accuracy: number; // cleared / (cleared + hit)
  missed: Record<MoveType, number>; // hits, counted by the move that was required
  activeSec: number;
}

export interface SessionTracker {
  handleGameEvent(e: GameEvent): void;
  handleMove(e: MoveEvent): void;
  getLive(): LiveStats; // the HUD polls this
  finish(activeSec: number): SessionSummary;
}

// src/workout/index.ts   export function createSessionTracker(
//                          config: SessionConfig, opts?: { weightKg?: number }): SessionTracker

/* ───────── Data and backend: owner C ───────── */

export type Goal = 'getMoving' | 'buildStrength' | 'cardio';
export type FitnessLevel = 'beginner' | 'regular' | 'athlete';

export interface Profile {
  id: string; // Supabase auth user id
  displayName: string;
  goal: Goal;
  level: FitnessLevel;
  weightKg?: number; // optional; 70 is assumed for calories when missing
  weeklyGoalMin: number; // active minutes per week, default 60
}

export interface SavedSession extends SessionSummary {
  id: string;
  at: number; // Date.now()
  synced: boolean; // false while it waits in the offline queue
}

export interface LeaderboardEntry {
  displayName: string;
  score: number;
  workout: WorkoutId;
  mode: PlayMode;
  at: number;
}

export interface CoachAdvice {
  recap: string; // two sentences about the session just played
  tip: string; // one concrete thing to try next time
  next: SessionConfig; // the recommended next session
  reason: string; // one sentence on why that session
  source: 'ai' | 'rules';
}

export interface DataStore {
  readonly kind: 'supabase' | 'local';
  signInGuest(displayName?: string): Promise<Profile>; // reuses the existing user if there is one;
  //   always ensures the profiles row exists before resolving (defaults below)
  getProfile(): Promise<Profile | null>;
  saveProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<Profile>;
  saveSession(summary: SessionSummary): Promise<SavedSession>; // never rejects; queues when offline
  listSessions(limit?: number): Promise<SavedSession[]>; // newest first
  getLeaderboard(workout: WorkoutId, mode: PlayMode, limit?: number): Promise<LeaderboardEntry[]>;
  getCoachAdvice(session: SavedSession): Promise<CoachAdvice>; // never rejects; falls back to rules
  signOut(): Promise<void>; // forgets the current guest; the next signInGuest creates a new user
}

// src/data/index.ts      export function createStore(): DataStore
//                        Returns the Supabase store, or the local store when the URL has
//                        ?store=local or the Supabase environment variables are missing.
