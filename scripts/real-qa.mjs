// One-command check for the realistic-mode branches (runner, obstacles, stage): a full perfect
// round with screenshots, then two short fallback rounds. Node 22+ and Chrome, no packages;
// reuses src/game/e2e (CDP driver and keyboard autopilot), like scripts/levels-qa.mjs.
//
//   node scripts/real-qa.mjs                                  # starts a dev server on port 5176
//   node scripts/real-qa.mjs --url http://localhost:5173/     # or use one already running
//   node scripts/real-qa.mjs --out <dir> --headless           # default out: <tmp>/real-qa
//
// 1. Main run, ?demo=1&store=local&music=off, perfect autopilot, the full 180 s round, 1280x720:
//    per level the fps (frames where game time moves), lives lost, the backdrop's style
//    (backdropFor(n).style from the dev server; unset counts as neon; "?" if it can't be read)
//    and what is ON SCREEN: every frame, the main scene (the one with fog) as three.js renders it,
//    read through Object3D.onBeforeRender: realistic mode is a clip as the background with no
//    bloom (scene.ts turns bloom off only on a real level; at Low graphics there is no clip).
//    "real" if at least 90% of the level's frames are, "neon" if at most 10%, else "mixed".
//    The runner column, the same way: "human" when a skinned mesh is drawn, else "robot".
//    Screenshots 15 s into each level and 0.5 s after each portal; the finished reason; console
//    errors (a 404 on /api/coach is ignored: the dev server has no /api).
//    FAIL if it does not finish 'complete', loses a life, misses a screenshot, logs an error, or a
//    level marked real is not real on screen (or its render state can't be read).
// 2. Fallback runs, the first 40 s (levels 1 and 2):
//    ?gfx=low                 FAIL on an exception, or if the round does not reach 40 s;
//    assets blocked           (runner model, obstacle textures, level clips) FAIL on an exception,
//                             a lost life, nothing blocked, or not reaching 40 s.
// 3. Prints a table, the fallback results and PASS/FAIL, and writes the same to <out>/summary.md,
//    with <out>/contact-sheet.png (the six mid-level screenshots, labelled).
// Exit 0 on PASS. Runs in a throwaway Chrome profile.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from '../src/game/e2e/cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const OUT = opt('--out') ?? join(tmpdir(), 'real-qa');
const DEV_PORT = 5176;
const CDP_PORT = 9336;
const ROUND_SEC = 180;
const LEVELS = 6;
const LEVEL_SEC = ROUND_SEC / LEVELS;
const SHORT_SEC = 40;
const QUERY = '?demo=1&store=local&music=off';
const BLOCKED = ['*/models/runner/*', '*/media/obstacles/*', '*/media/level-*'];
const autopilot = readFileSync(join(root, 'src/game/e2e/autopilot.js'), 'utf8');

async function devServer() {
  if (opt('--url')) return { base: opt('--url'), stop: () => {} };
  const proc = spawn(
    join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite'),
    ['--port', String(DEV_PORT), '--strictPort'],
    { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' },
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

// Console errors, exceptions and blocked requests, read straight from the CDP socket (cdp.mjs
// keeps no URL, and the /api/coach 404 is told apart by its URL).
function watch(page) {
  const w = { errors: [], exceptions: [], blocked: 0 };
  page.ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    const p = msg.params;
    if (msg.method === 'Runtime.exceptionThrown')
      w.exceptions.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text);
    else if (msg.method === 'Runtime.consoleAPICalled' && p.type === 'error')
      w.errors.push(p.args.map((x) => x.value ?? x.description ?? x.type).join(' '));
    else if (msg.method === 'Log.entryAdded' && p.entry.level === 'error') {
      const { text, url = '' } = p.entry;
      if (/\/api\/coach/.test(url) && /404/.test(text)) return;
      if (/ERR_BLOCKED_BY_CLIENT/.test(text)) return; // counted below
      w.errors.push(url ? `${text} (${url})` : text);
    } else if (msg.method === 'Network.loadingFailed' && p.blockedReason) w.blocked++;
  });
  w.reset = () => ((w.errors.length = 0), (w.exceptions.length = 0), (w.blocked = 0));
  return w;
}
const firstLine = (s) => String(s).split('\n')[0];

// In the page: find the Game (an object with onEvent and getElapsedSec) and record its events.
const HOOK = `(() => {
  if (window.__qaGame) return true;
  const g = window.__findGame?.();
  if (!g) return false;
  window.__qaGame = g;
  window.__qaEvents = [];
  g.onEvent((e) => window.__qaEvents.push({
    type: e.type,
    sec: g.getElapsedSec(),
    ...(e.type === 'stage' ? { index: e.stage?.index } : {}),
    ...(e.type === 'finished' ? { reason: e.reason ?? 'complete' } : {}),
  }));
  return true;
})()`;

