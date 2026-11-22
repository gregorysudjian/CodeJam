# Shared contracts

Agree on this file at kickoff, paste the code block into `src/contracts/index.ts`, and freeze it. After that, a change needs all four people to say yes, and D makes it on `main`.

Each module exports exactly the factory named here from its `index.ts`. Modules import types from `src/contracts` and never from each other. Only `src/app/` imports the modules.

Every outside dependency has a stand-in behind the same interface: the keyboard for the camera, the local store for Supabase, the rule-based coach for Claude. Build and test against the stand-in first.

## Conventions

- **Left and right are the player's own.** The video is shown mirrored, so the player's right is the right side of the screen. Lane `+1` is the player's right.
- **Mirroring trap:** MediaPipe returns coordinates for the unmirrored image, so a step to the player's right makes `x` smaller. A uses `1 - x` once, inside `src/pose/`, and nowhere else.
- MediaPipe landmark names are also the player's own (`left_wrist` is their left wrist). `y` grows downward.
- **Time:** level times are seconds from the start of the round. Event timestamps are `performance.now()` in milliseconds.
- `armsUp` means both arms are up. `reachLeft` and `reachRight` mean exactly one arm.

## The code

```ts
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
  durationSec: number; // whole levels of 30 s: 60 (demo), 90, 120
  difficulty?: number; // tier, sets how many obstacles: 0 beginner, 0.5 regular, 1 athlete (default 0.5)
  lowImpact?: boolean; // true = no hurdles
  seed?: number; // same seed, same level; integer 0 to 2^31 - 1 (stored as Postgres int)
}

/* ───────── Input: owner A (pose) and B (keyboard) ───────── */

export interface InputState {
  tracking: boolean; // false = player not visible, game should pause
  otherPerson?: boolean; // true while someone other than the calibrated player is in the play area
  //                        (tracking is false then too); pose only, keyboard never sets it
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

export type Gesture = 'pause'; // arms crossed in an X in front of the chest, held 1 s

export interface PoseInputSource extends InputSource {
  readonly kind: 'pose';
  readonly video: HTMLVideoElement; // already mirrored by the pose module; never flip it again
  calibrate(mode: PlayMode, onStatus: (s: CalibrationStatus) => void): Promise<void>;
  drawSkeleton(ctx: CanvasRenderingContext2D): void; // for the preview and debug overlay
  // Once per hold (uncross before it can fire again); never during the six moves.
  // Optional until src/pose implements it. The app pauses or resumes the round on 'pause'.
  onGesture?(cb: (g: Gesture) => void): () => void;
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

// A round is a run of 30 s levels ("LEVEL 1", "LEVEL 2", ...). The tier (difficulty) sets how many
// obstacles; the level sets the speed: every level is faster than the one before, and level 1 of
// a higher tier is a little faster than level 1 of a lower one. A portal separates two levels.
export interface Stage {
  index: number; // 1, 2, 3 ...: shown as "LEVEL 1"
  startSec: number; // round time the level starts (0 for level 1)
  endSec: number; // round time it ends; the last one ends at durationSec
}

export interface Level {
  config: SessionConfig;
  waves: Wave[]; // sorted by t
  stages?: Stage[]; // sorted, back to back, cover the round; generateLevel always fills it
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
  | { type: 'paused'; reason: 'trackingLost' | 'user' | 'otherPerson' }
  | { type: 'resuming'; inSec: number } // 3-2-1 before every resume; game time stays frozen
  | { type: 'resumed' } // after the countdown
  | { type: 'stage'; stage: Stage } // entering a level: at start for level 1, then at each portal
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
  durationSec: number; // one board per round length: a long round always outscores a short one
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
  getLeaderboard(
    workout: WorkoutId,
    mode: PlayMode,
    durationSec: number,
    limit?: number,
  ): Promise<LeaderboardEntry[]>;
  getCoachAdvice(session: SavedSession): Promise<CoachAdvice>; // never rejects; falls back to rules
  signOut(): Promise<void>; // forgets the current guest; the next signInGuest creates a new user
}

// src/data/index.ts      export function createStore(): DataStore
//                        Returns the Supabase store, or the local store when the URL has
//                        ?store=local or the Supabase environment variables are missing.
```

### signOut (added Saturday, approved by the team)

"New guest" on the landing screen must start a new player instead of reusing the saved one. `signOut()` never rejects. The Supabase store first tries to send queued sessions, then signs out locally (works offline) and clears its cached profile, sessions and queue; the local store clears its saved player and sessions. The app calls it for "New guest"; "Continue as …" keeps the saved player.

## Guest profile defaults (C)

`sessions.user_id` references `profiles`, and the profile step can be skipped, so `signInGuest` always creates the `profiles` row (or reuses it) before it resolves. Missing fields get these defaults, in the store and as column defaults in SQL:

