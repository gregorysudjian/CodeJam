// Plays real rounds in Chrome with a keyboard autopilot and checks how they end: every workout,
// floor and treadmill, low impact, and the judge edge cases (standing still, key mashing, Esc
// spam, K mid-round, END ROUND at 0:01). Node 22+ and Chrome, no packages. About 15 minutes,
// or 3 with --quick (the two demo levels and END ROUND).
//
//   node src/game/e2e/run.mjs                 # starts its own dev server on port 5174
//   node src/game/e2e/run.mjs --quick
//   node src/game/e2e/run.mjs --only 'K mid-round, K back'   # one case by name
//   node src/game/e2e/run.mjs --headless      # no window (frame rates are then not meaningful)
//   node src/game/e2e/run.mjs --url http://localhost:5173/   # use a dev server already running
//
// Exit 0 = every check passed. It needs the dev server (not `npm run preview`): the autopilot
// reads the level from React's fiber tree and imports src modules. Rounds use ?store=local,
// so nothing reaches Supabase, and a throwaway Chrome profile, so the operator's ghosts and
// saved player are untouched.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { launchChrome, sleep } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
const DEV_PORT = 5174; // not 5173: that origin holds the operator's ghosts in his normal Chrome
const CDP_PORT = 9334;
const autopilot = readFileSync(join(here, 'autopilot.js'), 'utf8');

const SCENARIOS = [
  { name: 'demo level', demo: true, play: 'perfect', score: '4,750' },
  { name: 'demo level, low impact', demo: true, low: true, play: 'perfect' },
  { name: 'END ROUND at 0:01', demo: true, play: 'perfect', endAt: -1 },
  { name: 'Legs, low impact', workout: 'legs', low: true, play: 'perfect' },
  { name: 'Arms, low impact', workout: 'arms', low: true, play: 'perfect' },
  { name: 'Shoulders, low impact', workout: 'shoulders', low: true, play: 'perfect' },
  { name: 'Full body, low impact', workout: 'full body', low: true, play: 'perfect' },
  { name: 'Arms, treadmill', workout: 'arms', treadmill: true, play: 'perfect' },
  { name: 'Shoulders, treadmill', workout: 'shoulders', treadmill: true, play: 'perfect' },
  { name: 'Full body, treadmill', workout: 'full body', treadmill: true, play: 'perfect' },
  { name: 'stands still', demo: true, play: 'idle' },
  { name: 'mashes keys', demo: true, play: 'spam' },
  { name: 'Esc 9 times, then once more', demo: true, play: 'perfect', escAt: 10 },
  { name: 'K mid-round, K back', demo: true, play: 'perfect', kAt: 15 },
];
const QUICK = ['demo level', 'demo level, low impact', 'END ROUND at 0:01'];

async function startDevServer() {
  const proc = spawn(join(root, 'node_modules', '.bin', 'vite'), ['--port', String(DEV_PORT), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
  });
  const base = `http://localhost:${DEV_PORT}/`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) return { base, stop: () => proc.kill() };
    } catch {
      /* starting */
    }
    await sleep(200);
  }
  proc.kill();
  throw new Error(`the dev server did not start on port ${DEV_PORT} (is it taken?)`);
}

const sessions = (page) => page.eval(`JSON.parse(localStorage.getItem('codejam.local.sessions') || '[]').length`);

