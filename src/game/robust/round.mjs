import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { launch } from '../../../docs/qa/sweep/cdp.mjs';

export const base =
  process.argv.find((arg) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/$/.test(arg)) ??
  'http://localhost:5173/';
export async function launchRoundBrowser(port) {
  const root = realpathSync(tmpdir());
  const profile = mkdtempSync(join(root, 'p7-round-'));
  const browser = await launch({ base, port, profile });
  return {
    ...browser,
    async close() {
      await browser.close();
      assert.equal(dirname(realpathSync(profile)), root);
      await rm(profile, { recursive: true, maxRetries: 10, retryDelay: 100 });
    },
  };
}

export async function firstRound(browser, query = '?demo=1&store=local&music=off', duration) {
  await browser.size(1366, 768);
  await browser.go(base + query);
  await browser.click('play as guest');
  await browser.eval(
    "document.querySelector('input').focus(); document.querySelector('input').select()",
  );
  await browser.type('Robust');
  await browser.eval('document.activeElement.blur()');
  await browser.key('Enter');
  if (duration) await browser.click('^' + duration + ' s$');
  await browser.click('^\\s*start\\b');
  assert(await browser.waitFor(/try each move/i));
  await browser.key('Escape');
  assert(await browser.waitFor(/time left/i), 'HUD missing');
}

export async function summaries(browser) {
  return browser.eval("JSON.parse(localStorage.getItem('codejam.local.sessions') ?? '[]')");
}

export function validate(summary) {
  assert(Number.isFinite(summary.score) && summary.score >= 0);
  assert(Number.isFinite(summary.accuracy) && summary.accuracy >= 0 && summary.accuracy <= 1);
  for (const value of [summary.activeSec, summary.kcal, ...Object.values(summary.reps)])
    assert(Number.isFinite(value));
}
