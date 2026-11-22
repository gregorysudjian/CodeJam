// Sunday-morning smoke test of the live stack, after the final deploy. Node built-ins only.
//   node --env-file=.env.local supabase/tests/smoke.mjs [siteUrl]
// Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (public values). Signs in a QA-smoke-<time>
// guest, saves one valid 45 s round (Shoulders, treadmill, 100 points: low on the least-watched
// board), reads the 45 s board and checks the round is on it. Also checks the site and /api/coach
// answer. Prints PASS or FAIL per step and overall in under 10 s; exit code 0 or 1.
// The guest is removed by the Sunday cleanup (docs/LIVE.md), like every QA- player.
import { randomUUID } from 'node:crypto';

const SB = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SITE = (process.argv[2] ?? 'https://codejam-jet.vercel.app').replace(/\/$/, '');
const BUDGET_MS = 10_000;
if (!SB || !KEY) {
  console.log(
    'FAIL  set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (node --env-file=.env.local)',
  );
  process.exit(1);
}

const t0 = Date.now();
const left = () => Math.max(1, BUDGET_MS - (Date.now() - t0));
let failed = false;

async function step(name, fn) {
  const t = Date.now();
  try {
    const detail = await fn();
    console.log(`PASS  ${name} (${Date.now() - t} ms)${detail ? ': ' + detail : ''}`);
    return true;
  } catch (e) {
    failed = true;
    console.log(`FAIL  ${name} (${Date.now() - t} ms): ${e.message}`);
    return false;
  }
}
async function call(url, { method = 'GET', token = KEY, body, prefer } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(left()),
  });
  const text = await res.text();
  let json = text;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, json };
}
function expectStatus(r, want) {
  if (r.status !== want)
    throw new Error(`HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
}

// Down to the second: two runs in the same minute must not share a name (19 chars, under the 20 cap).
const name = `QA-smoke-${new Date().toISOString().slice(5, 19).replace(/[-:T]/g, '')}`;
let token;
let uid;
const sessionId = randomUUID();

await step('site answers', async () => {
  const res = await fetch(SITE + '/', { signal: AbortSignal.timeout(left()) });
  const html = await res.text();
  if (res.status !== 200 || !/\/assets\/index-[^"]+\.js/.test(html))
    throw new Error(`HTTP ${res.status}`);
  return html.match(/\/assets\/index-[^"]+\.js/)[0];
});

const signedIn = await step('guest sign-in', async () => {
  const r = await call(SB + '/auth/v1/signup', { method: 'POST', body: {} });
  expectStatus(r, 200);
  token = r.json.access_token;
  uid = r.json.user.id;
  const p = await call(SB + '/rest/v1/profiles', {
    method: 'POST',
    token,
    body: { id: uid, display_name: name },
  });
  expectStatus(p, 201);
  return name;
});

if (signedIn) {
  const saved = await step('save a 45 s round', async () => {
    const r = await call(SB + '/rest/v1/sessions?on_conflict=id', {
      method: 'POST',
      token,
      prefer: 'resolution=ignore-duplicates',
      body: [
        {
          id: sessionId,
          user_id: uid,
          workout: 'shoulders',
          mode: 'treadmill',
          duration_sec: 45,
          active_sec: 45,
          difficulty: 0.5,
          seed: 1,
          score: 100,
          best_streak: 1,
          cleared: 1,
          hit: 0,
          accuracy: 1,
          kcal: 5,
          reps: { sidestep: 0, jump: 0, squat: 0, armsUp: 1, reachLeft: 0, reachRight: 0 },
          missed: { sidestep: 0, jump: 0, squat: 0, armsUp: 0, reachLeft: 0, reachRight: 0 },
          created_at: new Date().toISOString(),
        },
      ],
    });
    expectStatus(r, 201);
  });

  await step('read the 45 s board', async () => {
    const top = await call(
      SB +
        '/rest/v1/leaderboard?select=*&workout=eq.shoulders&mode=eq.treadmill&duration_sec=eq.45&order=score.desc&limit=10',
      { token },
    );
    expectStatus(top, 200);
    if (!saved) return `${top.json.length} rows`;
    const mine = await call(
      SB +
        `/rest/v1/leaderboard?select=*&workout=eq.shoulders&mode=eq.treadmill&duration_sec=eq.45&display_name=eq.${encodeURIComponent(name)}`,
      { token },
    );
    expectStatus(mine, 200);
    if (mine.json.length !== 1 || mine.json[0].score !== 100)
      throw new Error(`round not on the board: ${JSON.stringify(mine.json)}`);
    return `${top.json.length} rows in the top 10; ${name} is on it with 100`;
  });

  await step('impossible score refused (migration 0004)', async () => {
    const r = await call(SB + '/rest/v1/sessions', {
      method: 'POST',
      token,
      body: {
        user_id: uid,
        workout: 'shoulders',
        mode: 'treadmill',
        duration_sec: 45,
        active_sec: 45,
        score: 999999,
        reps: {},
        missed: {},
      },
    });
    if (r.status === 201) throw new Error('a score of 999,999 was accepted');
    return `HTTP ${r.status}`;
  });
}

await step('/api/coach answers (401 without a token)', async () => {
  const res = await fetch(SITE + '/api/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
    signal: AbortSignal.timeout(left()),
  });
  if (res.status !== 401) throw new Error(`HTTP ${res.status}`);
});

const ms = Date.now() - t0;
if (ms > BUDGET_MS) failed = true;
console.log(`${failed ? 'FAIL' : 'PASS'}  smoke test, ${ms} ms`);
process.exit(failed ? 1 : 0);
