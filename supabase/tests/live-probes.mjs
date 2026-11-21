// What a visitor can do with the public anon key plus their own guest token, through the REST
// API (docs/LIVE.md). Run against the real project after applying a migration:
//   node --env-file=.env.local supabase/tests/live-probes.mjs <tag>
// It reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (public values; nothing secret).
// Creates two guests named QA-<tag>-A and QA-<tag>-B, so Sunday's cleanup finds them.
// It never deletes (the DELETE probes target ids that do not exist) and only writes scores to
// boards the UI never shows (600 s and 11 s rounds), so no visible board is defaced.
// "HOLE" lines are writes or reads that should have been refused.
import { randomUUID } from 'node:crypto';

const URL_ = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
const tag = process.argv[2] ?? 'probe';

async function req(method, path, { token, body, prefer, headers } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token ?? KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}
const short = (j) => JSON.stringify(j).slice(0, 220);
function log(name, r, verdict) {
  console.log(`${verdict.padEnd(6)} ${name}: ${r.status} ${short(r.json)}`);
}

async function guest(name) {
  const r = await req('POST', '/auth/v1/signup', { body: {} });
  if (r.status !== 200) throw new Error('signup ' + r.status + ' ' + short(r.json));
  const token = r.json.access_token;
  const uid = r.json.user.id;
  const p = await req('POST', '/rest/v1/profiles', {
    token,
    body: { id: uid, display_name: name },
    prefer: 'return=representation',
  });
  console.log(`guest ${name}: profile ${p.status}`);
  return { token, uid };
}

function row(uid, over = {}) {
  return {
    id: randomUUID(),
    user_id: uid,
    workout: 'legs',
    mode: 'floor',
    duration_sec: 600,
    active_sec: 600,
    difficulty: 0.5,
    seed: 1,
    score: 100,
    best_streak: 1,
    cleared: 1,
    hit: 0,
    accuracy: 1,
    kcal: 1,
    reps: {},
    missed: {},
    ...over,
  };
}

const A = await guest(`QA-${tag}-A`);
const B = await guest(`QA-${tag}-B`);

// 1. Absurd score
const s1 = row(A.uid, { score: 999999 });
let r = await req('POST', '/rest/v1/sessions', { token: A.token, body: s1 });
log('insert score 999999 (600 s board)', r, r.status === 201 ? 'HOLE' : 'ok');

// 2. Score impossible for the round length
r = await req('POST', '/rest/v1/sessions', {
  token: A.token,
  body: row(A.uid, { duration_sec: 11, active_sec: 11, score: 99999 }),
});
log('insert 99,999 in an 11 s round', r, r.status === 201 ? 'HOLE' : 'ok');

// 3. Huge jsonb
const big = {};
for (let i = 0; i < 20000; i++) big['k' + i] = i;
r = await req('POST', '/rest/v1/sessions', { token: A.token, body: row(A.uid, { reps: big }) });
log('insert ~300 KB reps jsonb', r, r.status === 201 ? 'HOLE' : 'ok');

// 4. created_at in the future (wins nothing, but shows a bogus date)
const future = row(A.uid, { created_at: '2099-01-01T00:00:00Z' });
r = await req('POST', '/rest/v1/sessions', { token: A.token, body: future });
// 0004 clamps a future date to now() instead of refusing it: read back what was stored.
const stored = await req('GET', `/rest/v1/sessions?select=created_at&id=eq.${future.id}`, {
  token: A.token,
});
const year = stored.json?.[0]?.created_at?.slice(0, 4);
log(`insert created_at 2099 (stored year ${year})`, r, year === '2099' ? 'HOLE' : 'ok');

// 5. Read other players' rows
r = await req('GET', `/rest/v1/sessions?select=id,user_id,score&user_id=eq.${A.uid}`, {
  token: B.token,
});
log("B reads A's sessions", r, Array.isArray(r.json) && r.json.length ? 'HOLE' : 'ok');
r = await req('GET', '/rest/v1/sessions?select=id,user_id&limit=5', { token: B.token });
log('B reads all sessions', r, Array.isArray(r.json) && r.json.length ? 'HOLE' : 'ok');
r = await req('GET', '/rest/v1/profiles?select=id,display_name,weight_kg&limit=5', {
  token: B.token,
});
log('B reads all profiles', r, Array.isArray(r.json) && r.json.length > 1 ? 'HOLE' : 'ok');

