// Applies supabase/migrations/0001..N to an in-memory Postgres (PGlite) that mimics Supabase's
// auth schema, roles and default privileges, then runs the same probes as live-probes.mjs: legit
// traffic must pass, cheats must be refused. No database or network needed.
//   npm i --no-save @electric-sql/pglite    (not a project dependency)
//   node supabase/tests/rls-harness.mjs 4   (apply up to 0004; with 3, the cheats get through)
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const last = Number(process.argv[2] ?? 99);
const db = new PGlite();

const SUPABASE_LIKE = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Supabase's default privileges in schema public
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`;
await db.exec(SUPABASE_LIKE);

const dir = join(repo, 'supabase', 'migrations');
const migrations = readdirSync(dir).sort();
for (const f of migrations) {
  if (Number(f.slice(0, 4)) > last) continue;
  await db.exec(readFileSync(join(dir, f), 'utf8'));
  console.log('applied', f);
}

/** One PostgREST-like request: a transaction as `role`, with the user's id as the JWT sub. */
async function as(role, uid, sql, params = []) {
  try {
    return await db.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      if (uid) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      const r = await tx.query(sql, params);
      return { ok: true, rows: r.rows, affected: r.affectedRows };
    });
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

const A = randomUUID();
const B = randomUUID();
for (const [u, n] of [
  [A, 'QA-A'],
  [B, 'QA-B'],
]) {
  await db.query('insert into auth.users (id) values ($1)', [u]);
  const r = await as(
    'authenticated',
    u,
    'insert into public.profiles (id, display_name) values ($1, $2)',
    [u, n],
  );
  if (!r.ok) throw new Error(r.err);
}

const cols =
  'id, user_id, workout, mode, duration_sec, active_sec, difficulty, seed, score, best_streak, cleared, hit, accuracy, kcal, reps, missed, created_at';
function ins(uid, over = {}, conflict = '') {
  const r = {
    id: randomUUID(),
    user_id: uid,
    workout: 'fullBody',
    mode: 'floor',
    duration_sec: 45,
    active_sec: 45,
    difficulty: 0.5,
    seed: 1,
    score: 4750,
    best_streak: 30,
    cleared: 25,
    hit: 0,
    accuracy: 1,
    kcal: 5,
    reps: { sidestep: 1, jump: 1, squat: 1, armsUp: 1, reachLeft: 1, reachRight: 1 },
    missed: { sidestep: 0, jump: 0, squat: 0, armsUp: 0, reachLeft: 0, reachRight: 0 },
    created_at: new Date().toISOString(),
    ...over,
  };
  const vals = cols
    .split(', ')
    .map((c) => (typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c]));
  return [
    `insert into public.sessions (${cols}) values (${vals.map((_, i) => '$' + (i + 1)).join(', ')}) ${conflict}`,
    vals,
    r,
  ];
}

const results = [];
function expect(name, r, want) {
  const got = r.ok ? 'ok' : 'denied';
  const pass = got === want;
  results.push(pass);
  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${name}: ${got}${r.ok ? '' : ' (' + r.err.slice(0, 90) + ')'}`,
  );
}

// Legitimate traffic: must keep working.
let q = ins(A);
expect('legit 45 s session', await as('authenticated', A, q[0], q[1]), 'ok');
expect(
  'same id again, ON CONFLICT DO NOTHING (queue retry)',
  await as('authenticated', A, q[0] + ' on conflict (id) do nothing', q[1]),
  'ok',
);
q = ins(A, { score: 8250 });
expect('best perfect 45 s (8,250)', await as('authenticated', A, q[0], q[1]), 'ok');
q = ins(A, { duration_sec: 180, active_sec: 180, score: 40400 });
expect('best perfect 180 s (40,400)', await as('authenticated', A, q[0], q[1]), 'ok');
q = ins(A, { created_at: new Date(Date.now() - 86400e3).toISOString() });
expect('queued session from yesterday', await as('authenticated', A, q[0], q[1]), 'ok');
q = ins(A, { score: 0, accuracy: 0, cleared: 0, reps: {}, missed: {} });
expect('empty round, {} reps', await as('authenticated', A, q[0], q[1]), 'ok');
expect(
  'update own profile name/goal/weight',
  await as(
    'authenticated',
    A,
    `update public.profiles set display_name='QA-A2', goal='cardio', weight_kg=70, weekly_goal_min=90, level='athlete' where id=$1 returning *`,
    [A],
  ),
  'ok',
);
const lb = await as('authenticated', B, 'select * from public.leaderboard');
expect('B reads leaderboard', lb, 'ok');
console.log(
  '     leaderboard rows seen by B:',
  lb.rows?.length,
  lb.rows?.map((r) => `${r.display_name}:${r.score}/${r.duration_sec}`).join(' '),
);
expect('B reads own sessions', await as('authenticated', B, 'select * from public.sessions'), 'ok');

