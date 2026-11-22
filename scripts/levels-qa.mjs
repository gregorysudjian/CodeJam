// QA for the level system (contract #89-#91): real keyboard rounds in Chrome on
// ?demo=1&store=local&music=off, checked against the game's own events and the saved round.
// Node 22+ and Chrome, no packages; reuses src/game/e2e (CDP driver and keyboard autopilot).
//
//   node scripts/levels-qa.mjs                          # starts a dev server on port 5175
//   node scripts/levels-qa.mjs --url http://localhost:5173/
//   node scripts/levels-qa.mjs --only pause             # lives | clean | pause
//   node scripts/levels-qa.mjs --headless
//
// Checks:
//   lives  standing still: 3 lifeLost (2, 1, 0), finished 'outOfLives' before 180 s, "OUT OF LIVES"
//          on screen, the saved round has durationSec 180, outOfLives true, levelReached >= 1, and
//          the coach recap names the level.
//   clean  perfect play: stage events 1..6 in order, no lifeLost, finished 'complete', the saved
//          round has durationSec 180, levelReached 6, and the coach recap names the levels.
//   pause  Esc mid-round, Esc again: a 'resuming' event and a 3-2-1 before 'resumed' (drawn on the
//          game's canvas, recorded through fillText/strokeText, or shown as page text), and
//          game time frozen until 'resumed', then moving again.
// Events are read by subscribing to the Game object itself (found through React's fiber tree,
// as the autopilot finds the level), so this checks the contract, not only the screen.
// Exit 0 when every check passes. Everything runs on ?store=local in a throwaway Chrome profile.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from '../src/game/e2e/cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const only = opt('--only');
const DEV_PORT = 5175;
const CDP_PORT = 9335;
const ROUND_SEC = 180;
const LEVELS = 6;
const autopilot = readFileSync(join(root, 'src/game/e2e/autopilot.js'), 'utf8');

async function devServer() {
  if (opt('--url')) return { base: opt('--url'), stop: () => {} };
  const proc = spawn(
    join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite'),
    ['--port', String(DEV_PORT), '--strictPort'],
    {
      cwd: root,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    },
  );
  const base = `http://localhost:${DEV_PORT}/`;
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(base)).ok) return { base, stop: () => proc.kill() };
    } catch {
      /* starting */
    }
    await sleep(200);
  }
  proc.kill();
  throw new Error(`the dev server did not start on port ${DEV_PORT}`);
}

// In the page: find the Game (an object with onEvent and getElapsedSec) and record its events.
const HOOK = `(() => {
  if (window.__qaGame) return true;
  const isGame = (v) => v && typeof v === 'object' && typeof v.onEvent === 'function' && typeof v.getElapsedSec === 'function';
  const pick = (v) => (isGame(v) ? v : isGame(v?.current) ? v.current : null);
  const roots = [...document.querySelectorAll('canvas, [data-game], main, body *')].slice(0, 400);
  for (const el of roots) {
    const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
    for (let f = k && el[k]; f; f = f.return) {
      for (const v of Object.values(f.memoizedProps ?? {})) { const g = pick(v); if (g) return attach(g); }
      for (let h = f.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) {
        const g = pick(h.memoizedState) ?? (Array.isArray(h.memoizedState) ? pick(h.memoizedState[0]) : null);
        if (g) return attach(g);
      }
    }
  }
  return false;
  function attach(g) {
    window.__qaGame = g;
    window.__qaEvents = [];
    g.onEvent((e) => window.__qaEvents.push({
      type: e.type,
      at: performance.now(),
      sec: g.getElapsedSec(),
      ...(e.type === 'stage' ? { index: e.stage?.index } : {}),
      ...(e.type === 'lifeLost' ? { livesLeft: e.livesLeft } : {}),
      ...(e.type === 'finished' ? { reason: e.reason ?? 'complete' } : {}),
      ...(e.type === 'resuming' ? { inSec: e.inSec } : {}),
    }));
    return true;
  }
})()`;

