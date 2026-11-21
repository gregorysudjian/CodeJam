// QA sweep: the full keyboard flow at 1366x768, 1920x1080 and 1280x720 in parallel, with
// screenshots and a pass/fail summary. Needs `npm run dev` (the autoplayer imports the level
// generator from the dev server). Local store only; the camera is denied, nothing is uploaded.
//
//   node docs/qa/sweep/sweep.mjs [baseUrl] [outDir]
//   default baseUrl http://localhost:5173/, default outDir <tmp>/neon-sweep-<time>
//
// Exit code 0 = every check passed; 1 = see summary.json. Each size takes about 2 minutes.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, sleep, timebox } from './cdp.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const OUT = process.argv[3] ?? join(tmpdir(), `neon-sweep-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const AUTO = readFileSync(new URL('./auto.js', import.meta.url), 'utf8').trim().replace(/;$/, '');
const SIZES = [
  [1366, 768],
  [1920, 1080],
  [1280, 720],
];
timebox(6 * 60 * 1000, 'sweep');

async function sweep([w, h], port) {
  const dir = join(OUT, `${w}x${h}`);
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
  const b = await launch({ port, profile: join(OUT, 'profiles', `${w}x${h}`), base: BASE });
  await b.size(w, h);
  const step = async (name) => {
    await b.shot(dir, name);
    const l = await b.layout();
    check(`${name}: no horizontal scroll`, !l.hScroll);
    return l;
  };
  try {
    const url = `${BASE}?demo=1&store=local`;
    await b.go(url, 2500);
    check('landing shows Play as guest', /PLAY AS GUEST/i.test(await b.text()));
    await step('01-landing');

    await b.click('play as guest');
    check('profile screen', await b.waitFor(/WHO'S PLAYING/i, 5000));
    await step('02-profile');
    await b.eval(`(() => { const i = document.querySelector('input'); i.focus(); i.select(); })()`);
    await b.type('Sweep');
    await b.eval('document.activeElement.blur()');
    await b.key('Enter');
    check('select screen', await b.waitFor(/PICK A WORKOUT/i, 5000));
    const sel = await step('03-select');
    check('select fits the screen (Q1)', sel.pageH <= sel.viewH + 4, `${sel.pageH} of ${sel.viewH}`);
    check('demo preselects Full body · floor · 45 s', /FULL BODY · FLOOR · 45 S/.test(await b.text()));

    await b.click('^\\s*start\\b');
    check('tutorial on a first round', await b.waitFor(/TRY EACH MOVE/i, 5000));
    await step('04-tutorial');
    await b.key('Escape');
    check('HUD appears', await b.waitFor(/TIME LEFT/i, 8000));
    await sleep(300);
    await b.eval(`(${AUTO})([])`);
    for (const [name, t] of [['05-play-city', 8], ['06-play-tunnel', 18.5], ['07-play-bridge', 29], ['08-play-finale', 39.5]]) {
      const t0 = Date.now();
      while (Date.now() - t0 < 60000) {
        const g = await b.eval('window.__auto && Number.isFinite(window.__auto.offset) ? window.__auto.gameNow() : -1');
        if (g >= t) break;
        await sleep(30);
      }
      await step(name);
    }
    check('round ends on results', await b.waitFor(/ROUND COMPLETE/i, 20000));
    await sleep(3000);
    await step('09-results');
    const res = await b.text();
    check('perfect demo scores 4,750', /4,750/.test(res), res.match(/ROUND COMPLETE[^\n]*\n+([\d,]+)/)?.[1]);
    check('coach card (RULES)', /YOUR COACH[\s\S]*RULES/.test(res));

    await b.key('Enter'); // play again: no tutorial now
    check('play again starts a round', await b.waitFor(/TIME LEFT/i, 8000));
    await sleep(5000);
    await b.key('Escape');
    check('Esc pauses', await b.waitFor(/PAUSED/, 3000));
    await step('10-paused');
    await b.click('end round');
    check('END ROUND returns to select', await b.waitFor(/PICK A WORKOUT/i, 5000));

    await b.key('Escape'); // select -> dashboard (has a round)
    check('dashboard', await b.waitFor(/YOUR WEEK/i, 5000));
    await step('11-dashboard');
    const dash = await b.text();
    check('END ROUND saved nothing (1 round)', /\b1 round\b/.test(dash), dash.match(/\d+ rounds? ·/)?.[0]);

    await b.key('KeyL');
    check('leaderboard', await b.waitFor(/LEADERBOARD/i, 5000));
    await step('12-leaderboard');
    check('board title has the round length', /FULL BODY · FLOOR · 45 S/.test(await b.text()));
    await b.click('^\\s*90 s\\s*$');
    await sleep(600);
    const b90 = await b.text();
    check('empty 90 s board keeps filters and Back (Q3)', /BE THE FIRST/.test(b90) && /180 S/.test(b90) && /BACK/.test(b90));

    await b.go(`${BASE}?kiosk=1&store=local`, 3000);
    await step('13-kiosk');
    check('kiosk shows the 45 s board', /FULL BODY · FLOOR · 45 S/.test(await b.text()));

    await b.go(url, 2500);
    check('landing offers Continue as Sweep', /CONTINUE AS SWEEP/i.test(await b.text()));
  } catch (e) {
    check('flow completed', false, e.message);
    await b.shot(dir, 'zz-error').catch(() => {});
  }
  check('no console errors or warnings', b.logs.length === 0, b.logs.slice(0, 5).join(' | '));
  await b.close();
  return { size: `${w}x${h}`, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok), checks };
}

mkdirSync(OUT, { recursive: true });
const results = await Promise.all(SIZES.map((s, i) => sweep(s, 9400 + i)));
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.size}: ${r.passed} passed, ${r.failed.length} failed`);
  for (const f of r.failed) console.log(`  FAIL ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
}
console.log(`Screenshots and summary.json in ${OUT}`);
process.exit(results.every((r) => r.failed.length === 0) ? 0 : 1);
