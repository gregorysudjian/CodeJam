// ?kiosk=1: the leaderboard on its own, for the demo table between players (DEMO.md).
// Scores refresh every KIOSK_REFRESH_MS. The store signs in a throwaway in-memory guest for this
// tab (see src/data/index.ts), so the game's saved player in this browser is never touched.
import { useEffect, useState, type ReactNode } from 'react';
import type { DataStore, LeaderboardEntry, PlayMode, WorkoutId } from '@/contracts';
import { LeaderboardScreen } from '@/ui/screens/LeaderboardScreen';
import { BOARD_DEFAULT_DURATION_SEC, KIOSK_REFRESH_MS, LEADERBOARD_SIZE } from './tuning';

const leaveKiosk = () => window.location.assign(`${window.location.origin}/`);

export function KioskBoard({ store, qr }: { store: DataStore; qr: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<{
    workout: WorkoutId;
    mode: PlayMode;
    durationSec: number;
  }>({ workout: 'fullBody', mode: 'floor', durationSec: BOARD_DEFAULT_DURATION_SEC });
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void store.signInGuest('Leaderboard').finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const rows = await store.getLeaderboard(
        filter.workout,
        filter.mode,
        filter.durationSec,
        LEADERBOARD_SIZE,
      );
      if (cancelled) return;
      setEntries(rows);
      setLoading(false);
      timer = setTimeout(() => void refresh(), KIOSK_REFRESH_MS);
    };
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, store, filter]);

  return (
    <LeaderboardScreen
      kiosk
      entries={entries}
      workout={filter.workout}
      mode={filter.mode}
      durationSec={filter.durationSec}
      loading={loading}
      qrSlot={qr}
      onChangeFilter={(workout, mode, durationSec) => {
        setLoading(true);
        setFilter({ workout, mode, durationSec });
      }}
      onBack={leaveKiosk}
      onPlay={leaveKiosk}
    />
  );
}