// What three.js draws: each object's onBeforeRender gets the scene being rendered, so the main
// scene (the one with fog) is seen every frame with its background and the render target (bloom
// renders the scene into one; without bloom it goes straight to the screen). Uses the app's own
// three module (Vite's pre-bundled dependency, found among the loaded resources).
const RENDER_HOOK = `(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\\/deps\\/three\\.js/.test(n));
  if (!url) return false;
  const THREE = await import(url);
  const P = THREE.Object3D.prototype;
  const orig = P.onBeforeRender;
  P.onBeforeRender = function (renderer, scene, ...rest) {
    if (scene?.isScene && scene.fog) {
      window.__qaRender = { real: !!scene.background?.isVideoTexture && renderer.getRenderTarget() === null, at: performance.now() };
      if (this.isSkinnedMesh) window.__qaSkin = performance.now(); // the human runner is skinned
    }
    return orig.call(this, renderer, scene, ...rest);
  };
  return true;
})()`;

// Every animation frame records the game time, so frames are grouped by level and frozen time
// (intro, pauses) is left out, whether that frame drew realistic mode (1), neon (0) or nothing
// readable (-1), and whether it drew a skinned mesh (the human runner: 1; the robot: 0).
const FRAME_SAMPLER = `(() => {
  window.__qaFrames = [];
  const loop = () => {
    const g = window.__qaGame;
    const r = window.__qaRender;
    const now = performance.now();
    const known = r && now - r.at < 200;
    if (g) window.__qaFrames.push([now, g.getElapsedSec(), known ? (r.real ? 1 : 0) : -1, known ? (now - (window.__qaSkin ?? -1e9) < 200 ? 1 : 0) : -1]);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})()`;
/**
 * Per level, from frame field `k` (1 yes, 0 no, -1 unknown): `yes` if at least 90% of the known
 * frames are, `no` if at most 10%, else 'mixed (n% yes)'; '?' when no frame could be read.
 */
function byLevel(frames, k, yes, no) {
  const out = [];
  for (let lv = 1; lv <= LEVELS; lv++) {
    const lo = (lv - 1) * LEVEL_SEC;
    const known = frames.filter((f) => f[1] >= lo && f[1] < lv * LEVEL_SEC && f[k] >= 0);
    if (!known.length) {
      out.push('?');
      continue;
    }
    const share = known.filter((f) => f[k] === 1).length / known.length;
    out.push(share >= 0.9 ? yes : share <= 0.1 ? no : `mixed (${Math.round(share * 100)}% ${yes})`);
  }
  return out;
}
function fpsByLevel(frames) {
  const out = [];
  for (let lv = 1; lv <= LEVELS; lv++) {
    const lo = (lv - 1) * LEVEL_SEC;
    const hi = lv * LEVEL_SEC;
    let n = 0;
    let wall = 0;
    for (let i = 1; i < frames.length; i++) {
      const [t, sec] = frames[i];
      const [t0, sec0] = frames[i - 1];
      if (sec > sec0 && sec0 >= lo && sec < hi) (n++, (wall += t - t0));
    }
    out.push(wall > 0 ? Math.round((n * 1000) / wall) : null);
  }
  return out;
}