async function toSelect(page, base) {
  const url = `${base}?demo=1&store=local&music=off`;
  await page.goto(url);
  // A cold dev server compiles on the first visit: allow it time.
  await page.waitFor(
    `/PLAY AS GUEST|CONTINUE AS|PICK A WORKOUT/.test(document.body.innerText)`,
    90000,
  );
  // Every case starts as a new player. With a player saved by the case before, the landing first
  // shows PLAY AS GUEST and then, once the saved player loads, CONTINUE AS ... on the same button:
  // reading one and clicking the other failed when run in one go. The Chrome profile is a
  // throwaway one (cdp.mjs), so forget everything this origin stored and load the page again.
  await page.eval('localStorage.clear(), sessionStorage.clear(), true');
  await page.goto(url);
  await page.waitFor(`/PLAY AS GUEST/.test(document.body.innerText)`, 30000);
  await page.click('play as guest');
  await page.waitFor(`!!document.querySelector('input')`);
  await page.eval(`(() => { const i = document.querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'QA-levels');
    i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await page.click('continue');
  await page.waitFor(`/PICK A WORKOUT/.test(document.body.innerText)`, 20000);
  await sleep(1500); // the app may switch to the camera once it finds one; let that settle
  await page.click('keyboard');
  await sleep(300);
}

async function startRound(page, mode) {
  await page.eval(autopilot);
  await page.eval(`(async () => {
    let intro = 3;
    try { intro = (await import('/src/game/tuning.ts')).INTRO_SEC ?? 3; } catch { /* moved */ }
    window.__startAutopilot('${mode}', intro);
  })()`);
  await page.click('start');
  const end = Date.now() + 40000;
  while (Date.now() < end) {
    if (await page.eval(HOOK).catch(() => false)) break;
    const t = await page.text().catch(() => '');
    if (/START THE ROUND/.test(t)) await page.click('start the round').catch(() => {});
    await sleep(100);
  }
  if (!(await page.eval('!!window.__qaGame')))
    throw new Error('could not find the Game object to read its events');
}

const events = (page) => page.eval('window.__qaEvents ?? []');
const lastSaved = (page) =>
  page.eval(`JSON.parse(localStorage.getItem('codejam.local.sessions') || '[]')[0] ?? null`);
async function waitFinished(page, maxSec) {
  const end = Date.now() + maxSec * 1000;
  while (Date.now() < end) {
    if ((await events(page)).some((e) => e.type === 'finished')) break;
    await sleep(500);
  }
  await page
    .waitFor(`/ROUND COMPLETE|OUT OF LIVES|YOUR COACH/.test(document.body.innerText)`, 20000)
    .catch(() => {});
  await sleep(2500); // the save and the coach card
  await page.eval('window.__stopAutopilot?.()');
}
const coachText = (page) =>
  page.eval(
    `(() => { const t = document.body.innerText.replace(/\\s+/g, ' '); const i = t.search(/YOUR COACH/i); return i < 0 ? t : t.slice(i, i + 400); })()`,
  );

async function lives(page, base) {
  const fails = [];
  await toSelect(page, base);
  await page.eval(DRAW_HOOK);
  await startRound(page, 'idle');
  await waitFinished(page, ROUND_SEC + 30);
  const ev = await events(page);
  const lost = ev.filter((e) => e.type === 'lifeLost').map((e) => e.livesLeft);
  const fin = ev.find((e) => e.type === 'finished');
  if (lost.join(',') !== '2,1,0')
    fails.push(`lifeLost livesLeft ${JSON.stringify(lost)} (want [2,1,0])`);
  if (fin?.reason !== 'outOfLives')
    fails.push(`finished reason ${fin?.reason ?? '(no finished event)'} (want outOfLives)`);
  if (fin && fin.sec >= ROUND_SEC)
    fails.push(`finished at ${fin.sec.toFixed(1)} s game time (want before ${ROUND_SEC})`);
  const lastLost = ev.filter((e) => e.type === 'lifeLost').at(-1);
  if (fin && lastLost && fin.at < lastLost.at) fails.push('finished came before the last lifeLost');
  const screen = await page.text();
  // Drawn on the game's canvas when the last life goes (view3d banner, view2d plate), or page text.
  const drawnOut = (await page.eval('window.__qaDrawn ?? []')).some((x) =>
    /out of lives/i.test(x.d),
  );
  if (!drawnOut && !/OUT OF LIVES/i.test(screen))
    fails.push('"OUT OF LIVES" neither drawn on the canvas nor on screen');
  const s = await lastSaved(page);
  if (!s) fails.push('no round saved');
  else {
    if (s.config?.durationSec !== ROUND_SEC)
      fails.push(`saved durationSec ${s.config?.durationSec} (want ${ROUND_SEC})`);
    if (s.outOfLives !== true) fails.push(`saved outOfLives ${s.outOfLives} (want true)`);
    if (!(s.levelReached >= 1)) fails.push(`saved levelReached ${s.levelReached} (want >= 1)`);
  }
  const coach = await coachText(page);
  if (!/level \d/i.test(coach)) fails.push(`coach recap names no level: "${coach.slice(0, 160)}"`);
  else if (!/running out of lives/i.test(coach))
    fails.push(`coach recap does not say it ran out of lives: "${coach.slice(0, 160)}"`);
  return {
    fails,
    notes: [
      `lives lost ${JSON.stringify(lost)}, finished ${fin?.reason} at ${fin?.sec?.toFixed(1)} s, level ${s?.levelReached}`,
    ],
  };
}

async function clean(page, base) {
  const fails = [];
  await toSelect(page, base);
  await startRound(page, 'perfect');
  await waitFinished(page, ROUND_SEC + 60);
  const ev = await events(page);
  const stages = ev.filter((e) => e.type === 'stage').map((e) => e.index);
  const want = Array.from({ length: LEVELS }, (_, i) => i + 1);
  // Level 1's event can fire before the hook attaches; every later level must come, in order.
  const seen = stages[0] === 1 ? stages : [1, ...stages];
  if (seen.join(',') !== want.join(','))
    fails.push(`stage events ${JSON.stringify(stages)} (want ${JSON.stringify(want)})`);
  const lost = ev.filter((e) => e.type === 'lifeLost');
  if (lost.length)
    fails.push(
      `${lost.length} lifeLost in a perfect run (at ${lost.map((e) => e.sec.toFixed(1)).join(', ')} s)`,
    );
  const fin = ev.find((e) => e.type === 'finished');
  if (fin?.reason !== 'complete')
    fails.push(`finished reason ${fin?.reason ?? '(no finished event)'} (want complete)`);
  const s = await lastSaved(page);
  if (!s) fails.push('no round saved');
  else {
    if (s.config?.durationSec !== ROUND_SEC)
      fails.push(`saved durationSec ${s.config?.durationSec} (want ${ROUND_SEC})`);
    if (s.levelReached !== LEVELS)
      fails.push(`saved levelReached ${s.levelReached} (want ${LEVELS})`);
    if (s.outOfLives) fails.push('saved outOfLives true in a perfect run');
  }
  const coach = await coachText(page);
  if (!new RegExp(`all ${LEVELS} levels|level ${LEVELS}`, 'i').test(coach))
    fails.push(`coach recap does not name level ${LEVELS}: "${coach.slice(0, 160)}"`);
  return {
    fails,
    notes: [
      `stages ${JSON.stringify(stages)}, finished ${fin?.reason} at ${fin?.sec?.toFixed(1)} s, level ${s?.levelReached}`,
    ],
  };
}

// The game draws its 3-2-1 on a canvas (a texture in the 3D view, text in the 2D one), never as
// page text: record every lone 1, 2 or 3 drawn with fillText or strokeText.
const DRAW_HOOK = `(() => {
  if (window.__qaDrawn) return;
  window.__qaDrawn = [];
  const P = CanvasRenderingContext2D.prototype;
  for (const fn of ['fillText', 'strokeText']) {
    const orig = P[fn];
    P[fn] = function (text, ...rest) {
      const s = String(text).trim();
      if (/^[123]$/.test(s) || /out of lives/i.test(s)) window.__qaDrawn.push({ d: s, at: performance.now() });
      return orig.call(this, text, ...rest);
    };
  }
})()`;

async function pause(page, base) {
  const fails = [];
  await toSelect(page, base);
  await page.eval(DRAW_HOOK);
  await startRound(page, 'perfect');
  await page.waitFor(`(window.__qaGame?.getElapsedSec() ?? 0) >= 8`, 40000);
  await page.key('Escape');
  await sleep(1200);
  const pausedAt = await page.eval('window.__qaGame.getElapsedSec()');
  await sleep(1000);
  if ((await page.eval('window.__qaGame.getElapsedSec()')) !== pausedAt)
    fails.push('game time moved while paused');
  if (!(await events(page)).some((e) => e.type === 'paused'))
    fails.push('no paused event after Esc');
  // Resume, then sample game time and the screen every 100 ms until 'resumed' (or 6 s).
  const n0 = (await events(page)).length;
  const t0 = Date.now();
  const keyAt = await page.eval('performance.now()');
  await page.key('Escape');
  const digits = new Set();
  let movedBeforeResumed = null;
  while (Date.now() - t0 < 6000) {
    const [sec, ev, txt] = await Promise.all([
      page.eval('window.__qaGame.getElapsedSec()'),
      events(page),
      page.eval(
        `[...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /^\\s*[123]\\s*$/.test(e.textContent) && e.getBoundingClientRect().height > 40).map((e) => e.textContent.trim()).join('')`,
      ),
    ]);
    for (const d of txt) digits.add(d);
    const resumed = ev.slice(n0).some((e) => e.type === 'resumed');
    if (!resumed && sec !== pausedAt && movedBeforeResumed === null)
      movedBeforeResumed = Date.now() - t0;
    if (resumed) break;
    await sleep(100);
  }
  const after = (await events(page)).slice(n0);
  const resuming = after.filter((e) => e.type === 'resuming');
  const resumed = after.find((e) => e.type === 'resumed');
  if (!resuming.length) fails.push("no 'resuming' event before the round went on");
  if (!resumed) fails.push("no 'resumed' event within 6 s");
  if (resuming.length && resumed && resuming[0].at > resumed.at)
    fails.push("'resuming' came after 'resumed'");
  if (resumed && resuming.length) {
    const wait = (resumed.at - resuming[0].at) / 1000;
    if (wait < 2.5 || wait > 4) fails.push(`countdown lasted ${wait.toFixed(1)} s (want about 3)`);
  }
  if (movedBeforeResumed !== null)
    fails.push(`game time moved ${movedBeforeResumed} ms after Esc, before 'resumed'`);
  // What the game drew between the key and 'resumed', in order of first appearance.
  const drawn = (await page.eval('window.__qaDrawn ?? []')).filter(
    (x) => /^[123]$/.test(x.d) && x.at >= keyAt && x.at <= (resumed?.at ?? Infinity),
  );
  const order = [...new Set(drawn.map((x) => x.d))].join('');
  for (const d of order) digits.add(d);
  if (!['3', '2', '1'].every((d) => digits.has(d)))
    fails.push(`3-2-1 not all shown (drawn "${order}", page text "${[...digits].join('')}")`);
  else if (order && order !== '321')
    fails.push(`countdown drawn in the order "${order}" (want 321)`);
  if (resumed) {
    await sleep(1500);
    if ((await page.eval('window.__qaGame.getElapsedSec()')) <= pausedAt)
      fails.push("game time did not move after 'resumed'");
  }
  await page.eval('window.__stopAutopilot?.()');
  // End the round without waiting 3 minutes.
  await page.key('Escape');
  await sleep(500);
  await page.click('end round').catch(() => {});
  return {
    fails,
    notes: [
      `resuming ${JSON.stringify(resuming.map((e) => e.inSec))}, digits seen "${[...digits].join('')}"`,
    ],
  };
}

const CASES = { pause, lives, clean };
const { base, stop } = await devServer();
const page = await launchChrome({ port: CDP_PORT, headless: args.includes('--headless') });
let failed = 0;
try {
  for (const [name, run] of Object.entries(CASES)) {
    if (only && only !== name) continue;
    const t = Date.now();
    let r;
    try {
      r = await run(page, base);
    } catch (e) {
      r = { fails: [`crashed: ${e.message.split('\n')[0]}`], notes: [] };
    }
    const errors = page.consoleLines.filter((l) => l.level === 'exception' || l.level === 'error');
    if (errors.length)
      r.fails.push(
        'console errors: ' +
          errors
            .map((l) => l.text.split('\n')[0])
            .slice(0, 3)
            .join(' | '),
      );
    page.consoleLines.length = 0;
    if (r.fails.length) failed++;
    console.log(
      `${r.fails.length ? 'FAIL' : 'PASS'}  ${name} (${Math.round((Date.now() - t) / 1000)} s)  ${r.notes.join('; ')}`,
    );
    for (const f of r.fails) console.log(`      - ${f}`);
  }
} finally {
  page.close();
  stop();
}
console.log(failed ? `FAIL  ${failed} case(s)` : 'PASS  level system');
process.exit(failed ? 1 : 0);
