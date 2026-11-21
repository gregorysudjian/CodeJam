// Owner: Greg (D). Screen state machine and wiring: the only place that imports the modules.
// Screens come from src/ui (pure: props in, callbacks out); see src/ui/README.md.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { createPoseInput } from '@/pose';
import {
  DashboardScreen,
  LandingScreen,
  LeaderboardScreen,
  ProfileScreen,
  ResultsScreen,
  WorkoutSelectScreen,
  type ProfileInput,
} from '@/ui/screens';
import { WORKOUTS } from '@/workout';
import { CalibrateStep } from './CalibrateStep';
import { DevPose } from './DevPose';
import { KioskBoard } from './KioskBoard';
import { CameraErrorOverlay, OfflineBanner } from './ErrorStates';
import { classifyCameraError, type CameraErrorInfo } from './errors';
import { PlayScreen } from './PlayScreen';
import { createSwitchableInput } from './switchableInput';
import { LEADERBOARD_SIZE } from './tuning';
import { useOnline } from './useOnline';

type Screen =
  'landing' | 'profile' | 'select' | 'calibrate' | 'play' | 'results' | 'dashboard' | 'leaderboard';

const APP_NAME = 'Neon Arena';
const NOTICE_MS = 4000;

const store = createStore();
const isDevPose = new URLSearchParams(window.location.search).get('dev') === 'pose';
const isKiosk = new URLSearchParams(window.location.search).get('kiosk') === '1';
const publicUrl = window.location.origin;
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

function MainApp() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [inputKind, setInputKind] = useState<'keyboard' | 'pose'>('keyboard');
  const [debug, setDebug] = useState(false);
  const [notice, setNotice] = useState('');
  const [cameraError, setCameraError] = useState<CameraErrorInfo | null>(null);
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
    entries: LeaderboardEntry[];
    loading: boolean;
  }>({ workout: 'fullBody', mode: 'floor', entries: [], loading: false });

  const gameRef = useRef<Game | null>(null);
  const screenRef = useRef(screen);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  // ── Input: one source at a time, started here and stopped when it changes ──
  const input: InputSource = useMemo(
    () => (inputKind === 'pose' ? createPoseInput() : createKeyboardInput()),
    [inputKind],
  );
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

  // ── Returning player and top scores for the landing screen ──
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const p = await store.getProfile();
      if (p) {
        const list = await store.listSessions(50);
        if (cancelled) return;
        const best = list.reduce((m, s) => Math.max(m, s.score), 0);
        setProfile(p);
        setSessions(list);
        setReturning({ displayName: p.displayName, bestScore: best || undefined });
      }
      const top = await store.getLeaderboard('fullBody', 'floor', 3);
      if (!cancelled) setTopScores(top.slice(0, 3));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Navigation helpers ──
  const startSession = useCallback(
    (c: SessionConfig) => {
      // A fresh level each time unless the config pins a seed (coach's pick keeps its own).
      setConfig({ ...c });
      setScreen(inputKind === 'pose' ? 'calibrate' : 'play');
    },
    [inputKind],
  );

  const openDashboard = useCallback(async () => {
    setScreen('dashboard');
    setSessions(await store.listSessions(50));
  }, []);

  const loadBoard = useCallback(async (workout: WorkoutId, mode: PlayMode) => {
    setBoard((b) => ({ ...b, workout, mode, loading: true }));
    const entries = await store.getLeaderboard(workout, mode, LEADERBOARD_SIZE);
    setBoard({ workout, mode, entries, loading: false });
  }, []);
  const openLeaderboard = useCallback(() => {
    setScreen('leaderboard');
    void loadBoard(board.workout, board.mode);
  }, [board.workout, board.mode, loadBoard]);

  // ── Guest sign-in and profile ──
  // "Play as guest" for a first visit, "New guest" when a player is saved: either way a NEW
  // player. "Continue as …" (continueAsReturning) keeps the saved one.
  const playAsGuest = async () => {
    if (returning || profile) {
      await store.signOut();
      setReturning(null);
      setSessions([]);
      setCoachPick(null);
      setSummary(null);
      setAdvice(null);
      setConfig(null);
    }
    setProfile(await store.signInGuest());
    setScreen('profile');
  };
  const continueAsReturning = async () => {
    setProfile(await store.signInGuest());
    setScreen('select');
  };
  const submitProfile = async (p: ProfileInput) => {
    await store.signInGuest(p.displayName || undefined);
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
    const [list, coach, top] = await Promise.all([
      store.listSessions(50),
      store.getCoachAdvice(saved),
      store.getLeaderboard(s.config.workout, s.config.mode, LEADERBOARD_SIZE),
    ]);
    setSessions(list);
    setAdvice(coach);
    setCoachPick(coach);
    const previousBest = list
      .filter(
        (x) =>
          x.id !== saved.id &&
          x.config.workout === s.config.workout &&
          x.config.mode === s.config.mode,
      )
      .reduce((m, x) => Math.max(m, x.score), 0);
    setPersonalBest(s.score > 0 && s.score > previousBest);
    const better = top.filter((e) => e.score > s.score).length;
    setRank(better < LEADERBOARD_SIZE ? better + 1 : null);
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
    (input as PoseInputSource)
      .calibrate(config?.mode ?? 'floor', (s) => setNotice(s.message))
      .catch(() => setNotice('Recalibration failed. Press K for the keyboard.'))
      .finally(() => {
        recalibrating.current = false;
        game?.resume();
      });
  }, [input, config]);
  const recalibrateRef = useRef(recalibrate);
  useEffect(() => {
    recalibrateRef.current = recalibrate;
  }, [recalibrate]);

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
      {screen === 'landing' && (
        <LandingScreen
          appName={APP_NAME}
          onPlayAsGuest={() => void playAsGuest()}
          returning={returning}
          onContinue={() => void continueAsReturning()}
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
          initial={config ?? undefined}
          onStart={startSession}
          onBack={() => setScreen(sessions.length ? 'dashboard' : 'landing')}
        />
      )}
      {screen === 'calibrate' && pose && config && (
        <CalibrateStep
          pose={pose}
          mode={config.mode}
          onDone={() => setScreen('play')}
          onCancel={() => setScreen('select')}
          onUseKeyboard={() => {
            setInputKind('keyboard');
            setScreen('play');
          }}
        />
      )}
      {screen === 'play' && config && (
        <PlayScreen
          config={config}
          input={gameInput}
          pose={pose}
          weightKg={profile?.weightKg}
          debug={debug}
          onGame={handleGame}
          onFinish={(s) => void handleFinish(s)}
          onUseKeyboard={switchToKeyboard}
        />
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
            void loadBoard(summary.config.workout, summary.config.mode);
          }}
        />
      )}
      {screen === 'dashboard' && profile && (
        <DashboardScreen
          profile={profile}
          sessions={sessions}
          coachPick={coachPick}
          onPlay={() => setScreen('select')}
          onPlayCoachPick={startSession}
          onLeaderboard={openLeaderboard}
          onEditProfile={() => setScreen('profile')}
        />
      )}
      {screen === 'leaderboard' && (
        <LeaderboardScreen
          entries={board.entries}
          workout={board.workout}
          mode={board.mode}
          onChangeFilter={(w, m) => void loadBoard(w, m)}
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
            if (screen === 'calibrate') setScreen('play');
          }}
          onRetry={() => {
            setCameraError(null);
            setInputKind('pose');
          }}
        />
      )}
      {!online && (
        <OfflineBanner onUseKeyboard={inputKind === 'pose' ? switchToKeyboard : undefined} />
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
