import { describe, expect, it } from "vitest";
import type { SavedSession } from "@/contracts";
import {
  weeklyActiveMinutes,
  dayStreak,
  last7Days,
  repsByMove,
  totals,
  localDay,
  shiftDay,
  weekStart,
  thisWeek,
  weekDays,
} from "@/ui/screens/dashboardStats";

const at = (day: number, hour = 12) => new Date(2026, 10, day, hour).getTime();
function session(day: number, activeSec = 90): SavedSession {
  return {
    id: `s-${day}`,
    at: at(day),
    synced: true,
    config: { workout: "fullBody", mode: "floor", durationSec: 90 },
    score: 1000,
    streak: 5,
    multiplier: 2,
    reps: { sidestep: 1, jump: 2, squat: 3, armsUp: 4, reachLeft: 5, reachRight: 6 },
    kcal: 8,
    bestStreak: 5,
    cleared: 20,
    hit: 1,
    accuracy: 20 / 21,
    missed: { sidestep: 0, jump: 1, squat: 0, armsUp: 0, reachLeft: 0, reachRight: 0 },
    activeSec,
  };
}
describe("this week (Monday to Sunday, like the streak dots)", () => {
  // Saturday 21 Nov 2026: the week started Monday 16; Sunday 15 is last week.
  const now = at(21, 23);
  const sessions = [session(15, 90), session(16, 45), session(21, 45), session(22, 60)];
  it("keeps Monday to now and drops last Sunday and the future", () => {
    expect(thisWeek(sessions, now).map((s) => s.id)).toEqual(["s-16", "s-21"]);
  });
  it("lists Monday to Sunday with the same days as the dots, later days empty", () => {
    const days = weekDays(sessions, now);
    expect(days.map((d) => d.label)).toEqual(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
    expect(days[0]).toMatchObject({ date: localDay(at(16)), activeMin: 0.75, played: true });
    expect(days[5]).toMatchObject({ date: localDay(at(21)), activeMin: 0.75, played: true });
    expect(days[6]).toMatchObject({ date: localDay(at(22)), activeMin: 0, played: false });
  });
  it("agrees with the weekly minutes and reps it is shown beside", () => {
    const week = thisWeek(sessions, now);
    const chartMin = weekDays(sessions, now).reduce((sum, d) => sum + d.activeMin, 0);
    expect(Math.round(chartMin)).toBe(weeklyActiveMinutes(sessions, now));
    expect(totals(week).reps).toBe(2 * 21);
  });
});
describe("dashboard local-calendar statistics", () => {
  it("starts a new week on Monday after Sunday", () => {
    const sessions = [session(16, 60), session(22, 120), session(23, 180)];
    expect(weeklyActiveMinutes(sessions, at(22, 23))).toBe(3);
    expect(weeklyActiveMinutes(sessions, at(23, 23))).toBe(3);
    expect(weekStart(at(22))).toBe(localDay(at(16)));
    expect(weekStart(at(23))).toBe(localDay(at(23)));
  });
  it("rounds the combined weekly minutes, not each session", () => {
    expect(weeklyActiveMinutes([session(20, 80), session(21, 80)], at(21, 23))).toBe(3);
  });
  it("counts back from today and counts multiple rounds only once per day", () => {
    expect(dayStreak([session(21), session(21), session(20), session(19)], at(21, 23))).toBe(3);
  });
  it("preserves the streak until today is over if no round was played today", () => {
    expect(dayStreak([session(20), session(19)], at(21, 23))).toBe(2);
  });
  it("stops at a calendar-day gap", () => {
    expect(dayStreak([session(21), session(19), session(18)], at(21, 23))).toBe(1);
    expect(dayStreak([session(19)], at(21, 23))).toBe(0);
  });
  it("returns seven days oldest first, ending today, with unrounded activity", () => {
    const days = last7Days([session(15, 90), session(21, 45)], at(21, 23));
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ label: "SUN", date: localDay(at(15)), activeMin: 1.5, played: true });
    expect(days[6]).toEqual({
      label: "SAT",
      date: localDay(at(21)),
      activeMin: 0.75,
      played: true,
    });
    expect(days[1]?.played).toBe(false);
  });
  it("sums every move, calories and rounds, and finds the best score", () => {
    const rows = [session(20), { ...session(21), score: 2000 }];
    expect(repsByMove(rows)).toEqual({
      sidestep: 2,
      jump: 4,
      squat: 6,
      armsUp: 8,
      reachLeft: 10,
      reachRight: 12,
    });
    expect(totals(rows)).toEqual({ sessions: 2, reps: 42, kcal: 16, bestScore: 2000 });
  });
  it("returns zeros and seven unplayed days for empty input", () => {
    expect(weeklyActiveMinutes([], at(21))).toBe(0);
    expect(dayStreak([], at(21))).toBe(0);
    expect(totals([])).toEqual({ sessions: 0, reps: 0, kcal: 0, bestScore: 0 });
    expect(repsByMove([])).toEqual({
      sidestep: 0,
      jump: 0,
      squat: 0,
      armsUp: 0,
      reachLeft: 0,
      reachRight: 0,
    });
    expect(last7Days([], at(21)).every((d) => !d.played && d.activeMin === 0)).toBe(true);
  });
  it("calendar shifting preserves midnight across daylight-saving changes", () => {
    const before = new Date(2026, 2, 8, 12).getTime();
    expect(new Date(shiftDay(before, 1)).getDate()).toBe(9);
    expect(new Date(shiftDay(before, 1)).getHours()).toBe(0);
  });
});
