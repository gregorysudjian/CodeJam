// Owner: Greg (D). Screen state machine and wiring: the only place that imports the modules.
// Screens come from src/ui (pure: props in, callbacks out); see src/ui/README.md.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type {
  CoachAdvice,
  Game,
  InputSource,
  LeaderboardEntry,
  PlayMode,
  PoseInputSource,
  Profile,
  SavedSession,
  SessionConfig,
  SessionSummary,
  WorkoutId,
} from '@/contracts';
import { createStore } from '@/data';
import { createKeyboardInput } from '@/input';
// Screens are imported from their own files, not the src/ui/screens barrel, so the lazily
// loaded dashboard (and Recharts) can split into its own chunk.
import { TIER_DIFFICULTY } from '@/ui/kit';
import { LandingScreen } from '@/ui/screens/LandingScreen';
import { LeaderboardScreen } from '@/ui/screens/LeaderboardScreen';
import { ProfileScreen } from '@/ui/screens/ProfileScreen';
import { ResultsScreen } from '@/ui/screens/ResultsScreen';
import { WorkoutSelectScreen } from '@/ui/screens/WorkoutSelectScreen';
import type { ProfileInput } from '@/ui/screens/ProfileScreen';
import { DEMO_CONFIG, WORKOUTS } from '@/workout';
import { CalibrateStep } from './CalibrateStep';
import { DevPose } from './DevPose';
import { KioskBoard } from './KioskBoard';
import { DeviceNotice } from './DeviceNotice';
import { checkDevice, readEnvironment } from './deviceCheck';
import { CameraErrorOverlay, OfflineBanner } from './ErrorStates';
import { classifyCameraError, type CameraErrorInfo } from './errors';
import { InputSwitch, type InputKind } from './InputSwitch';
import { createSwitchableInput } from './switchableInput';
import { TryMoves } from './TryMoves';
import { tutorialMoves } from './tutorial';
import {
  BOARD_DEFAULT_DURATION_SEC,
  HANDS_FREE_ARM_MS,
  LEADERBOARD_SIZE,
  PUBLIC_SITE_URL,
} from './tuning';
import { useOnline } from './useOnline';

type Screen =
  | 'landing'
  | 'profile'
  | 'select'
  | 'calibrate'
  | 'tutorial'
  | 'play'
  | 'results'
  | 'dashboard'
  | 'leaderboard';

const APP_NAME = 'Neon Arena';
const NOTICE_MS = 4000;

// Heavy parts load only when needed (audit #8): the game (Three.js) when a round starts, the
// dashboard charts (Recharts) when the dashboard opens, the pose module (MediaPipe) when the
// player switches to the camera.
const PlayScreen = lazy(() => import('./PlayScreen').then((m) => ({ default: m.PlayScreen })));
const DashboardScreen = lazy(() =>
  import('@/ui/screens/DashboardScreen').then((m) => ({ default: m.DashboardScreen })),
);
type PoseModule = typeof import('@/pose');

const store = createStore();
// Supabase at page load but local after a sign-in: the sign-in was refused (rate limit, venue wifi).
const startedRemote = store.kind === 'supabase';
// Read live: the kind changes when the store falls back (TypeScript would narrow a direct read).
const storeKind = (): string => store.kind;
const BUSY_NOTICE = 'The leaderboard server is busy. Your rounds are saved on this laptop.';
const isDevPose = new URLSearchParams(window.location.search).get('dev') === 'pose';
// ?demo=1: the workout module plays its fixed demo level; preselect it so the screen matches.
const isDemo = new URLSearchParams(window.location.search).get('demo') === '1';
const isKiosk = new URLSearchParams(window.location.search).get('kiosk') === '1';
// QR codes: the live site when running locally (a phone can't open localhost), else this site.
const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
const publicUrl = isLocalHost ? PUBLIC_SITE_URL : window.location.origin;
const workouts = Object.values(WORKOUTS);

export default function App() {
  if (isDevPose) return <DevPose />;
  if (isKiosk)
    return (
      <KioskBoard
        store={store}
        qr={<QRCodeSVG value={publicUrl} bgColor="transparent" fgColor="currentColor" />}
      />
    );
  return <MainApp />;
}

/** The player's last explicit Camera/Keyboard choice on the select screen (null if none). */
const INPUT_CHOICE_KEY = 'app.input';
function readInputChoice(): InputKind | null {
  try {
    const v = window.localStorage.getItem(INPUT_CHOICE_KEY);
    return v === 'pose' || v === 'keyboard' ? v : null;
  } catch {
    return null;
  }
}
function saveInputChoice(kind: InputKind): void {
  try {
    window.localStorage.setItem(INPUT_CHOICE_KEY, kind);
  } catch {
    // private mode or blocked storage: the choice just isn't remembered
  }
}

