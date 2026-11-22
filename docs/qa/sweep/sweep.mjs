// QA sweep: the full keyboard flow at 1366x768, 1920x1080 and 1280x720 in parallel, with
// screenshots and a pass/fail summary. Needs `npm run dev` (the autoplayer imports the level
// generator from the dev server). Local store only; the camera is denied, nothing is uploaded.
//
//   node docs/qa/sweep/sweep.mjs [baseUrl] [outDir]
//   default baseUrl http://localhost:5173/, default outDir <tmp>/neon-sweep-<time>
//
// Exit code 0 = every check passed; 1 = see summary.json. Each size takes about 4 minutes (the demo round is 180 s).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, sleep, timebox } from './cdp.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const OUT = process.argv[3] ?? join(tmpdir(), `neon-sweep-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const AUTO = readFileSync(new URL('./auto.js', import.meta.url), 'utf8').trim().replace(/;$/, '');
// SIZES=1093x614@1.25,911x512@1.5 runs other CSS viewports (width x height @ device scale factor):
// Windows display scaling and browser zoom both shrink the CSS viewport (1366x768 at 125% = 1093x614).
const SIZES = process.env.SIZES
  ? process.env.SIZES.split(',').map((s) => s.match(/(\d+)x(\d+)(?:@([\d.]+))?/).slice(1).map((n, i) => (i < 2 ? Number(n) : Number(n ?? 1))))
  : [
      [1366, 768, 1],
      [1920, 1080, 1],
      [1280, 720, 1],
    ];
timebox(10 * 60 * 1000, 'sweep'); // the demo round is 180 s (6 levels)

