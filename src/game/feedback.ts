import * as T from './tuning';

/**
 * Timing grades and combo milestones. Pure, so they are unit-tested (feedback.test.ts); the
 * views draw them. Judging never depends on these: a GOOD or LATE clear scores like a PERFECT.
 */
export type Grade = 'perfect' | 'good' | 'late';

/** The grade of a clear from the offset core reports (first seen − t, game seconds). */
export function gradeFor(offset: number, input: 'pose' | 'keyboard'): Grade {
  const band = T.GRADE_BANDS[input];
  if (offset >= band.lateFrom) return 'late';
  if (offset >= band.perfectFrom) return 'perfect';
  return 'good';
}

export const GRADE_LABEL: Record<Grade, { text: string; color: number }> = {
  perfect: { text: 'PERFECT', color: T.COLOR_LIME },
  good: { text: 'GOOD', color: T.MOVE_COLOR.sidestep },
  late: { text: 'LATE', color: T.MOVE_COLOR.squat },
};

/**
 * The combo milestone reached when the streak goes from `before` to `after`, or null:
 * 5, 10, 20, then every 10. If one step crosses several, the highest one.
 */
export function comboMilestone(before: number, after: number): number | null {
  if (after <= before) return null;
  let hit: number | null = null;
  for (const m of T.COMBO_MILESTONES) if (before < m && after >= m) hit = m;
  const last = T.COMBO_MILESTONES[T.COMBO_MILESTONES.length - 1]!;
  if (after > last) {
    const top = Math.floor(after / T.COMBO_MILESTONE_EVERY) * T.COMBO_MILESTONE_EVERY;
    if (top > last && top > before) hit = top;
  }
  return hit;
}

/** Text of the combo counter, or null below COMBO_SHOW_FROM. */
export function comboLabel(streak: number): string | null {
  return streak >= T.COMBO_SHOW_FROM ? `${streak} COMBO` : null;
}