| Field | Default |
| --- | --- |
| `displayName` | `Guest-` plus four random digits, for example `Guest-1234` |
| `goal` | `'getMoving'` |
| `level` | `'beginner'` |
| `weightKg` | not set (70 kg is assumed for calories) |
| `weeklyGoalMin` | `60` |

The profile step only calls `saveProfile` with what the player entered. If `signInGuest` fails (for example on the anonymous sign-in rate limit), the app switches to the local store, as with `?store=local`, so the round can still be played and saved.

## Database (C)

Two tables and one view, in `supabase/migrations/`. Column names are snake_case in SQL and mapped to the camelCase types above inside `src/data/` only.

| Table | Columns |
| --- | --- |
| `profiles` | `id uuid` primary key referencing `auth.users`, `display_name text`, `goal text`, `level text`, `weight_kg numeric` nullable, `weekly_goal_min int` default 60, `created_at timestamptz` |
| `sessions` | `id uuid` primary key, `user_id uuid` referencing `profiles`, `workout text`, `mode text`, `duration_sec int`, `active_sec numeric`, `difficulty numeric`, `seed int`, `score int`, `best_streak int`, `cleared int`, `hit int`, `accuracy numeric`, `kcal numeric`, `reps jsonb`, `missed jsonb`, `created_at timestamptz` |
| `leaderboard` (view) | `display_name`, `workout`, `mode`, `score`, `created_at`, `duration_sec`: each user's best score per workout, mode and round length (`0003_leaderboard_duration.sql`) |

Row-level security, enabled on both tables:

- `profiles`: a user can select, insert and update only the row where `id = auth.uid()`.
- `sessions`: a user can insert and select only rows where `user_id = auth.uid()`. No update, no delete.
- `leaderboard`: readable by any signed-in user. It is the only way one user sees anything about another, and it carries no reps, calories or weight. It works **because** it is a plain view: Postgres views run with the owner's rights by default, so it reads every user's best score even though `sessions` RLS hides other users' rows. Keep it that way:
  - **Never add `security_invoker = true`** to this view. That makes it obey `sessions` RLS, and every player then sees only their own scores. Supabase's Security Advisor flags it as "Security Definer View"; for this view that finding is expected and stays.
  - Grant access explicitly in the migration: `revoke all on public.leaderboard from public, anon;` then `grant select on public.leaderboard to authenticated;`. Guests sign in anonymously, which still uses the `authenticated` role.
  - It selects only `display_name`, `workout`, `mode`, `score`, `created_at` and `duration_sec`. Adding a column is a contract change.

Add check constraints for the enum-like text columns and for sane ranges (`score >= 0`, `duration_sec` between 10 and 600).

## Server endpoint (C)

`POST /api/coach`, in `api/coach.ts`.

- **Request:** header `Authorization: Bearer <Supabase access token>`, body `{ "sessionId": "<uuid>" }`.
- **Steps:** reject without a valid token (401). Create a Supabase client that carries the user's token, so row-level security applies on the server too and no service key is needed. Load the profile and the last ten sessions. Ask Claude for JSON matching `CoachAdvice` through the official `@anthropic-ai/sdk` (structured output with a JSON schema, server-side refusal fallback), with a 7-second timeout and no retries. Validate it: known workout, `durationSec` one of 45, 90, 180, `difficulty` clamped to 0 to 1, text lengths capped. Return it with `source: 'ai'`.
- **Response:** 200 with `CoachAdvice`, or an error status. The client waits at most 8 seconds, then calls the rule-based coach.
- **Limits:** at most **one call per user per 10 s**. Right after the token check the endpoint calls `claim_coach_slot(10)` (migration `0002_coach_rate_limit.sql`: a `coach_calls` table with RLS and no policies, plus an atomic security-definer function). It answers 429 with `Retry-After: 10` when refused, and 503 (fail closed, no Claude call) if the check errors. Plus `claude-opus-5-5` at `effort: "low"`, `max_tokens` 2000, and a spend limit on the product's API key.
- **Where it runs:** only on Vercel (production, a preview deployment, or `vercel dev`). The client calls the relative path `/api/coach`. `npm run dev` and `npm run preview` do not serve `/api`, so there every coach call falls back to the rules. This is why the demo runs from the Vercel URL (DEMO.md).
- **Prompt rules:** general fitness encouragement only, no medical or diet advice, no comments on the body, plain friendly language, and the numbers must come from the data provided.

