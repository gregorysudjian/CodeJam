import { describe, expect, it } from 'vitest';
import { isReal, LEVEL_BACKDROPS } from './backdrop';
import { clipOf, skinSetFor } from './props';
import { REAL_CLIPS } from './tuning';

describe('realistic look follows the clip (REAL_CLIPS)', () => {
  const levels = LEVEL_BACKDROPS.map((_, i) => i + 1);

  it('every real level plays a clip REAL_CLIPS knows (a renamed file would lose its look)', () => {
    for (const level of levels.filter(isReal)) {
      expect(clipOf(level), `level ${level}: ${LEVEL_BACKDROPS[level - 1]!.video}`).not.toBeNull();
    }
  });

  it("a real level's skins are its clip's set, so a reused clip keeps its look", () => {
    for (const level of levels.filter(isReal)) {
      expect(skinSetFor(level)).toBe(clipOf(level)!.skin);
    }
  });

  it('each clip has one road pattern and one skin set, and only the old town is cobbled', () => {
    expect(new Set(REAL_CLIPS.map((c) => c.id)).size).toBe(REAL_CLIPS.length);
    expect(REAL_CLIPS.filter((c) => c.road === 'cobble').map((c) => c.id)).toEqual(['oldtown']);
  });
});
