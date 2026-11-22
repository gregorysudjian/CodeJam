import { describe, expect, it } from 'vitest';
import { profileFromRow, profilePatchToRow, type ProfileRow } from './mapping';

const row: ProfileRow = {
  id: 'u1',
  display_name: 'Maya',
  goal: 'cardio',
  level: 'regular',
  weight_kg: '64.5',
  weekly_goal_min: 90,
};

describe('profile age and height (migration 0006)', () => {
  it('reads them when stored, height as a number even if Postgres sends a string', () => {
    const p = profileFromRow({ ...row, age: 34, height_cm: '171.5' });
    expect(p.age).toBe(34);
    expect(p.heightCm).toBe(171.5);
  });

  it('leaves them out when null or when the row predates the migration', () => {
    for (const r of [{ ...row, age: null, height_cm: null }, row]) {
      const p = profileFromRow(r);
      expect('age' in p).toBe(false);
      expect('heightCm' in p).toBe(false);
    }
  });

  it('writes them only when patched, so other updates leave them alone', () => {
    expect(profilePatchToRow({ goal: 'cardio' })).toEqual({ goal: 'cardio' });
    expect(profilePatchToRow({ age: 34, heightCm: 171.54 })).toEqual({ age: 34, height_cm: 171.5 });
  });

  it('rounds age to whole years and clears a value with undefined', () => {
    expect(profilePatchToRow({ age: 33.6 }).age).toBe(34);
    expect(profilePatchToRow({ age: undefined, heightCm: undefined })).toEqual({
      age: null,
      height_cm: null,
    });
  });

  it('sends unknown (null) for a value the database would refuse, so the save still goes through', () => {
    for (const age of [9, 101, -1, Number.NaN, Infinity])
      expect(profilePatchToRow({ age }).age).toBeNull();
    for (const heightCm of [99.9, 250.1, 0, Number.NaN])
      expect(profilePatchToRow({ heightCm }).height_cm).toBeNull();
    expect(profilePatchToRow({ age: 10, heightCm: 250 })).toEqual({ age: 10, height_cm: 250 });
  });
});
