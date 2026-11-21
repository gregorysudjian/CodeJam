// Placeholder screens. The real screens from src/ui/ replace these one by one.
import { useEffect, useState } from 'react';
import type {
  CoachAdvice,
  LeaderboardEntry,
  PlayMode,
  SavedSession,
  SessionConfig,
  WorkoutId,
} from '@/contracts';
import { WORKOUTS } from '@/workout';

const btn = 'rounded-lg bg-white px-5 py-3 font-semibold text-black hover:bg-neutral-200';
const shell = 'flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center';

export function Landing({ onPlay }: { onPlay: () => void }) {
  return (
    <div className={shell}>
      <h1 className="text-5xl font-extrabold">Webcam fitness</h1>
      <p className="text-neutral-400">Placeholder landing screen</p>
      <button className={btn} onClick={onPlay}>
        Play as guest
      </button>
    </div>
  );
}

export function ProfileStep({ onDone }: { onDone: (displayName: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className={shell}>
      <h2 className="text-3xl font-bold">Your name</h2>
      <input
        className="rounded-lg border border-neutral-600 bg-neutral-900 px-4 py-2"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Optional"
      />
      <div className="flex gap-3">
        <button className={btn} onClick={() => onDone(name.trim())}>
          Continue
        </button>
        <button className="underline" onClick={() => onDone('')}>
          Skip
        </button>
      </div>
    </div>
  );
}

export function WorkoutSelect({ onStart }: { onStart: (config: SessionConfig) => void }) {
  const [mode, setMode] = useState<PlayMode>('floor');
  const [durationSec, setDuration] = useState(45);
  return (
    <div className={shell}>
      <h2 className="text-3xl font-bold">Pick a workout</h2>
      <div className="flex gap-2">
        {(['floor', 'treadmill'] as const).map((m) => (
          <button
            key={m}
            className={m === mode ? btn : 'rounded-lg border px-5 py-3'}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
        {[45, 90, 180].map((d) => (
          <button
            key={d}
            className={d === durationSec ? btn : 'rounded-lg border px-5 py-3'}
            onClick={() => setDuration(d)}
          >
            {d}s
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(WORKOUTS) as WorkoutId[]).map((id) => (
          <button
            key={id}
            disabled={!WORKOUTS[id].availableIn.includes(mode)}
            className="rounded-xl border border-neutral-600 p-6 disabled:opacity-30"
            onClick={() => onStart({ workout: id, mode, durationSec })}
          >
            <div className="text-xl font-bold">{WORKOUTS[id].name}</div>
            <div className="text-sm text-neutral-400">{WORKOUTS[id].tagline}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Calibrate({ onDone }: { onDone: () => void }) {
  return (
    <div className={shell}>
      <h2 className="text-3xl font-bold">Calibration</h2>
      <p className="text-neutral-400">
        Placeholder. Keyboard: arrows lane, Up/Space jump, Down squat, W both arms, Q/E one arm.
      </p>
      <button className={btn} onClick={onDone}>
        Start round
      </button>
    </div>
  );
}

export function Results({
  session,
  advice,
  onDashboard,
  onAgain,
}: {
  session: SavedSession | null;
  advice: CoachAdvice | null;
  onDashboard: () => void;
  onAgain: () => void;
}) {
  if (!session) return <div className={shell}>Saving…</div>;
  return (
    <div className={shell}>
      <h2 className="text-3xl font-bold">Score {session.score}</h2>
      <p>
        Accuracy {Math.round(session.accuracy * 100)}% · best streak {session.bestStreak} · about{' '}
        {session.kcal.toFixed(1)} kcal (estimate)
      </p>
      <pre className="text-left text-sm text-neutral-400">
        {JSON.stringify(session.reps, null, 2)}
      </pre>
      {advice && (
        <div className="max-w-md rounded-xl border border-neutral-600 p-4 text-left">
          <div className="text-xs uppercase text-neutral-500">Coach ({advice.source})</div>
          <p>{advice.recap}</p>
          <p className="mt-2 text-neutral-300">Tip: {advice.tip}</p>
        </div>
      )}
      <div className="flex gap-3">
        <button className={btn} onClick={onAgain}>
          Play again
        </button>
        <button className="underline" onClick={onDashboard}>
          Dashboard
        </button>
      </div>
    </div>
  );
}

export function Dashboard({
  load,
  onLeaderboard,
  onPlay,
}: {
  load: () => Promise<SavedSession[]>;
  onLeaderboard: () => void;
  onPlay: () => void;
}) {
  const [sessions, setSessions] = useState<SavedSession[] | null>(null);
  useEffect(() => {
    load().then(setSessions);
  }, [load]);
  return (
    <div className={shell}>
      <h2 className="text-3xl font-bold">Dashboard</h2>
      {sessions === null ? (
        <p>Loading…</p>
      ) : (
        <ul className="text-left">
          {sessions.map((s) => (
            <li key={s.id}>
              {new Date(s.at).toLocaleString()} · {s.config.workout} · {s.score} pts
            </li>
          ))}
          {sessions.length === 0 && <li>No sessions yet</li>}
        </ul>
      )}
      <div className="flex gap-3">
        <button className={btn} onClick={onPlay}>
          Play
        </button>
        <button className="underline" onClick={onLeaderboard}>
          Leaderboard
        </button>
      </div>
    </div>
  );
}

export function Leaderboard({
  load,
  onBack,
}: {
  load: () => Promise<LeaderboardEntry[]>;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);
  useEffect(() => {
    load().then(setRows);
  }, [load]);
  return (
    <div className={shell}>
      <h2 className="text-3xl font-bold">Leaderboard · Full body · floor</h2>
      <ol className="text-left">
        {rows?.map((r, i) => (
          <li key={i}>
            {i + 1}. {r.displayName} · {r.score}
          </li>
        ))}
      </ol>
      <button className="underline" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

export function DevPose() {
  return (
    <div className={shell}>
      <h2 className="text-3xl font-bold">?dev=pose</h2>
      <p className="text-neutral-400">Placeholder for A's pose debug view (src/pose).</p>
    </div>
  );
}