// 6. Update / delete
r = await req('PATCH', `/rest/v1/sessions?id=eq.${s1.id}`, {
  token: A.token,
  body: { score: 5 },
  prefer: 'return=representation',
});
log('A updates own session', r, Array.isArray(r.json) && r.json.length ? 'HOLE' : 'ok');
// Deletes target a nonexistent id: never delete rows. 403 = no grant; 200 [] = grant, RLS filters.
r = await req('DELETE', `/rest/v1/sessions?id=eq.${randomUUID()}`, {
  token: A.token,
  prefer: 'return=representation',
});
log('A DELETE sessions (grant check)', r, r.status === 200 ? 'grant' : 'ok');
r = await req('PATCH', `/rest/v1/sessions?id=eq.${s1.id}`, {
  token: B.token,
  body: { score: 5 },
  prefer: 'return=representation',
});
log("B updates A's session", r, Array.isArray(r.json) && r.json.length ? 'HOLE' : 'ok');
r = await req('PATCH', `/rest/v1/profiles?id=eq.${A.uid}`, {
  token: B.token,
  body: { display_name: 'QA-hijack' },
  prefer: 'return=representation',
});
log("B renames A's profile", r, Array.isArray(r.json) && r.json.length ? 'HOLE' : 'ok');
r = await req('DELETE', `/rest/v1/profiles?id=eq.${randomUUID()}`, {
  token: B.token,
  prefer: 'return=representation',
});
log('B DELETE profiles (grant check)', r, r.status === 200 ? 'grant' : 'ok');

// 7. Write as someone else
r = await req('POST', '/rest/v1/sessions', { token: B.token, body: row(A.uid) });
log('B inserts a session as A', r, r.status === 201 ? 'HOLE' : 'ok');
r = await req('POST', '/rest/v1/profiles', {
  token: B.token,
  body: { id: randomUUID(), display_name: 'QA-other' },
});
log('B inserts a profile for another id', r, r.status === 201 ? 'HOLE' : 'ok');

// 8. Same display name as another player
r = await req('PATCH', `/rest/v1/profiles?id=eq.${B.uid}`, {
  token: B.token,
  body: { display_name: `QA-${tag}-A` },
  prefer: 'return=representation',
});
log("B takes A's display name", r, Array.isArray(r.json) && r.json.length ? 'HOLE' : 'ok');

// 9. Leaderboard: signed-in reads the cheat; anon without user token
r = await req('GET', '/rest/v1/leaderboard?select=*&duration_sec=eq.600&order=score.desc&limit=3', {
  token: B.token,
});
log('B reads 600 s board', r, 'info');
r = await req('GET', '/rest/v1/leaderboard?select=*&limit=1');
log('anon key alone reads board', r, r.status === 200 ? 'HOLE' : 'ok');
r = await req('GET', '/rest/v1/sessions?select=id&limit=1');
log('anon key alone reads sessions', r, r.status === 200 && r.json.length ? 'HOLE' : 'ok');
r = await req('PATCH', `/rest/v1/leaderboard?display_name=eq.QA-${tag}-A`, {
  token: A.token,
  body: { score: 1 },
});
log('A updates the view', r, r.status < 300 ? 'HOLE' : 'ok');
r = await req('POST', '/rest/v1/rpc/claim_coach_slot', {
  token: KEY,
  body: { p_min_interval_seconds: 10 },
});
log('anon calls claim_coach_slot', r, r.status === 200 && r.json === true ? 'HOLE' : 'ok');
r = await req('GET', '/rest/v1/coach_calls?select=*', { token: A.token });
log('A reads coach_calls', r, r.status === 200 && r.json.length ? 'HOLE' : 'ok');

// 10. Batch with one bad row: does the whole upsert fail? (offline queue poisoning)
r = await req('POST', '/rest/v1/sessions?on_conflict=id', {
  token: A.token,
  body: [row(A.uid), row(A.uid, { accuracy: 2 })],
  prefer: 'resolution=ignore-duplicates',
});
log('batch upsert, one invalid row', r, 'info');

console.log('A uid', A.uid.slice(0, 8), 'B uid', B.uid.slice(0, 8));