async function toSelectScreen(page) {
  await page.waitFor(`/PLAY AS GUEST|CONTINUE AS|PICK A WORKOUT/.test(document.body.innerText)`, 20000);
  const t = await page.text();
  if (/PICK A WORKOUT/.test(t)) return;
  if (/CONTINUE AS/.test(t)) await page.click('continue as');
  else {
    await page.click('play as guest');
    await page.waitFor(`!!document.querySelector('input')`);
    await page.eval(`(() => { const i = document.querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'E2E');
      i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await page.click('continue');
  }
  await page.waitFor(`/PICK A WORKOUT/.test(document.body.innerText)`);
  // The app switches to the camera once a camera is found (App.tsx, enumerateDevices), and that
  // can land after an early Keyboard click, so let it settle first.
  await sleep(1500);
}

async function setLowImpact(page, on) {
  // The select screen remembers the last round's settings, so read the switch before clicking it.
  // ToggleRow (src/ui/kit) is a <label htmlFor> next to a role=switch with aria-checked.
  const state = await page.eval(`(() => {
    const label = [...document.querySelectorAll('label')].find((l) => /^\\s*low impact/i.test(l.innerText));
    const sw = label && document.getElementById(label.htmlFor);
    if (!sw) return 'missing';
    if ((sw.getAttribute('aria-checked') === 'true') !== ${on}) sw.click();
    return sw.getAttribute('aria-checked');
  })()`);
  if (state === 'missing' && on) throw new Error('no Low impact switch');
}

async function playOne(page, base, s) {
  const notes = [];
  const fails = [];
  await page.goto(`${base}?store=local&music=off&debug=timing${s.demo ? '&demo=1' : ''}`);
  await toSelectScreen(page);
  if (s.workout) await page.click(s.workout);
  await page.click(s.treadmill ? 'treadmill' : 'floor');
  await page.click('45 s');
  await page.click('keyboard');
  await setLowImpact(page, !!s.low);
  await sleep(300);
  const before = await sessions(page);
  await page.eval(autopilot);
  await page.eval(`(async () => { const T = await import('/src/game/tuning.ts'); window.__startAutopilot('${s.play}', T.INTRO_SEC); })()`);
  await page.click('start');
  // A new player's first round shows "Try each move" first (src/app): START THE ROUND skips it.
  for (let i = 0; i < 40 && !(await page.eval(`document.body.dataset.game === 'running'`)); i++) {
    const t = await page.text();
    if (/GET IN POSITION/.test(t)) throw new Error('camera calibration started: the Keyboard choice did not stick');
    if (/START THE ROUND/.test(t)) await page.click('start the round');
    await sleep(250);
  }
  await page.waitFor(`window.__e2eLevel !== undefined`, 15000);
  const level = await page.eval('window.__e2eLevel');
  if (!level) fails.push('could not read the level');
  else {
    const c = level.config;
    if (c.lowImpact !== !!s.low) fails.push(`played lowImpact ${c.lowImpact} (picked ${!!s.low})`);
    if (c.mode !== (s.treadmill ? 'treadmill' : 'floor')) fails.push(`played mode ${c.mode}`);
    if (c.durationSec !== 45) fails.push(`played ${c.durationSec} s (picked 45 s)`);
    if (s.workout && c.workout.toLowerCase() !== s.workout.replace(' ', '')) fails.push(`played ${c.workout}`);
  }
  const dur = level?.config.durationSec ?? 45;
  const at = (e) => page.waitFor(`(window.__e2eTime ?? 0) >= ${e}`, (e + 30) * 1000);
  const paused = async () => /RESUME/.test(await page.text()) && !(await page.eval('document.body.dataset.game'));

  if (s.escAt) {
    await at(s.escAt);
    for (let i = 0; i < 9; i++) (await page.key('Escape'), await sleep(120));
    await sleep(800);
    if (!(await paused())) fails.push('not paused after 9 Esc');
    await page.key('Escape');
    await sleep(800);
    if (await paused()) fails.push('still paused after the 10th Esc');
  }
  if (s.kAt) {
    await at(s.kAt);
    await page.key('KeyK');
    await sleep(4000);
    await page.key('KeyK');
    await sleep(3000);
    if (/Recalibration failed/.test(await page.text())) fails.push('"Recalibration failed" shown after K back');
  }
  if (s.endAt) {
    await at(dur + s.endAt);
    await page.key('Escape');
    await sleep(500);
    await page.click('end round');
  }
  const end = Date.now() + (dur + 45) * 1000;
  let screen = '';
  while (Date.now() < end) {
    screen = await page.text();
    if (!(await page.eval('document.body.dataset.game')) && /ROUND COMPLETE|PICK A WORKOUT/.test(screen)) break;
    await sleep(500);
  }
  await page.eval('window.__stopAutopilot?.()');
  await sleep(2000);
  screen = await page.text();
  const saved = (await sessions(page)) - before;
  const out = await page.eval(`({ fps: window.__gameFps ?? null, misses: window.__gameMisses ?? [], outside: window.__e2eOutside ?? [] })`);
  const score = screen.match(/· \d+ S ([\d,]+)/)?.[1];
  const acc = screen.match(/ACCURACY (\d+)%/)?.[1];

  if (s.endAt) {
    if (saved !== 0) fails.push(`saved ${saved} rounds (want 0)`);
    if (!/PICK A WORKOUT/.test(screen)) fails.push('not back on the select screen');
  } else {
    if (!/ROUND COMPLETE/.test(screen)) fails.push('no results screen');
    if (saved !== 1) fails.push(`saved ${saved} rounds (want 1)`);
  }
  if (s.play === 'perfect' && !s.endAt && out.misses.length > 0)
    fails.push(`${out.misses.length} hits or missed orbs: ` + out.misses.map((m) => `${m.at} ${m.object} (${m.cause})`).join('; '));
  if (s.score && score !== s.score) fails.push(`score ${score} (want ${s.score})`);
  if (s.play === 'idle' && /Nice work/.test(screen)) fails.push('the coach says "Nice work" to a player who stood still');
  const errors = page.consoleLines.filter((l) => l.level === 'exception' || l.level === 'error');
  if (errors.length) fails.push('console errors: ' + errors.map((l) => l.text.split('\n')[0]).join(' | '));
  const ghost = [...new Set(page.consoleLines.filter((l) => l.text.startsWith('[game] ghost:')).map((l) => l.text))];
  if (out.outside.length) {
    const what = out.outside.slice(0, 5).join('; ');
    if (fails.length) fails.push(`outside input during the round, a likely cause (rerun without touching the window): ${what}`);
    else notes.push(`outside input: ${what}`);
  }
  if (s.endAt) notes.push('nothing saved');
  else notes.push(`${score ?? '?'} pts, ${acc ?? '?'} %, ${out.misses.length} hits/missed orbs`);
  if (!s.demo && level) notes.push(`seed ${level.config.seed}`);
  return { fails, notes, fps: out.fps, ghost: s.demo && !s.endAt ? ghost : [] };
}

/** Exact storage keys of the camera ghosts for both demo levels, for a check in normal Chrome. */
async function ghostSnippet(page) {
  const keys = await page.eval(`(async () => {
    const { generateLevel, DEMO_CONFIG } = await import('/src/workout/index.ts');
    const { ghostKey } = await import('/src/game/ghost.ts');
    return [false, true].map((low) => 'game.ghost.' + ghostKey(generateLevel({ ...DEMO_CONFIG, lowImpact: low }), 'pose'));
  })()`);
  return (
    `[${keys.map((k) => `'${k}'`).join(', ')}].map((k, i) => (i ? 'low impact' : 'normal') + ': ' + ` +
    `(localStorage.getItem(k) ? 'camera ghost ' + JSON.stringify(JSON.parse(localStorage.getItem(k)).result) : 'NO camera ghost'))`
  );
}

const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const list = only
  ? SCENARIOS.filter((s) => s.name === only)
  : flag('--quick')
    ? SCENARIOS.filter((s) => QUICK.includes(s.name))
    : SCENARIOS;
if (list.length === 0) throw new Error(`no scenario named "${only}": ${SCENARIOS.map((s) => s.name).join(', ')}`);
const server = urlArg ? { base: urlArg.endsWith('/') ? urlArg : urlArg + '/', stop: () => {} } : await startDevServer();
const page = await launchChrome({ port: CDP_PORT, headless: flag('--headless') });
const cleanup = () => (page.close(), server.stop());
process.on('SIGINT', () => (cleanup(), process.exit(130)));

let failed = 0;
let snippet = '';
console.log(`game e2e: ${list.length} rounds on ${server.base} (keyboard autopilot, throwaway Chrome profile)\n`);
try {
  for (const s of list) {
    const t0 = Date.now();
    let r;
    try {
      // A round is at most 45 s of play plus set-up and checks: give up on it after 4 minutes.
      r = await Promise.race([
        playOne(page, server.base, s),
        sleep(240000).then(() => Promise.reject(new Error('round took over 4 minutes'))),
      ]);
    } catch (err) {
      const where = await page.eval(`(document.body.dataset.game ?? 'not running') + ' | ' + document.body.innerText.replace(/\\s+/g, ' ').slice(0, 160)`).catch(() => '?');
      r = { fails: [String(err.message ?? err), 'screen: ' + where], notes: [], fps: null, ghost: [] };
    }
    if (r.fails.length) failed++;
    const fps = r.fps ? `${r.fps.avgFps.toFixed(0)} fps (slowest 5 %: ${r.fps.p95Ms.toFixed(0)} ms)` : '';
    console.log(`${r.fails.length ? 'FAIL' : 'ok  '}  ${s.name.padEnd(28)} ${r.notes.join(', ')}  ${fps}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    for (const f of r.fails) console.log(`        ${f}`);
    for (const g of r.ghost) console.log(`        ${g}`);
  }
  snippet = await ghostSnippet(page).catch((e) => `(could not build: ${e.message})`);
} finally {
  cleanup();
}
console.log(`\n${failed ? `${failed} of ${list.length} FAILED` : `all ${list.length} passed`}.`);
console.log(
  `\nThe ghost lines above are from this throwaway profile. To check the Player's camera ghosts, open\n` +
    `http://localhost:5173/?demo=1 in the normal Chrome on the demo Mac and paste this in the console:\n\n${snippet}\n`,
);
process.exit(failed ? 1 : 0);
