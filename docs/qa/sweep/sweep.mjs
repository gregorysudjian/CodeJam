// QA sweep: the full keyboard flow at 1366x768, 1920x1080 and 1280x720 in parallel, with
// screenshots and a pass/fail summary. Needs `npm run dev` (the autoplayer imports the level
// generator from the dev server). Local store only; the camera is denied, nothing is uploaded.
//
//   node docs/qa/sweep/sweep.mjs [baseUrl] [outDir]
//   default baseUrl http://localhost:5173/, default outDir <tmp>/neon-sweep-<time>
//
// Exit code 0 = every check passed; 1 = see summary.json. Each size takes about 10 minutes (the
// 180 s demo round, then four idle rounds for the nav bar). See README.md for the checks.
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
timebox(25 * 60 * 1000, 'sweep'); // the demo round is 180 s (6 levels), plus four idle rounds for the nav bar

async function sweep([w, h, dsf], port) {
  const dir = join(OUT, `${w}x${h}@${dsf}`);
  const checks = [];
  const perf = [];
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
      // Stutter, info only: 2 s of frame times (the game catches up at most 50 ms a frame).
      const f = await b.eval(`new Promise((done) => {
        const t = []; let last = performance.now(); const end = last + 2000;
        const tick = (now) => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else done(t); };
        requestAnimationFrame(tick);
      })`);
      perf.push(`${name}: ${Math.round((f.length / f.reduce((a, x) => a + x, 0)) * 1000)} fps, worst ${Math.round(Math.max(...f))} ms, ${f.filter((x) => x > 50).length} frames > 50 ms`);
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
    // Board-only text: "LEADERBOARD" alone is also on the dashboard and in the nav bar.
    check('L opens the leaderboard', await b.waitFor(/OPEN SPOT|BE THE FIRST/i, 5000));
    await step('12-leaderboard', { settle: 2000, aa: true });
    const bt = await b.text();
    check('board is workout · mode, no round length', /FULL BODY · FLOOR/.test(bt) && !/\b(45|90|180) S\b/.test(bt));
    await b.click('^\\s*arms\\s*$');
    await sleep(600);
    const arms = await b.text();
    check('empty Arms board keeps filters and Back (Q3)', /BE THE FIRST/.test(arms) && /ARMS · FLOOR/.test(arms) && /BACK/.test(arms));
    // FRIENDS tab: empty state and the add-friend panel; adding one with the local store (no
    // friends service) answers "Friends need the internet".
    if (await b.eval(`[...document.querySelectorAll('[role=radio], button')].some((e) => /^\\s*friends\\s*$/i.test(e.innerText || ''))`)) {
      await b.click('^\\s*friends\\s*$');
      check('FRIENDS tab: no friends yet, add-friend panel', await b.waitFor(/NO FRIENDS YET/i, 3000) && /ADD FRIEND/i.test(await b.text()));
      await fill('[aria-label="Friends"] input', 'Someone');
      await b.click('^\\s*add\\s*$');
      check('FRIENDS add with the local store: "Friends need the internet"', await b.waitFor(/friends need the internet/i, 3000));
      await step('12b-leaderboard-friends', { settle: 500, aa: true });
    }

    await b.go(`${BASE}?kiosk=1&store=local`, 3000);
    await step('13-kiosk', { settle: 2000, aa: true });
    const kt = await b.text();
    check('kiosk shows the Full body board, no round length', /FULL BODY · FLOOR/.test(kt) && !/\b(45|90|180) S\b/.test(kt));

    await b.go(url, 2500);
    check('landing offers Continue as Sweep', /CONTINUE AS SWEEP/i.test(await b.text()));
    await step('14-landing-returning', { settle: 1500, aa: true });

    // Nav bar (select and results): each item goes where it says, and the flow still reaches a
    // round and results afterwards. Results need a round each: an idle one, lost in about 30 s.
    await b.click('^\\s*continue as\\b');
    check('Continue as Sweep opens select', await b.waitFor(/PICK A WORKOUT/i, 5000));
    if (await b.eval(`Boolean(document.querySelector('nav[aria-label="Main"]'))`)) {
      const SCREENS = {
        select: /PICK A WORKOUT/i,
        dashboard: /YOUR WEEK/i,
        leaderboard: /OPEN SPOT|BE THE FIRST/i,
        profile: /WHO'S PLAYING/i,
        results: /ROUND COMPLETE|LEVELS CLEARED|OUT OF LIVES/i,
      };
      const where = async () => {
        const t = await b.text();
        return Object.keys(SCREENS).find((k) => SCREENS[k].test(t)) ?? 'unknown';
      };
      const NAV = { play: ['^play$', 'select'], progress: ['^progress$', 'dashboard'], leaderboard: ['^leaderboard$', 'leaderboard'], chip: ['^profile:', 'profile'] };
      const navClick = async (item) => {
        const [re] = NAV[item];
        await b.eval(`document.querySelector('nav[aria-label="Main"]')?.scrollIntoView()`);
        const ok = await b.eval(`(() => {
          const el = [...document.querySelectorAll('nav[aria-label="Main"] button')].find((e) => new RegExp(${JSON.stringify(re)}, 'i').test(e.getAttribute('aria-label') || ''));
          if (!el) return false;
          el.click();
          return true;
        })()`);
        await sleep(1200);
        return ok;
      };
      // Back to select from wherever the nav went (each screen's own primary/back key).
      const toSelect = async () => {
        for (let i = 0; i < 4; i++) {
          const s = await where();
          if (s === 'select') return true;
          if (s === 'results') await navClick('play');
          else await b.key(s === 'leaderboard' ? 'Escape' : 'Enter');
          await sleep(1200);
        }
        return (await where()) === 'select';
      };
      const loseRound = async () => {
        await b.click('^\\s*start\\b');
        if (!(await b.waitFor(/TIME LEFT/i, 8000))) return false;
        return b.waitFor(SCREENS.results, 120000);
      };

      await step('16-select-nav', { settle: 1000, aa: true });
      for (const item of ['play', 'progress', 'leaderboard', 'chip']) {
        check(`select nav: ${item} button exists`, await navClick(item));
        const got = await where();
        check(`select nav: ${item} -> ${NAV[item][1]}`, got === NAV[item][1], got);
        if (item === 'chip') {
          // Editing an existing player: the profile screen keeps the nav bar (first-time setup has none).
          check('profile from the nav chip shows the nav bar', await b.eval(`Boolean(document.querySelector('nav[aria-label="Main"]'))`));
          await step('16b-profile-from-chip', { settle: 1000, aa: true });
        }
        check(`select nav: back to select after ${item}`, await toSelect());
      }
      for (const item of ['play', 'progress', 'leaderboard', 'chip']) {
        check(`idle round reaches results (before results nav: ${item})`, await loseRound());
        await sleep(2500);
        if (item === 'play') await step('17-results-nav', { aa: true });
        check(`results nav: ${item} button exists`, await navClick(item));
        const got = await where();
        check(`results nav: ${item} -> ${NAV[item][1]}`, got === NAV[item][1], got);
        check(`results nav: back to select after ${item}`, await toSelect());
      }
    }

    await b.go(url, 2500);
    if (signUp) {
      // The guest path still exists behind the card: New player -> Play as guest -> profile.
      await b.click('^\\s*new player\\b');
      check('New player opens the sign-up card', await b.waitFor(/USERNAME/i, 3000));
      await b.click('^\\s*play as guest\\s*$');
      check('Play as guest opens the profile screen', await b.waitFor(/WHO'S PLAYING/i, 5000));
      check('first-time profile setup has no nav bar', !(await b.eval(`Boolean(document.querySelector('nav[aria-label="Main"]'))`)));
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

  // Calibration: its own browser with Chrome's fake camera (a test pattern, no person, so it waits
  // in "Get in position"). Camera on select -> START -> calibration; Esc back to select; START
  // again -> K (use the keyboard) -> tutorial. Not in the main browser: with a camera present the
  // app switches the whole flow to pose input.
  const c = await launch({ port, profile: join(OUT, 'profiles', `${w}x${h}@${dsf}-camera`), base: BASE, camera: true });
  try {
    await c.size(w, h, dsf);
    if (process.env.REDUCED_MOTION) await c.reducedMotion();
    await c.go(`${BASE}?demo=1&store=local`, 2500);
    await c.eval(`(() => {
      const i = document.querySelector('section[aria-label="New player"] input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Cal');
      i.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await c.click('^\\s*start\\b');
    check('camera: select screen', await c.waitFor(/PICK A WORKOUT/i, 5000));
    await c.click('^\\s*camera\\s*$');
    await sleep(500);
    await c.click('^\\s*start\\b');
    let opened = await c.waitFor(/GET IN POSITION|CAMERA DID NOT START/i, 20000);
    if (/CAMERA DID NOT START/i.test(await c.text())) {
      // Chrome's fake camera sometimes fails to open when several headless browsers start one at
      // once. The app's error screen is right; retry once through it and say so.
      check('camera: fake camera started first time (else the error screen, then TRY AGAIN)', false, 'Camera did not start: retried');
      await c.click('^\\s*try again\\s*$');
      opened = await c.waitFor(/GET IN POSITION/i, 20000);
    }
    check('camera: START opens calibration', opened && /GET IN POSITION/i.test(await c.text()));
    await sleep(3000); // the pose model loads and the status settles
    await c.shot(dir, '18-calibration');
    const cl = await c.layout();
    check('18-calibration: no horizontal scroll', !cl.hScroll);
    check('18-calibration: fits the screen', cl.pageH <= cl.viewH + 4, `${cl.pageH} of ${cl.viewH}`);
    const fails = await c.contrast();
    check('18-calibration: text AA contrast', fails.length === 0, fails.slice(0, 4).map((f) => `"${f.text}" ${f.ratio}<${f.need}`).join(' | '));
    await c.key('Escape');
    check('calibration: Esc returns to select', await c.waitFor(/PICK A WORKOUT/i, 5000));
    await c.click('^\\s*start\\b');
    await c.waitFor(/GET IN POSITION/i, 20000);
    await c.key('KeyK');
    check('calibration: K (keyboard) goes on to the tutorial', await c.waitFor(/TRY EACH MOVE/i, 5000));
  } catch (e) {
    check('calibration flow completed', false, e.message);
    await c.shot(dir, 'zz-calibration-error').catch(() => {});
  }
  // MediaPipe's own native notice on every camera start (a real webcam too): not an app bug.
  const camLogs = c.logs.filter((l) => !(process.env.REDUCED_MOTION && /reduced-motion-disabled/.test(l)) && !/gl_context\.cc.*OpenGL error checking is disabled/.test(l));
  check('calibration: no console errors or warnings', camLogs.length === 0, camLogs.slice(0, 5).join(' | '));
  await c.close();
  return { size: `${w}x${h}@${dsf}`, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok), perf, checks };
}

mkdirSync(OUT, { recursive: true });
// PORT_BASE: DevTools ports for this run's browsers, so two sweeps can run side by side.
const results = await Promise.all(SIZES.map((s, i) => sweep(s, Number(process.env.PORT_BASE ?? 9400) + i)));
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.size}: ${r.passed} passed, ${r.failed.length} failed`);
  for (const f of r.failed) console.log(`  FAIL ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  for (const p of r.perf) console.log(`  perf ${p}`);
}
console.log(`Screenshots and summary.json in ${OUT}`);
process.exit(results.every((r) => r.failed.length === 0) ? 0 : 1);
