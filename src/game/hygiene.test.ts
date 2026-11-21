import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The repo sits in a synced Desktop folder, and macOS sync makes "name 2.ts" conflict copies.
// They compile and pass review unnoticed, so fail the check instead (game and input folders).
describe('no sync conflict copies', () => {
  for (const dir of ['.', '../input']) {
    it(`src/${dir === '.' ? 'game' : 'input'} has no "name 2.ext" files`, () => {
      const path = fileURLToPath(new URL(dir, import.meta.url));
      expect(readdirSync(path).filter((f) => / \d+\.[a-z]+$/i.test(f))).toEqual([]);
    });
  }
});