The rule-based coach lives in `src/data/` as a pure function `ruleBasedAdvice(profile, sessions): CoachAdvice`. Starting rules: recommend the workout played least this week; raise `difficulty` by 0.1 after accuracy above 85%, lower it by 0.1 after accuracy below 60%; point the tip at the move with the highest `missed` count.

Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (client and server; set them in Vercel too, the function reads them from `process.env`), `ANTHROPIC_API_KEY` (server only, set in Vercel, never prefixed with `VITE_`).

## Collision rules (B implements, C relies on them)

Body input arrives late and people move slowly, so an object is judged over a window, not at an instant. An object arriving at time `t` is cleared if the required state was true at any moment between `t - 0.35 s` and `t + 0.15 s`.

| Object | Cleared when | Otherwise |
| --- | --- | --- |
| `block` | `lane` is not in `lanes` | `hit` |
| `hurdle` | `airborne` | `hit` |
| `beam` | `ducking` (for the whole `holdSec` if set, with 0.3 s of grace) | `hit` |
| `crate` | both arms up (for the whole `holdSec` if set, with 0.3 s of grace) | `hit` |
| `orb`, floor mode | `lane` is in `lanes` and either arm is up | nothing, it is just missed |
| `orb`, treadmill mode | lane `-1` needs the left arm, `+1` the right arm, `0` both | nothing |

## Level rules (C implements, B relies on them)

- The first wave arrives no earlier than `t = 4 s`.
- At least 1.8 s between waves in the warm-up and never less than 1.1 s at peak.
- At least 1.5 s between a `beam` and a following `hurdle`, so the player can stand up first.
- A `block` wave always leaves a free lane, and that lane is at most one lane from the last free lane.
- In treadmill mode, only `crate` and `orb` are generated.
- With `lowImpact`, no `hurdle` is generated.

## Scoring (C)

- Cleared object: 100 × multiplier. Orb: 50 × multiplier.
- Multiplier: 1 at streak 0 to 4, 2 at 5 to 9, 3 at 10 to 19, 4 from 20. A hit resets the streak.
- Calories are an estimate and are labelled as one: `kcal = MET × 3.5 × weightKg / 200 × activeMinutes`, with 70 kg as the default weight. Start with MET 8 for Legs and Full body, 6 for Arms and Shoulders in floor mode, and 9 in treadmill mode. Check the values against the Compendium of Physical Activities before quoting them to a judge.

## Detection starting values (A)

These are starting points for `src/pose/tuning.ts`. Tune them in front of the webcam.

Landmarks used: nose 0, shoulders 11 and 12, wrists 15 and 16, hips 23 and 24, ankles 27 and 28.

Calibration records, over about 1.5 s of standing still: the hip centre (`x`, `y`), the shoulder width `W` and the torso length `T` (shoulder centre to hip centre). Every threshold is a fraction of `W` or `T`, so it adapts to the player's height and distance.

| Signal | On | Off |
| --- | --- | --- |
| Side lane | Hip centre more than `0.8 W` from the calibrated centre | Back within `0.4 W` |
| Jump | Hip centre more than `0.15 T` above standing height, moving up | Fixed 450 ms airborne, then a 300 ms cooldown |
| Squat | Hip centre more than `0.30 T` below standing height | Back within `0.15 T` |
| Arm up | Wrist above the nose | Wrist below the shoulder |
| Tracking lost | Hip and shoulder visibility below 0.5 for 500 ms | Visible again for 300 ms |

- Use hip height for squats, not the knee angle. Seen from the front, the knee angle is squashed and unreliable.
- Smooth the landmarks with an exponential average (start at α = 0.5) or a One Euro filter. More smoothing means more lag.
- Recompute `T` every frame and let the standing height drift slowly toward the current value while no move is active. This handles a player who steps closer or further.
- Treadmill mode measures everything from the shoulder centre and ignores the hips and legs.
- Calibration messages: `tooFar` when `T` is under about 0.15 of the frame height, `tooClose` when the ankles or head leave the frame (floor mode only).

MediaPipe setup: `FilesetResolver.forVisionTasks('/mediapipe/wasm')`, then `PoseLandmarker.createFromOptions` with `runningMode: 'VIDEO'`, `numPoses: 1`, `delegate: 'GPU'`, and call `detectForVideo(video, performance.now())` once per new video frame. Copy the WASM folder out of `node_modules/@mediapipe/tasks-vision/wasm` and download `pose_landmarker_lite.task` from the MediaPipe Pose Landmarker documentation page into `public/models/`.

## Keyboard mapping (B)

| Key | Effect |
| --- | --- |
| Left and right arrows | Change lane |
| Up arrow or Space | Jump |
| Down arrow, held | Squat |
| W, held | Both arms up |
| Q or E, held | Left or right arm up |

Global keys, owned by D (the integrator): `K` switches between keyboard and pose input, `R` recalibrates, `D` toggles the debug overlay, `Esc` pauses.
