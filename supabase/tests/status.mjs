// Sunday-morning status in one command, one screen. Node built-ins only.
//   node --env-file=.env.local supabase/tests/status.mjs [siteUrl] [--no-smoke]
// Runs live-headers.mjs (is the live site the latest main?) and smoke.mjs (sign-in, save, board,
// cap, /api/coach), prints the top 5 of the 45 s Full body board (the one on the landing page and
// the kiosk) and counts the QA- players still on any board. Overall PASS/FAIL on the first line.
// The smoke test adds one QA-smoke player (Shoulders treadmill board); --no-smoke skips it.
// QA- players without any round are not visible to the anon key (row-level security), so they are
// not counted here: the cleanup SQL in docs/LIVE.md lists them all.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const SITE = (args.find((a) => !a.startsWith('--')) ?? 'https://codejam-jet.vercel.app').replace(
  /\/$/,
  '',
);
const SB = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
const here = (f) => fileURLToPath(new URL(f, import.meta.url));

function run(script, extra = []) {
  try {
    const out = execFileSync(process.execPath, [here(script), SITE, ...extra], {
      encoding: 'utf8',
      timeout: 20_000,
      env: process.env,
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` || e.message };
  }
}
const indent = (s) =>
  s
    .trim()
    .split('\n')
    .map((l) => '    ' + l)
    .join('\n');

const sections = [];
const results = [];

const headers = run('./live-headers.mjs');
results.push(['latest main is live (cache headers)', headers.ok]);
sections.push(`Cache headers:\n${indent(headers.out)}`);

if (!args.includes('--no-smoke')) {
  const smoke = run('./smoke.mjs');
  results.push(['smoke test', smoke.ok]);
  sections.push(`Smoke test:\n${indent(smoke.out)}`);
}

let boardOk = false;
if (!SB || !KEY) {
  sections.push('Board: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
} else {
  try {
    const h = (t) => ({
      apikey: KEY,
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/json',
    });
    const signal = () => AbortSignal.timeout(8000);
    // A reader with no profile: it appears nowhere.
    const su = await (
      await fetch(`${SB}/auth/v1/signup`, {
        method: 'POST',
        headers: h(KEY),
        body: '{}',
        signal: signal(),
      })
    ).json();
    if (!su.access_token) throw new Error(`sign-in refused: ${JSON.stringify(su).slice(0, 120)}`);
    const get = async (q) => {
      const res = await fetch(`${SB}/rest/v1/leaderboard?${q}`, {
        headers: h(su.access_token),
        signal: signal(),
      });
      if (!res.ok) throw new Error(`leaderboard HTTP ${res.status}`);
      return res.json();
    };
    const top = await get(
      'select=display_name,score,created_at&workout=eq.fullBody&mode=eq.floor&duration_sec=eq.45&order=score.desc&limit=5',
    );
    const qa = await get(
      'select=display_name,workout,mode,duration_sec,score&display_name=ilike.QA-*',
    );
    const qaPlayers = new Set(qa.map((r) => r.display_name));
    const topQa = top.filter((r) => /^qa-/i.test(r.display_name)).length;
    boardOk = true;
    sections.push(
      `Full body · floor · 45 s, top 5 (landing page and kiosk):\n` +
        (top.length
          ? top
              .map(
                (r, i) =>
                  `    ${i + 1}. ${r.display_name.padEnd(22)} ${String(r.score).padStart(6)}   ${r.created_at.slice(0, 16).replace('T', ' ')}`,
              )
              .join('\n')
          : '    (empty)'),
    );
    sections.push(
      `QA- players on a board: ${qaPlayers.size} (${qa.length} board rows)` +
        (topQa ? `, ${topQa} of them in the top 5 above` : '') +
        (qaPlayers.size ? '\n    run the cleanup in docs/LIVE.md before the demo' : ''),
    );
    results.push(['no QA- player in the top 5', topQa === 0]);
  } catch (e) {
    sections.push(`Board: ${e.message}`);
  }
}
results.push(['board readable', boardOk]);

const pass = results.every(([, ok]) => ok);
console.log(`${pass ? 'PASS' : 'FAIL'}  status of ${SITE}  (${new Date().toLocaleString()})`);
for (const [name, ok] of results) console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}`);
console.log('');
console.log(sections.join('\n\n'));
process.exit(pass ? 0 : 1);