// Cheats: must be refused.
q = ins(A, { duration_sec: 600, active_sec: 600, score: 999999 });
expect('score 999,999 in 600 s', await as('authenticated', A, q[0], q[1]), 'denied');
q = ins(A, { score: 13501 });
expect('score 13,501 in 45 s (cap 13,500)', await as('authenticated', A, q[0], q[1]), 'denied');
q = ins(A, { duration_sec: 11, active_sec: 11, score: 99999 });
expect('score 99,999 in 11 s', await as('authenticated', A, q[0], q[1]), 'denied');
const big = {};
for (let i = 0; i < 20000; i++) big['k' + i] = i;
q = ins(A, { reps: big });
expect('300 KB reps', await as('authenticated', A, q[0], q[1]), 'denied');
q = ins(A, { missed: [1, 2, 3] });
expect('missed as an array', await as('authenticated', A, q[0], q[1]), 'denied');
q = ins(A, { created_at: '2099-01-01T00:00:00Z' });
await as('authenticated', A, q[0], q[1]);
const fut = await as('authenticated', A, 'select created_at from public.sessions where id=$1', [
  q[2].id,
]);
const year = fut.rows?.[0] && new Date(fut.rows[0].created_at).getUTCFullYear();
results.push(year !== 2099);
console.log(`${year !== 2099 ? 'PASS' : 'FAIL'} created_at 2099 stored as year ${year}`);
expect(
  'update own session',
  await as('authenticated', A, 'update public.sessions set score=1 where user_id=$1', [A]),
  'denied',
);
expect(
  'delete own session',
  await as('authenticated', A, 'delete from public.sessions where user_id=$1', [A]),
  'denied',
);
expect('truncate sessions', await as('authenticated', A, 'truncate public.sessions'), 'denied');
expect(
  'delete own profile',
  await as('authenticated', A, 'delete from public.profiles where id=$1', [A]),
  'denied',
);
expect(
  'update own profile created_at',
  await as('authenticated', A, `update public.profiles set created_at='2000-01-01' where id=$1`, [
    A,
  ]),
  'denied',
);
q = ins(A);
expect('B inserts a session as A', await as('authenticated', B, q[0], q[1]), 'denied');
const other = await as('authenticated', B, 'select * from public.sessions where user_id=$1', [A]);
results.push(other.ok && other.rows.length === 0);
console.log(
  `${other.ok && other.rows.length === 0 ? 'PASS' : 'FAIL'} B sees none of A's sessions (${other.rows?.length})`,
);
expect(
  'anon reads leaderboard',
  await as('anon', null, 'select * from public.leaderboard'),
  'denied',
);
expect('anon reads sessions', await as('anon', null, 'select * from public.sessions'), 'denied');
expect(
  'authenticated calls the trigger fn',
  await as('authenticated', A, 'select public.sessions_clamp_created_at()'),
  'denied',
);
if (last >= 6) {
  // 0006: age and height, editable by their owner only, within range, never on the board.
  const upd = (uid, set, id = uid) =>
    as('authenticated', uid, `update public.profiles set ${set} where id=$1`, [id]);
  const own = await upd(A, 'age=34, height_cm=171.5');
  expect('update own age and height', own, 'ok');
  expect('clear own age and height', await upd(A, 'age=null, height_cm=null'), 'ok');
  expect('age 9 refused', await upd(A, 'age=9'), 'denied');
  expect('height 300 refused', await upd(A, 'height_cm=300'), 'denied');
  const cross = await upd(B, 'age=50', A);
  const untouched = cross.ok && cross.affected === 0;
  results.push(untouched);
  console.log(`${untouched ? 'PASS' : 'FAIL'} B cannot set A's age (rows ${cross.affected})`);
  const boardCols = (
    await db.query(
      `select column_name from information_schema.columns where table_name='leaderboard'`,
    )
  ).rows.map((r) => r.column_name);
  const hidden = !boardCols.some((c) => c === 'age' || c === 'height_cm');
  results.push(hidden);
  console.log(`${hidden ? 'PASS' : 'FAIL'} leaderboard columns ${boardCols.join(', ')}`);
}
if (last >= 7) {
  // 0007: unique usernames, friends by username (one-way), only through the functions.
  const check = (name, ok) => {
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  };
  const rpc = (uid, sql, params = []) => as(uid ? 'authenticated' : 'anon', uid, sql, params);
  // Earlier probes rename players: start from known names.
  await db.query(`update public.profiles set display_name='QA-A' where id=$1`, [A]);
  await db.query(`update public.profiles set display_name='QA-B' where id=$1`, [B]);
  expect(
    "B takes A's name in another case",
    await as('authenticated', B, `update public.profiles set display_name='qa-a' where id=$1`, [B]),
    'denied',
  );
  const t1 = await rpc(A, `select public.username_taken('  qa-b ') as t`);
  const t2 = await rpc(A, `select public.username_taken('Nobody') as t`);
  check(
    'username_taken: QA-B yes, Nobody no',
    t1.rows?.[0]?.t === true && t2.rows?.[0]?.t === false,
  );
  expect(
    'anon calls username_taken (0008: the sign-up form asks before sign-in)',
    await rpc(null, `select public.username_taken('x')`),
    last >= 8 ? 'ok' : 'denied',
  );
  const add = async (uid, name) =>
    (await rpc(uid, `select * from public.add_friend($1)`, [name])).rows?.[0]?.status;
  check('A adds qa-b: ok', (await add(A, 'qa-b')) === 'ok');
  check('A adds QA-B again: already', (await add(A, 'QA-B')) === 'already');
  check('A adds itself: self', (await add(A, 'QA-A')) === 'self');
  check('A adds Nobody: notFound', (await add(A, 'Nobody')) === 'notFound');
  expect(
    'anon calls add_friend',
    await rpc(null, `select * from public.add_friend('QA-A')`),
    'denied',
  );
  expect(
    'A reads friends directly',
    await as('authenticated', A, 'select * from public.friends'),
    'denied',
  );
  expect(
    'A inserts a friend row directly',
    await as('authenticated', A, 'insert into public.friends values ($1, $2)', [A, B]),
    'denied',
  );
  const lf = await rpc(A, 'select * from public.list_friends()');
  check(
    `list_friends for A: ${JSON.stringify(lf.rows)}`,
    lf.rows?.length === 1 && lf.rows[0].display_name === 'QA-B',
  );
  q = ins(B, { score: 100 });
  expect('B saves a 45 s round', await as('authenticated', B, q[0], q[1]), 'ok');
  const board = async (uid) =>
    (await rpc(uid, `select * from public.friends_board('fullBody', 'floor', 45, 10)`)).rows ?? [];
  const ab = await board(A);
  check(
    `A's friends board has A (me) then B: ${ab.map((r) => `${r.display_name}:${r.score}:${r.is_me}`).join(', ')}`,
    ab.length === 2 &&
      ab[0].is_me === true &&
      ab[1].display_name === 'QA-B' &&
      ab[0].score >= ab[1].score,
  );
  const bb = await board(B);
  check(
    `B's board has only B (one-way): ${bb.map((r) => r.display_name).join(', ')}`,
    bb.length === 1 && bb[0].is_me === true,
  );

  // The rename of existing duplicates, on a fresh database: older keeps the name.
  const d2 = new PGlite();
  await d2.exec(SUPABASE_LIKE);
  for (const f of migrations)
    if (Number(f.slice(0, 4)) <= 6) await d2.exec(readFileSync(join(dir, f), 'utf8'));
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  for (const [i, n] of [
    ['Alex', 0],
    ['alex', 1],
    ['Sam', 2],
  ].map(([n, i]) => [i, n])) {
    await d2.query('insert into auth.users (id) values ($1)', [ids[i]]);
    await d2.query(
      `insert into public.profiles (id, display_name, created_at) values ($1, $2, now() + ($3 || ' seconds')::interval)`,
      [ids[i], n, String(i)],
    );
  }
  await d2.exec(
    readFileSync(
      join(
        dir,
        migrations.find((f) => f.startsWith('0007')),
      ),
      'utf8',
    ),
  );
  const names = (
    await d2.query('select display_name from public.profiles order by created_at')
  ).rows.map((r) => r.display_name);
  check(
    `duplicates renamed, oldest kept: ${names.join(', ')}`,
    names[0] === 'Alex' && names[1] === `alex-${ids[1].slice(0, 6)}` && names[2] === 'Sam',
  );
}
const viewOpts = await db.query(`select reloptions from pg_class where relname='leaderboard'`);
const plain = !JSON.stringify(viewOpts.rows[0].reloptions ?? '').includes('security_invoker');
results.push(plain);
console.log(`${plain ? 'PASS' : 'FAIL'} leaderboard has no security_invoker`);

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} as expected`);
process.exit(failed ? 1 : 0);
