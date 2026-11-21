// Owner: D. Screen state machine and wiring. The only place that imports the modules.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CoachAdvice,
  Game,
  InputSource,
  Profile,
  SavedSession,
  SessionConfig,
  SessionSummary,
} from '@/contracts';
import { createStore } from '@/data';
import { createKeyboardInput } from '@/input';
import { createPoseInput } from '@/pose';
import {
  Calibrate,
  Dashboard,
  DevPose,
  Landing,
  Leaderboard,
  ProfileStep,
  Results,
  WorkoutSelect,
} from './placeholders';
import { PlayScreen } from './PlayScreen';

type Screen =
  'landing' | 'profile' | 'select' | 'calibrate' | 'play' | 'results' | 'dashboard' | 'leaderboard';

const store = createStore();
const isDevPose = new URLSearchParams(window.location.search).get('dev') === 'pose';

export default function App() {
  if (isDevPose) return <DevPose />;
  return <MainApp />;
}

function MainApp() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [inputKind, setInputKind] = useState<'keyboard' | 'pose'>('keyboard');
  const [debug, setDebug] = useState(false);
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState<SavedSession | null>(null);
  const [advice, setAdvice] = useState<CoachAdvice | null>(null);
  const gameRef = useRef<Game | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  // One input source at a time; started here, stopped when it changes or on unmount.
  const input: InputSource = useMemo(
    () => (inputKind === 'pose' ? createPoseInput() : createKeyboardInput()),
    [inputKind],
  );
  useEffect(() => {
    let cancelled = false;
    input.start().catch((err: unknown) => {
      if (cancelled) return;
      setNotice(err instanceof Error ? err.message : 'Camera unavailable');
      setInputKind('keyboard');
    });
    return () => {
      cancelled = true;
      input.stop();
    };
  }, [input]);

  // Global keys (owned by D): K switch input, R recalibrate, D debug overlay, Esc pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyK') setInputKind((k) => (k === 'keyboard' ? 'pose' : 'keyboard'));
      else if (e.code === 'KeyR') setNotice('Recalibrate: not wired yet (needs pose input)');
      else if (e.code === 'KeyD') setDebug((d) => !d);
      else if (e.code === 'Escape') {
        const g = gameRef.current;
        if (!g) return;
        if (pausedRef.current) g.resume();
        else g.pause();
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const handleProfile = async (displayName: string) => {
    const p = await store.signInGuest(displayName || undefined);
    setProfile(displayName ? await store.saveProfile({ displayName }) : p);
    setScreen('select');
  };

  const handleFinish = useCallback(async (summary: SessionSummary) => {
    setSaved(null);
    setAdvice(null);
    setScreen('results');
    const s = await store.saveSession(summary);
    setSaved(s);
    setAdvice(await store.getCoachAdvice(s));
  }, []);

  const handleGame = useCallback((g: Game | null) => {
    gameRef.current = g;
    pausedRef.current = false;
    setPaused(false);
  }, []);

  const loadSessions = useCallback(() => store.listSessions(), []);
  const loadLeaderboard = useCallback(() => store.getLeaderboard('fullBody', 'floor'), []);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {screen === 'landing' && <Landing onPlay={() => setScreen('profile')} />}
      {screen === 'profile' && <ProfileStep onDone={handleProfile} />}
      {screen === 'select' && (
        <WorkoutSelect
          onStart={(c) => {
            setConfig(c);
            setScreen('calibrate');
          }}
        />
      )}
      {screen === 'calibrate' && <Calibrate onDone={() => setScreen('play')} />}
      {screen === 'play' && config && (
        <PlayScreen
          config={config}
          input={input}
          weightKg={profile?.weightKg}
          debug={debug}
          onGame={handleGame}
          onFinish={handleFinish}
        />
      )}
      {screen === 'results' && (
        <Results
          session={saved}
          advice={advice}
          onAgain={() => setScreen('select')}
          onDashboard={() => setScreen('dashboard')}
        />
      )}
      {screen === 'dashboard' && (
        <Dashboard
          load={loadSessions}
          onPlay={() => setScreen('select')}
          onLeaderboard={() => setScreen('leaderboard')}
        />
      )}
      {screen === 'leaderboard' && (
        <Leaderboard load={loadLeaderboard} onBack={() => setScreen('dashboard')} />
      )}

      <div className="fixed bottom-3 right-3 text-xs text-neutral-500">
        input: {inputKind} {paused && '· paused'} · {store.kind} store
      </div>
      {notice && (
        <div className="fixed left-1/2 top-4 -translate-x-1/2 rounded bg-neutral-800 px-4 py-2 text-sm">
          {notice}
        </div>
      )}
    </div>
  );
}
