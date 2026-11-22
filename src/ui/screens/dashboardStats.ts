import type { MoveType, SavedSession } from "@/contracts";
import { MOVE_ORDER } from "@/ui/kit/tokens";

export const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
/** For screen readers: some read "MON" as a word (QA C10). */
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export interface ActivityDay {
  label: (typeof DAY_LABELS)[number];
  date: number;
  activeMin: number;
  played: boolean;
}

/** Calendar operations deliberately use local dates, not fixed 24-hour durations (DST-safe). */
export function localDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
export function shiftDay(timestamp: number, days: number): number {
  const date = new Date(localDay(timestamp));
  date.setDate(date.getDate() + days);
  return date.getTime();
}
export function weekStart(now: number): number {
  return shiftDay(now, -((new Date(now).getDay() + 6) % 7));
}
/** Rounds since Monday 00:00 (local), up to now: the dashboard's "this week". */
export function thisWeek(sessions: readonly SavedSession[], now: number): SavedSession[] {
  return sessions.filter((s) => s.at >= weekStart(now) && s.at <= now);
}
/** Monday to Sunday of the current week, the same days as the streak dots. Later days are empty. */
export function weekDays(sessions: readonly SavedSession[], now: number): ActivityDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = shiftDay(weekStart(now), i);
    const rows = sessions.filter((s) => s.at <= now && localDay(s.at) === date);
    return {
      label: DAY_LABELS[new Date(date).getDay()] ?? "MON",
      date,
      activeMin: rows.reduce((sum, s) => sum + s.activeSec, 0) / 60,
      played: rows.length > 0,
    };
  });
}
export function weeklyActiveMinutes(sessions: readonly SavedSession[], now: number): number {
  return Math.round(
    sessions
      .filter((s) => s.at >= weekStart(now) && s.at <= now)
      .reduce((sum, s) => sum + s.activeSec, 0) / 60,
  );
}
export function dayStreak(sessions: readonly SavedSession[], now: number): number {
  const days = new Set(sessions.filter((s) => s.at <= now).map((s) => localDay(s.at)));
  let cursor = localDay(now);
  if (!days.has(cursor)) cursor = shiftDay(cursor, -1);
  let count = 0;
  while (days.has(cursor)) {
    count++;
    cursor = shiftDay(cursor, -1);
  }
  return count;
}
export function last7Days(sessions: readonly SavedSession[], now: number): ActivityDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = shiftDay(now, i - 6);
    const rows = sessions.filter((s) => s.at <= now && localDay(s.at) === date);
    return {
      label: DAY_LABELS[new Date(date).getDay()] ?? "MON",
      date,
      activeMin: rows.reduce((sum, s) => sum + s.activeSec, 0) / 60,
      played: rows.length > 0,
    };
  });
}
export function repsByMove(sessions: readonly SavedSession[]): Record<MoveType, number> {
  const result: Record<MoveType, number> = {
    sidestep: 0,
    jump: 0,
    squat: 0,
    armsUp: 0,
    reachLeft: 0,
    reachRight: 0,
  };
  for (const session of sessions) for (const move of MOVE_ORDER) result[move] += session.reps[move];
  return result;
}
export function totals(sessions: readonly SavedSession[]): {
  sessions: number;
  reps: number;
  kcal: number;
  bestScore: number;
} {
  return {
    sessions: sessions.length,
    reps: Object.values(repsByMove(sessions)).reduce((a, b) => a + b, 0),
    kcal: sessions.reduce((sum, s) => sum + s.kcal, 0),
    bestScore: Math.max(0, ...sessions.map((s) => s.score)),
  };
}
export function sessionTime(at: number, now: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const day = localDay(at);
  if (day === localDay(now)) return `TODAY ${time}`;
  if (day === shiftDay(now, -1)) return `YESTERDAY ${time}`;
  if (day >= shiftDay(now, -6) && day <= localDay(now))
    return `${DAY_LABELS[date.getDay()]} ${time}`;
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}) }).toUpperCase()} ${time}`;
}
export function relativeTime(at: number, now: number): string {
  const min = Math.floor(Math.max(0, now - at) / 60000);
  if (min < 1) return "JUST NOW";
  if (min < 60) return `${min} MIN AGO`;
  if (min < 1440) return `${Math.floor(min / 60)} HR AGO`;
  return `${Math.floor(min / 1440)} D AGO`;
}