async function toSelect(page, query) {
  const url = `${base}${query}`;
  await page.goto(url);
  // A cold dev server compiles on the first visit: allow it time.
  await page.waitFor(
    `/PLAY AS GUEST|CONTINUE AS|PICK A WORKOUT/.test(document.body.innerText)`,
    90000,
  );
  // Start as a new player every time (see levels-qa.mjs toSelect).
  await page.eval('localStorage.clear(), sessionStorage.clear(), true');
  await page.goto(url);
  await page.waitFor(`/PLAY AS GUEST/.test(document.body.innerText)`, 30000);
  await page.click('play as guest');
  await page.waitFor(`!!document.querySelector('input')`);
  await page.eval(`(() => { const i = document.querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'QA-real');
    i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await page.click('continue');
  await page.waitFor(`/PICK A WORKOUT/.test(document.body.innerText)`, 20000);
  await sleep(1500); // the app may switch to the camera once it finds one; let that settle
  await page.click('keyboard');
  await sleep(300);
}

async function startRound(page) {
  await page.eval(autopilot);
  await page.eval(`(async () => {
    let intro = 3;
    try { intro = (await import('/src/game/tuning.ts')).INTRO_SEC ?? 3; } catch { /* moved */ }
    window.__startAutopilot('perfect', intro);
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
const finished = async (page) => (await events(page)).find((e) => e.type === 'finished');

/** Waits until game time reaches `sec` or the round finishes; returns the game time. */
async function waitGame(page, sec, deadline) {
  for (;;) {
    const r = await page.eval(`new Promise((res) => {
      const g = window.__qaGame;
      const end = performance.now() + 5000;
      const f = () => {
        const s = g.getElapsedSec();
        if (s >= ${sec} || performance.now() > end || window.__qaEvents.some((e) => e.type === 'finished')) res(s);
        else requestAnimationFrame(f);
      };
      f();
    })`);
    if (r >= sec || (await finished(page)) || Date.now() > deadline) return r;
  }
}

async function shoot(page, name) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
  return name;
}

async function mainRun(page, w) {
  const fails = [];
  w.reset();
  await toSelect(page, QUERY);
  await startRound(page);
  const hooked = await page.eval(RENDER_HOOK).catch(() => false);
  await page.eval(FRAME_SAMPLER);
  const styles = await page
    .eval(
      `import('/src/game/backdrop.ts').then((m) => Array.from({ length: ${LEVELS} }, (_, i) => m.backdropFor(i + 1).style ?? 'neon'))`,
    )
    .catch(() => null);
  // Screenshots in game-time order: 15 s into each level, 0.5 s after each portal.
  const shots = [];
  for (let lv = 1; lv <= LEVELS; lv++) {
    shots.push({ lv, at: (lv - 1) * LEVEL_SEC + 15, name: `level-${lv}-mid.png` });
    if (lv > 1) shots.push({ lv, at: (lv - 1) * LEVEL_SEC + 0.5, name: `level-${lv}-portal.png` });
  }
  shots.sort((a, b) => a.at - b.at);
  const deadline = Date.now() + (ROUND_SEC + 90) * 1000;
  const taken = {};
  for (const s of shots) {
    const t = await waitGame(page, s.at, deadline);
    if (t < s.at) break; // finished early or stuck
    (taken[s.lv] ??= []).push(await shoot(page, s.name));
  }
  await waitGame(page, ROUND_SEC, deadline);
  for (let i = 0; i < 20 && !(await finished(page)); i++) await sleep(500);
  await sleep(2500); // the save and the coach card
  await page.eval('window.__stopAutopilot?.()');
  const ev = await events(page);
  const fin = ev.find((e) => e.type === 'finished');
  const lost = Array(LEVELS).fill(0);
  for (const e of ev.filter((x) => x.type === 'lifeLost'))
    lost[Math.min(LEVELS, Math.floor(e.sec / LEVEL_SEC) + 1) - 1]++;
  const frames = await page.eval('window.__qaFrames ?? []');
  const fps = fpsByLevel(frames);
  const screen = byLevel(frames, 2, 'real', 'neon');
  const runner = byLevel(frames, 3, 'human', 'robot');
  if (!hooked)
    fails.push("could not read what three.js renders (the app's three module not found)");
  styles?.forEach((st, i) => {
    if (st === 'real' && screen[i] !== 'real')
      fails.push(`level ${i + 1} is marked real but renders ${screen[i]} on screen`);
  });
  const clock = await page.eval('window.__e2eClock ?? "?"');
  if (fin?.reason !== 'complete')
    fails.push(
      `finished ${fin?.reason ?? 'never'} at ${fin?.sec?.toFixed(1) ?? '?'} s (want complete)`,
    );
  if (lost.some((n) => n))
    fails.push(
      `lost a life in a perfect run (at ${ev
        .filter((x) => x.type === 'lifeLost')
        .map((x) => x.sec.toFixed(1))
        .join(', ')} s)`,
    );
  const nShots = Object.values(taken).flat().length;
  if (nShots !== shots.length) fails.push(`${nShots} of ${shots.length} screenshots taken`);
  for (const x of w.exceptions) fails.push(`exception: ${firstLine(x)}`);
  for (const x of w.errors) fails.push(`console error: ${firstLine(x)}`);
  const rows = Array.from({ length: LEVELS }, (_, i) => ({
    level: i + 1,
    style: styles?.[i] ?? '?',
    screen: screen[i],
    runner: runner[i],
    fps: fps[i] ?? '-',
    lost: lost[i],
    shots: (taken[i + 1] ?? []).join(', ') || '-',
  }));
  return {
    fails,
    rows,
    note: `finished ${fin?.reason ?? 'never'} at ${fin?.sec?.toFixed(1) ?? '?'} s, autopilot clock ${clock}, console errors ${w.errors.length + w.exceptions.length}`,
  };
}

/** contact-sheet.png: the six mid-level screenshots in a 3x2 grid, labelled, drawn in Chrome. */
async function contactSheet(page, rows) {
  const tiles = rows.map((r) => {
    const f = join(OUT, `level-${r.level}-mid.png`);
    let src = '';
    try {
      src = `data:image/png;base64,${readFileSync(f).toString('base64')}`;
    } catch {
      /* not taken */
    }
    return { src, label: `Level ${r.level}: ${r.style}, on screen ${r.screen}, ${r.runner}` };
  });
  const url = await page.eval(`(async () => {
    const tiles = ${JSON.stringify(tiles)};
    const W = 640, H = 360, c = document.createElement('canvas');
    c.width = 3 * W; c.height = 2 * H;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < tiles.length; i++) {
      const x = (i % 3) * W, y = Math.floor(i / 3) * H;
      if (tiles[i].src) {
        const img = new Image();
        img.src = tiles[i].src;
        await img.decode();
        g.drawImage(img, x, y, W, H);
      }
      g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(x, y + H - 30, W, 30);
      g.fillStyle = '#ffe14d'; g.font = 'bold 18px sans-serif'; g.fillText(tiles[i].label, x + 8, y + H - 9);
    }
    return c.toDataURL('image/png');
  })()`);
  writeFileSync(join(OUT, 'contact-sheet.png'), Buffer.from(url.split(',')[1], 'base64'));
}

async function shortRun(page, w, label, query, block) {
  const fails = [];
  if (block) {
    await page.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.send('Network.setBlockedURLs', { urls: BLOCKED });
  }
  w.reset();
  try {
    await toSelect(page, QUERY + query);
    await startRound(page);
    const t = await waitGame(page, SHORT_SEC, Date.now() + (SHORT_SEC + 60) * 1000);
    await page.eval('window.__stopAutopilot?.()');
    const ev = await events(page);
    const lost = ev.filter((e) => e.type === 'lifeLost').length;
    const level = Math.max(1, ...ev.filter((e) => e.type === 'stage').map((e) => e.index ?? 1));
    if (t < SHORT_SEC) fails.push(`stopped at ${t.toFixed(1)} s game time (want ${SHORT_SEC})`);
    for (const x of w.exceptions) fails.push(`exception: ${firstLine(x)}`);
    if (block && lost) fails.push(`${lost} life lost`);
    if (block && !w.blocked) fails.push('no request was blocked');
    return {
      label,
      fails,
      note: `reached ${t.toFixed(1)} s, level ${level}, lives lost ${lost}, exceptions ${w.exceptions.length}, other console errors ${w.errors.length}${block ? `, ${w.blocked} requests blocked` : ''}`,
    };
  } finally {
    if (block) {
      await page.send('Network.setBlockedURLs', { urls: [] });
      await page.send('Network.setCacheDisabled', { cacheDisabled: false });
    }
  }
}

mkdirSync(OUT, { recursive: true });
const { base, stop } = await devServer();
const page = await launchChrome({ port: CDP_PORT, headless: args.includes('--headless') });
const w = watch(page);
await page.send('Network.enable');
await page.send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
  mobile: false,
});
let main;
const fallbacks = [];
try {
  try {
    main = await mainRun(page, w);
  } catch (e) {
    main = { fails: [`crashed: ${firstLine(e.message)}`], rows: [], note: '' };
  }
  for (const [label, query, block] of [
    ['gfx=low', '&gfx=low', false],
    ['assets blocked', '', true],
  ]) {
    try {
      fallbacks.push(await shortRun(page, w, label, query, block));
    } catch (e) {
      fallbacks.push({ label, fails: [`crashed: ${firstLine(e.message)}`], note: '' });
    }
  }
  await contactSheet(page, main.rows).catch((e) => console.log(`no contact sheet: ${e.message}`));
} finally {
  page.close();
  stop();
}

const pass = !main.fails.length && fallbacks.every((f) => !f.fails.length);
const lines = [
  `# real-qa ${new Date().toISOString()}`,
  '',
  `Main run (${QUERY}, perfect autopilot, ${ROUND_SEC} s, 1280x720): ${main.fails.length ? 'FAIL' : 'PASS'}. ${main.note}`,
  '',
  '| level | style (backdrop.ts) | on screen | runner | fps | lives lost | screenshot |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...main.rows.map(
    (r) =>
      `| ${r.level} | ${r.style} | ${r.screen} | ${r.runner} | ${r.fps} | ${r.lost} | ${r.shots} |`,
  ),
  ...main.fails.map((f) => `- ${f}`),
  '',
  `Fallback runs (first ${SHORT_SEC} s):`,
  '',
  ...fallbacks.flatMap((f) => [
    `- ${f.fails.length ? 'FAIL' : 'PASS'} ${f.label}: ${f.note}`,
    ...f.fails.map((x) => `  - ${x}`),
  ]),
  '',
  `Screenshots and contact-sheet.png (the six levels, 15 s in): ${OUT}`,
  '',
  pass ? 'PASS' : 'FAIL',
];
const text = lines.join('\n');
console.log(text);
writeFileSync(join(OUT, 'summary.md'), text + '\n');
process.exit(pass ? 0 : 1);
