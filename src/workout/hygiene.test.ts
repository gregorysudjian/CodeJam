import { describe, expect, it } from 'vitest';

// The repo sits in a synced Desktop folder, and macOS sync makes "name 2.ts" conflict copies.
describe('no sync conflict copies', () => {
  it('src/workout has no "name 2.ext" files', () => {
    const files = Object.keys(import.meta.glob('./*'));
    expect(files.filter((f) => / \d+\.[a-z]+$/i.test(f))).toEqual([]);
  });
});
