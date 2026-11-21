import { describe, expect, it } from 'vitest';

// The repo sits in a synced Desktop folder, and macOS sync makes "name 2.ts" conflict copies.
// They compile and pass review unnoticed, so fail the check instead (game and input folders).
describe('no sync conflict copies', () => {
  it('src/game and src/input have no "name 2.ext" files', () => {
    const files = Object.keys(import.meta.glob(['./*', '../input/*']));
    expect(files.filter((f) => / \d+\.[a-z]+$/i.test(f))).toEqual([]);
  });
});