function MainApp() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [inputKind, setInputKind] = useState<InputKind>('keyboard');
  const [debug, setDebug] = useState(false);
  // Phones, Safari and Firefox get a notice on the landing screen (Jiscar 2, #61).
  const [device] = useState(() => checkDevice(readEnvironment()));
  const [deviceOk, setDeviceOk] = useState(device.verdict === 'ok');
  const [notice, setNotice] = useState('');
  // True while "Play as guest", "New guest" or "Continue as …" signs in (landing shows a spinner).
  const [signingIn, setSigningIn] = useState(false);
  const [cameraError, setCameraError] = useState<CameraErrorInfo | null>(null);
  const [tutorialDone, setTutorialDone] = useState(false);
  const online = useOnline();

  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [advice, setAdvice] = useState<CoachAdvice | null>(null);
  const [coachPick, setCoachPick] = useState<CoachAdvice | null>(null);
  const [personalBest, setPersonalBest] = useState(false);
  const [rank, setRank] = useState<number | null>(null);

  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [returning, setReturning] = useState<{ displayName: string; bestScore?: number } | null>(
    null,
  );
  const [topScores, setTopScores] = useState<LeaderboardEntry[]>([]);
  const [board, setBoard] = useState<{
    workout: WorkoutId;
    mode: PlayMode;
    durationSec: number;
    entries: LeaderboardEntry[];
    loading: boolean;
  }>({
    workout: 'fullBody',
    mode: 'floor',
    durationSec: BOARD_DEFAULT_DURATION_SEC,
    entries: [],
    loading: false,
  });

  const gameRef = useRef<Game | null>(null);
  const screenRef = useRef(screen);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  // ── Input: one source at a time, started here and stopped when it changes ──
  const [poseModule, setPoseModule] = useState<PoseModule | null>(null);
  useEffect(() => {
    if (inputKind !== 'pose' || poseModule) return;
    let cancelled = false;
    import('@/pose')
      .then((m) => {
        if (!cancelled) setPoseModule(m);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCameraError(classifyCameraError(err));
        setInputKind('keyboard');
      });
    return () => {
      cancelled = true;
    };
  }, [inputKind, poseModule]);
  // Until the pose module has loaded, the keyboard stays the input.
  const input: InputSource = useMemo(
    () =>
      inputKind === 'pose' && poseModule ? poseModule.createPoseInput() : createKeyboardInput(),
    [inputKind, poseModule],
  );
  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);
  useEffect(() => {
    let cancelled = false;
    input.start().catch((err: unknown) => {
      if (cancelled) return;
      // Fall back to the keyboard at once, and explain what happened with a way to retry.
      setCameraError(classifyCameraError(err));
      setInputKind('keyboard');
    });
    return () => {
      cancelled = true;
      input.stop();
    };
  }, [input]);
  const pose = input.kind === 'pose' ? (input as PoseInputSource) : null;
  // The game always gets this one stable input; K swaps what it forwards to, so the round goes on.
  const [gameInput] = useState(() => createSwitchableInput(input));
  useEffect(() => gameInput.setSource(input), [gameInput, input]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const switchToKeyboard = useCallback(() => setInputKind('keyboard'), []);

  // A body game should not start on the keyboard by surprise (pose NEEDS 12): on the select screen,
  // switch to the camera if one exists, unless the player chose the keyboard on the switch before.
  // Once per page load, so a fallback after a camera error (or K) sticks. The permission prompt
  // still comes on the select screen, as with the switch.
  const autoCameraTried = useRef(false);
  useEffect(() => {
    if (screen !== 'select' || inputKind === 'pose' || autoCameraTried.current) return;
    autoCameraTried.current = true;
    if (readInputChoice() === 'keyboard') return;
    navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((devices) => {
        // A Keyboard click while the devices were being listed wins (found by Patrick's Mac).
        if (readInputChoice() === 'keyboard') return;
        if (devices.some((d) => d.kind === 'videoinput')) setInputKind('pose');
      })
      .catch(() => {});
  }, [screen, inputKind]);
  const chooseInput = useCallback((kind: InputKind) => {
    saveInputChoice(kind);
    setInputKind(kind);
  }, []);

  // ── Returning player and top scores for the landing screen ──
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // In parallel: on slow wifi a returning player sees "Continue as …" a round trip sooner (#76).
      const [p, list] = await Promise.all([store.getProfile(), store.listSessions(50)]);
      if (p) {
        if (cancelled) return;
        const best = list.reduce((m, s) => Math.max(m, s.score), 0);
        setProfile(p);
        setSessions(list);
        setReturning({ displayName: p.displayName, bestScore: best || undefined });
      }
      const top = await store.getLeaderboard('fullBody', 'floor', BOARD_DEFAULT_DURATION_SEC, 3);
      if (!cancelled) setTopScores(top.slice(0, 3));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Navigation helpers ──
  // "Try each move" runs before a player's first round, after calibration when the camera is used.
  const needsTutorial = sessions.length === 0 && !tutorialDone;
  const afterSetup: Screen = needsTutorial ? 'tutorial' : 'play';
  const finishTutorial = useCallback(() => {
    setTutorialDone(true);
    setScreen('play');
  }, []);

  const startSession = useCallback(
    (c: SessionConfig) => {
      // A fresh level each time unless the config pins a seed (coach's pick keeps its own).
      setConfig({ ...c });
      setScreen(inputKind === 'pose' ? 'calibrate' : afterSetup);
    },
    [inputKind, afterSetup],
  );

  // Fetch the game (Three.js) while the player picks a workout, so Start is instant (QA perf 1).
  useEffect(() => {
    // From the profile step too: a fast clicker reaches Start before the chunk lands otherwise.
    if (screen === 'profile' || screen === 'select') void import('./PlayScreen');
    // And the dashboard's charts while the results show, so Dashboard opens at once (#76).
    if (screen === 'results') void import('@/ui/screens/DashboardScreen');
  }, [screen]);

  const openDashboard = useCallback(async () => {
    setScreen('dashboard');
    setSessions(await store.listSessions(50));
  }, []);

  const loadBoard = useCallback(async (workout: WorkoutId, mode: PlayMode, durationSec: number) => {
    setBoard((b) => ({ ...b, workout, mode, durationSec, loading: true }));
    const entries = await store.getLeaderboard(workout, mode, durationSec, LEADERBOARD_SIZE);
    setBoard({ workout, mode, durationSec, entries, loading: false });
  }, []);
  const openLeaderboard = useCallback(() => {
    setScreen('leaderboard');
    void loadBoard(board.workout, board.mode, board.durationSec);
  }, [board.workout, board.mode, board.durationSec, loadBoard]);

  // ── Guest sign-in and profile ──
  // "Play as guest" for a first visit, "New guest" when a player is saved: either way a NEW
  // player. "Continue as …" (continueAsReturning) keeps the saved one.
  const signIn = async (displayName?: string) => {
    const p = await store.signInGuest(displayName);
    if (startedRemote && storeKind() === 'local') setNotice(BUSY_NOTICE);
    return p;
  };
  // One sign-in at a time: a double click or Enter during a slow sign-in must not start two.
  const signInBusy = useRef(false);
  const withSignIn = async (run: () => Promise<void>) => {
    if (signInBusy.current) return;
    signInBusy.current = true;
    setSigningIn(true);
    try {
      await run();
    } finally {
      signInBusy.current = false;
      setSigningIn(false);
    }
  };
  const playAsGuest = async () => {
    if (returning || profile) {
      await store.signOut();
      setReturning(null);
      setSessions([]);
      setTutorialDone(false);
      setCoachPick(null);
      setSummary(null);
      setAdvice(null);
      setConfig(null);
    }
    setProfile(await signIn());
    setScreen('profile');
  };
  const continueAsReturning = async () => {
    setProfile(await signIn());
    setScreen('select');
  };
  const submitProfile = async (p: ProfileInput) => {
    await signIn(p.displayName || undefined);
    const patch: Partial<ProfileInput> = { ...p };
    if (!p.displayName?.trim()) delete patch.displayName;
    setProfile(await store.saveProfile(patch));
    setScreen('select');
  };

  // ── Round finished: show results now, save and coach in the background ──
  const handleFinish = useCallback(async (s: SessionSummary) => {
    setSummary(s);
    setAdvice(null);
    setPersonalBest(false);
    setRank(null);
    setScreen('results');

    const saved = await store.saveSession(s);
    // Each result shows as soon as it arrives: on slow wifi the coach card must not wait for the
    // session list and leaderboard to time out too.
    void store.getCoachAdvice(saved).then((coach) => {
      setAdvice(coach);
      setCoachPick(coach);
    });
    // A round on the local store is not on the shared board, so no rank (Jiscar 2, #64).
    // Nor a 0-point round: "#1 on the leaderboard" for nothing reads wrong on a projector.
    if (store.kind === 'supabase' && s.score > 0)
      void store
        .getLeaderboard(s.config.workout, s.config.mode, s.config.durationSec, LEADERBOARD_SIZE)
        .then((top) => {
          // An empty board means offline with nothing cached, not "you are #1". When the round
          // synced, the board includes it, so it is never empty then.
          const better = top.filter((e) => e.score > s.score).length;
          setRank(top.length > 0 && better < LEADERBOARD_SIZE ? better + 1 : null);
        });
    const list = await store.listSessions(50);
    setSessions(list);
    const previousBest = list
      .filter(
        (x) =>
          x.id !== saved.id &&
          x.config.workout === s.config.workout &&
          x.config.mode === s.config.mode &&
          x.config.durationSec === s.config.durationSec,
      )
      .reduce((m, x) => Math.max(m, x.score), 0);
    setPersonalBest(s.score > 0 && s.score > previousBest);
  }, []);

  const handleGame = useCallback((g: Game | null) => {
    gameRef.current = g;
  }, []);

  // ── R: recalibrate pose input without losing the round (pauses the game meanwhile) ──
  const recalibrating = useRef(false);
  const recalibrate = useCallback(() => {
    if (input.kind !== 'pose') {
      setNotice('R recalibrates the camera. Press K to switch to pose input.');
      return;
    }
    if (recalibrating.current) return;
    recalibrating.current = true;
    const game = gameRef.current;
    game?.pause();
    setNotice('Recalibrating: stand on your mark and hold still.');
    // K back to the keyboard stops this camera and fails its calibration: say nothing then.
    const source = input as PoseInputSource;
    const current = () => inputRef.current === source;
    source
      .calibrate(config?.mode ?? 'floor', (s) => {
        if (current()) setNotice(s.message);
      })
      .catch(() => {
        if (current()) setNotice('Recalibration failed. Press K for the keyboard.');
      })
      .finally(() => {
        recalibrating.current = false;
        game?.resume();
      });
  }, [input, config]);
  const recalibrateRef = useRef(recalibrate);
  useEffect(() => {
    recalibrateRef.current = recalibrate;
  }, [recalibrate]);

  // K switched to the camera mid-round: the new pose input isn't calibrated yet, so the game would
  // sit paused with no message. Calibrate it with on-screen guidance, as R does (pose NEEDS 7).
  const prevInputKind = useRef(input.kind);
  useEffect(() => {
    const was = prevInputKind.current;
    prevInputKind.current = input.kind;
    if (was === 'keyboard' && input.kind === 'pose' && screenRef.current === 'play') {
      recalibrateRef.current();
    }
  }, [input]);

  // Results with the camera say "raise both arms to play again": do it (pose NEEDS 5).
  useEffect(() => {
    if (screen !== 'results' || !summary || input.kind !== 'pose') return;
    let off: (() => void) | undefined;
    const arm = setTimeout(() => {
      off = input.onMove((e) => {
        if (e.type === 'armsUp') startSession({ ...summary.config, seed: undefined });
      });
    }, HANDS_FREE_ARM_MS);
    return () => {
      clearTimeout(arm);
      off?.();
    };
  }, [screen, summary, input, startSession]);

  // ── Global keys (owned by the app): K switch input, R recalibrate, D debug, Esc pause.
  // The screens bind their own keys too, so to avoid double handling:
  //   Esc is skipped while GameHud is mounted (play screen): the HUD pauses/resumes itself.
  //   K is skipped on the calibration screen: it has its own "use keyboard" K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      const current = screenRef.current;
      switch (e.code) {
        case 'KeyK':
          if (current === 'calibrate') return;
          setInputKind((k) => (k === 'keyboard' ? 'pose' : 'keyboard'));
          break;
        case 'KeyR':
          if (current === 'play') recalibrateRef.current();
          break;
        case 'KeyD':
          setDebug((d) => !d);
          break;
        case 'Escape':
          if (current === 'play') return; // GameHud owns Esc
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const qr = <QRCodeSVG value={publicUrl} bgColor="transparent" fgColor="currentColor" />;

  return (
    <div className="min-h-screen">
      {!deviceOk && screen === 'landing' && (
        <DeviceNotice
          check={device}
          onLeaderboard={() => {
            setDeviceOk(true);
            openLeaderboard();
          }}
          onPlayAnyway={() => setDeviceOk(true)}
        />
      )}
      {screen === 'landing' && (
        <LandingScreen
          appName={APP_NAME}
          onPlayAsGuest={() => void withSignIn(playAsGuest)}
          returning={returning}
          onContinue={() => void withSignIn(continueAsReturning)}
          busy={signingIn}
          onLeaderboard={openLeaderboard}
          topScores={topScores}
          qrSlot={qr}
          publicUrl={publicUrl}
        />
      )}
      {screen === 'profile' && (
        <ProfileScreen
          initial={profile ?? undefined}
          onSubmit={(p) => void submitProfile(p)}
          onBack={() => setScreen('landing')}
        />
      )}
      {screen === 'select' && (
        <WorkoutSelectScreen
          workouts={workouts}
          coachPick={coachPick}
          initial={
            // The tier starts at the player's fitness level (same three names) until they pick one.
            config ??
            (isDemo
              ? DEMO_CONFIG
              : profile
                ? { difficulty: TIER_DIFFICULTY[profile.level] }
                : undefined)
          }
          settingsSlot={<InputSwitch value={inputKind} onChange={chooseInput} />}
          onStart={startSession}
          onBack={() => setScreen(sessions.length ? 'dashboard' : 'landing')}
        />
      )}
      {screen === 'calibrate' && pose && config && (
        <CalibrateStep
          pose={pose}
          mode={config.mode}
          onDone={() => setScreen(afterSetup)}
          onCancel={() => setScreen('select')}
          onUseKeyboard={() => {
            setInputKind('keyboard');
            setScreen(afterSetup);
          }}
        />
      )}
      {screen === 'tutorial' && config && (
        <TryMoves
          moves={tutorialMoves(config)}
          input={gameInput}
          pose={inputKind === 'pose' ? pose : null}
          onDone={finishTutorial}
        />
      )}
      {screen === 'play' && config && (
        <Suspense fallback={<div className="h-screen bg-bg" />}>
          <PlayScreen
            config={config}
            input={gameInput}
            pose={pose}
            weightKg={profile?.weightKg}
            debug={debug}
            onGame={handleGame}
            onFinish={(s) => void handleFinish(s)}
            onUseKeyboard={switchToKeyboard}
            onQuit={() => setScreen('select')}
          />
        </Suspense>
      )}
      {screen === 'results' && summary && (
        <ResultsScreen
          summary={summary}
          advice={advice}
          isPersonalBest={personalBest}
          rank={rank}
          handsFree={inputKind === 'pose'}
          onPlayAgain={() => startSession({ ...summary.config, seed: undefined })}
          onStartNext={startSession}
          onDashboard={() => void openDashboard()}
          onLeaderboard={() => {
            setScreen('leaderboard');
            void loadBoard(summary.config.workout, summary.config.mode, summary.config.durationSec);
          }}
        />
      )}
      {screen === 'dashboard' && profile && (
        <Suspense fallback={<div className="h-screen bg-bg" />}>
          <DashboardScreen
            profile={profile}
            sessions={sessions}
            coachPick={coachPick}
            onPlay={() => setScreen('select')}
            onPlayCoachPick={startSession}
            onLeaderboard={openLeaderboard}
            onEditProfile={() => setScreen('profile')}
          />
        </Suspense>
      )}
      {screen === 'leaderboard' && (
        <LeaderboardScreen
          entries={board.entries}
          workout={board.workout}
          mode={board.mode}
          durationSec={board.durationSec}
          onChangeFilter={(w, m, d) => void loadBoard(w, m, d)}
          currentName={profile?.displayName}
          loading={board.loading}
          qrSlot={qr}
          onBack={() => setScreen(profile ? 'dashboard' : 'landing')}
          onPlay={() => setScreen(profile ? 'select' : 'landing')}
        />
      )}

      {cameraError && (
        <CameraErrorOverlay
          error={cameraError}
          onUseKeyboard={() => {
            setCameraError(null);
            // Calibration needs the camera; with the keyboard there is nothing to calibrate.
            if (screen === 'calibrate') setScreen(afterSetup);
          }}
          onRetry={() => {
            setCameraError(null);
            setInputKind('pose');
          }}
        />
      )}
      {!online && (
        <OfflineBanner
          onUseKeyboard={inputKind === 'pose' ? switchToKeyboard : undefined}
          placement={screen === 'play' ? 'bottom' : 'top'}
          syncs={store.kind === 'supabase'}
        />
      )}
      {notice && (
        <div
          role="status"
          className="fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-sm text-white"
        >
          {notice}
        </div>
      )}
      {debug && (
        <div className="fixed bottom-3 right-3 z-[100] rounded bg-black/70 px-2 py-1 text-xs text-white">
          input: {inputKind} · {store.kind} store · screen: {screen}
        </div>
      )}
    </div>
  );
}