async function sweep([w, h, dsf], port) {
  const dir = join(OUT, `${w}x${h}@${dsf}`);
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
  const b = await launch({ port, profile: join(OUT, 'profiles', `${w}x${h}@${dsf}`), base: BASE });
  await b.size(w, h, dsf);
  if (process.env.REDUCED_MOTION) await b.reducedMotion(); // REDUCED_MOTION=1: prefers-reduced-motion: reduce
  // `settle`: let a screen's fade-in and count-up finish first, so the shot shows what a person
  // sees. `aa`: also check WCAG AA text contrast on that screen (not on game shots).
  const step = async (name, { settle = 0, aa = false } = {}) => {
    if (settle) await sleep(settle);
    await b.shot(dir, name);
    const l = await b.layout();
    check(`${name}: no horizontal scroll`, !l.hScroll);
    if (aa) {
      const fails = await b.contrast();
      check(`${name}: text AA contrast`, fails.length === 0, fails.slice(0, 4).map((f) => `"${f.text}" ${f.ratio}<${f.need}`).join(' | '));
    }
    return l;
  };
  // Sets a React-controlled input (the sign-up card's fields) the way typing would.
  const fill = (selector, value) =>
    b.eval(`(() => {
      const i = document.querySelector(${JSON.stringify(selector)});
      if (!i) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)});
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
  try {
    const url = `${BASE}?demo=1&store=local`;
    // Open the kiosk first on this fresh browser: it must not save a player (QA Q17).
    await b.go(`${BASE}?kiosk=1&store=local`, 2500);
    await b.go(url, 2500);
    check('landing shows Play as guest, even after the kiosk (Q17)', /PLAY AS GUEST/i.test(await b.text()));
    await step('01-landing', { settle: 1500, aa: true });

    // New flow: the landing's sign-up card (username, level) goes straight to select. Old flow:
    // Play as guest -> profile -> select.
    const signUp = await b.eval(`Boolean(document.querySelector('section[aria-label="New player"] input'))`);
    if (signUp) {
      await fill('section[aria-label="New player"] input', 'Sweep');
      await b.click('^\\s*regular\\s*$'); // the demo's 24,800 is the Regular tier; sign-up defaults to Beginner
      await step('02-signup', { aa: true });
      await b.click('^\\s*start\\b');
    } else {
      await b.click('play as guest');
      check('profile screen', await b.waitFor(/WHO'S PLAYING/i, 5000));
      await step('02-profile', { aa: true });
      await b.eval(`(() => { const i = document.querySelector('input'); i.focus(); i.select(); })()`);
      await b.type('Sweep');
      await b.eval('document.activeElement.blur()');
      await b.key('Enter');
    }
    check('select screen', await b.waitFor(/PICK A WORKOUT/i, 5000));
    const sel = await step('03-select', { settle: 2000, aa: true });
    check('select fits the screen (Q1)', sel.pageH <= sel.viewH + 4, `${sel.pageH} of ${sel.viewH}`);
    check('demo preselects Full body · floor · regular', /FULL BODY · FLOOR · REGULAR/.test(await b.text()));

    await b.click('^\\s*start\\b');
    check('tutorial on a first round', await b.waitFor(/TRY EACH MOVE/i, 5000));
    await step('04-tutorial', { settle: 1000, aa: true });
    await b.key('Escape');
    check('HUD appears', await b.waitFor(/TIME LEFT/i, 8000));
    await sleep(300);
    await b.eval(`(${AUTO})([])`);
    // Zones at 30 % and 52 % of the round, the finale in the last 10 s (src/game/tuning.ts); a level
    // portal every 30 s washes the scene out, so no shot on a multiple of 30.
    for (const [name, t] of [['05-play-city', 8], ['06-play-tunnel', 70], ['07-play-bridge', 100], ['08-play-finale', 174]]) {
      const t0 = Date.now();
      while (Date.now() - t0 < 90000) {
        const g = await b.eval('window.__auto && Number.isFinite(window.__auto.offset) ? window.__auto.gameNow() : -1');
        if (g >= t) break;
        await sleep(30);
      }
      await step(name);
    }
    check('round ends on results', await b.waitFor(/ROUND COMPLETE|CLEARED|OUT OF LIVES/i, 30000));
    await sleep(3000);
    await step('09-results', { aa: true });
    const res = await b.text();
    const score = res.match(/ACTIVE\s+([\d,]+)/)?.[1];
    check('perfect demo scores 24,800', score === '24,800', score);
    check('perfect demo clears all 6 levels', /ALL 6 LEVELS CLEARED/.test(res), res.split('\n')[0]);
    check('coach card (RULES)', /YOUR COACH[\s\S]*RULES/.test(res));

    await b.key('Enter'); // play again: no tutorial now
    check('play again starts a round', await b.waitFor(/TIME LEFT/i, 8000));
    await sleep(5000);
    await b.key('Escape');
    check('Esc pauses', await b.waitFor(/PAUSED/, 3000));
    await sleep(800); // the overlay fades in; a shot before that shows the scene through it
    await step('10-paused', { aa: true });
    check('keyboard pause shows no X-gesture hint (Q14)', !/Cross your arms/i.test(await b.text()));
    await b.click('end round');
    check('END ROUND returns to select', await b.waitFor(/PICK A WORKOUT/i, 5000));

    await b.key('Escape'); // select -> dashboard (has a round)
    check('dashboard', await b.waitFor(/YOUR WEEK/i, 5000));
    await step('11-dashboard', { settle: 2000, aa: true });
    const dash = await b.text();
    check('END ROUND saved nothing (1 round)', /\b1 round\b/.test(dash), dash.match(/\d+ rounds? ·/)?.[0]);

    await b.key('KeyL');
    check('leaderboard', await b.waitFor(/LEADERBOARD/i, 5000));
    await step('12-leaderboard', { settle: 2000, aa: true });
    const bt = await b.text();
    check('board is workout · mode, no round length', /FULL BODY · FLOOR/.test(bt) && !/\b(45|90|180) S\b/.test(bt));
    await b.click('^\\s*arms\\s*$');
    await sleep(600);
    const arms = await b.text();
    check('empty Arms board keeps filters and Back (Q3)', /BE THE FIRST/.test(arms) && /ARMS · FLOOR/.test(arms) && /BACK/.test(arms));

    await b.go(`${BASE}?kiosk=1&store=local`, 3000);
    await step('13-kiosk', { settle: 2000, aa: true });
    const kt = await b.text();
    check('kiosk shows the Full body board, no round length', /FULL BODY · FLOOR/.test(kt) && !/\b(45|90|180) S\b/.test(kt));

    await b.go(url, 2500);
    check('landing offers Continue as Sweep', /CONTINUE AS SWEEP/i.test(await b.text()));
    await step('14-landing-returning', { settle: 1500, aa: true });
    if (signUp) {
      // The guest path still exists behind the card: New player -> Play as guest -> profile.
      await b.click('^\\s*new player\\b');
      check('New player opens the sign-up card', await b.waitFor(/USERNAME/i, 3000));
      await b.click('^\\s*play as guest\\s*$');
      check('Play as guest opens the profile screen', await b.waitFor(/WHO'S PLAYING/i, 5000));
      await step('15-profile', { settle: 1000, aa: true });
    }
  } catch (e) {
    check('flow completed', false, e.message);
    await b.shot(dir, 'zz-error').catch(() => {});
  }
  // With REDUCED_MOTION the motion library logs that the OS setting is on: expected, not a bug.
  const logs = b.logs.filter((l) => !(process.env.REDUCED_MOTION && /reduced-motion-disabled/.test(l)));
  check('no console errors or warnings', logs.length === 0, logs.slice(0, 5).join(' | '));
  await b.close();
  return { size: `${w}x${h}@${dsf}`, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok), checks };
}

mkdirSync(OUT, { recursive: true });
// PORT_BASE: DevTools ports for this run's browsers, so two sweeps can run side by side.
const results = await Promise.all(SIZES.map((s, i) => sweep(s, Number(process.env.PORT_BASE ?? 9400) + i)));
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.size}: ${r.passed} passed, ${r.failed.length} failed`);
  for (const f of r.failed) console.log(`  FAIL ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
}
console.log(`Screenshots and summary.json in ${OUT}`);
process.exit(results.every((r) => r.failed.length === 0) ? 0 : 1);
