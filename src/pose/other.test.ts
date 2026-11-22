// Someone else in the frame (session.ts: follow and otherPerson), on synthetic two-body frames
// built from recorded poses, and every recorded clip replayed through the session.
import { readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { MoveEvent } from '@/contracts';
import { L_SHOULDER, mid, type Point, R_SHOULDER } from './detect';
import { loadClip, toPoints } from './fixtures';
import { createSession, type Session } from './session';
import { FOLLOW_GAP_MS, OTHER_OFF_MS, OTHER_ON_MS, REFIND_STILL_MS } from './tuning';

const FRAME_MS = 33;
const standing = loadClip('near/standing');
const base = toPoints(standing.frames[100].pose!);
const W = Math.abs(base[L_SHOULDER].x - base[R_SHOULDER].x);
const centre = mid(base[L_SHOULDER], base[R_SHOULDER]);

/** The standing body moved sideways by dxW shoulder widths and scaled about its shoulders. */
const body = (dxW: number, scale = 1): Point[] =>
  base.map((p) => ({
    ...p,
    x: centre.x + dxW * W + (p.x - centre.x) * scale,
    y: centre.y + (p.y - centre.y) * scale,
  }));

/** A session calibrated on near/standing; returns it and the next frame time. */
function calibrated(): { s: Session; t: number } {
  const s = createSession();
  let t = 0;
  for (const f of standing.frames) {
    if (f.t > 2500) break;
    t = f.t;
    s.frame(f.pose ? [toPoints(f.pose)] : [], t);
  }
  expect(s.calibration).not.toBeNull();
  return { s, t: t + FRAME_MS };
}

interface Log {
  t: number;
  other: boolean;
  tracking: boolean;
  isPlayer: boolean;
}
/** Feeds the same bodies for `ms`; logs, per frame, the flags and whether body 0 was picked. */
function hold(s: Session, t0: number, ms: number, bodies: Point[][]): { log: Log[]; t: number } {
  const log: Log[] = [];
  let t = t0;
  for (; t < t0 + ms; t += FRAME_MS) {
    s.frame(bodies, t);
    const st = s.getState();
    log.push({
      t: t - t0,
      other: !!st.otherPerson,
      tracking: st.tracking,
      isPlayer: bodies.length > 0 && s.player === bodies[0],
    });
  }
  return { log, t };
}
const firstOn = (log: Log[], k: 'other' | 'tracking') => log.find((l) => l[k])?.t;

describe('someone else in the play area', () => {
  test.each([0.65, 0.9, 1.2])(
    'a %s× body beside the player pauses with otherPerson; the player is never switched',
    (scale) => {
      const { s, t } = calibrated();
      const player = body(0);
      const other = body(1.2, scale);
      const a = hold(s, t, 1000, [player, other]);
      const on = firstOn(a.log, 'other')!;
      expect(on).toBeGreaterThanOrEqual(OTHER_ON_MS);
      expect(on).toBeLessThanOrEqual(OTHER_ON_MS + 2 * FRAME_MS);
      expect(a.log.filter((l) => l.other).every((l) => !l.tracking)).toBe(true);
      expect(a.log.every((l) => l.isPlayer)).toBe(true);
      // The other body is listed first this time: still the player is followed.
      const b = hold(s, a.t, 500, [other, player]);
      expect(b.log.every((l) => !l.isPlayer && l.other)).toBe(true);
      expect(s.player).toBe(player);
      // The other person leaves: tracking comes back on its own.
      const c = hold(s, b.t, 1000, [player]);
      const off = c.log.find((l) => !l.other)!.t;
      expect(off).toBeGreaterThanOrEqual(OTHER_OFF_MS - FRAME_MS);
      expect(off).toBeLessThanOrEqual(OTHER_OFF_MS + 2 * FRAME_MS);
      expect(c.log.at(-1)).toMatchObject({ other: false, tracking: true, isPlayer: true });
    },
  );

  test.each([
    ['far behind, 0.5×, right behind the player', 0.3, 0.5],
    ['far behind, 0.55×, in the next lane', 1, 0.55],
    ['full size at the edge of the image', 2.5, 1],
    ['bigger, close to the camera, at the edge', 2.2, 1.4],
    ['the same body reported twice', 0.2, 1],
  ])('%s: no pause', (_name, dxW, scale) => {
    const { s, t } = calibrated();
    const player = body(0);
    const { log } = hold(s, t, 2000, [player, body(dxW, scale)]);
    expect(log.every((l) => !l.other && l.tracking && l.isPlayer)).toBe(true);
  });

  test('a passer-by crossing the whole frame at 0.8× pauses only while in the play area', () => {
    const { s, t: t0 } = calibrated();
    const player = body(0);
    const log: Log[] = [];
    // Shoulders cross from 4 W left to 4 W right of the player in 2.4 s (about 1.2 m/s at 1.5 m).
    for (let t = t0; t < t0 + 2400; t += FRAME_MS) {
      const walker = body(-4 + (8 * (t - t0)) / 2400, 0.8);
      s.frame([player, walker], t);
      const st = s.getState();
      log.push({
        t: t - t0,
        other: !!st.otherPerson,
        tracking: st.tracking,
        isPlayer: s.player === player,
      });
    }
    expect(log.every((l) => l.isPlayer)).toBe(true);
    const on = log.filter((l) => l.other).map((l) => l.t);
    // In the area (|x| <= 1.5 W) from 0.75 s to 1.65 s, plus the on and off delays.
    expect(on[0]).toBeGreaterThan(750);
    expect(on.at(-1)).toBeLessThan(1650 + OTHER_OFF_MS + FRAME_MS);
    expect(log.at(-1)).toMatchObject({ other: false, tracking: true });
  });

  test('no moves and no pause X reach the game while someone else is in the area', () => {
    const { s, t } = calibrated();
    const moves: MoveEvent[] = [];
    const xs: number[] = [];
    s.onMove((e) => moves.push(e));
    s.onGesture(() => xs.push(1));
    const a = hold(s, t, 600, [body(0), body(1.2, 0.9)]);
    expect(a.log.at(-1)!.other).toBe(true);
    // The player sidesteps a lane while the other person stands there: nothing is emitted.
    hold(s, a.t, 600, [body(1.0), body(2.3, 0.9)]);
    expect(moves).toEqual([]);
    expect(xs).toEqual([]);
  });
});

// From the camera session (Sat night): the player stood in a side lane; a newcomer walked in close
// to the camera, in front of them (only the newcomer reported for about 1.4 s), then stood on the
// mark at x1.2-1.3 the player's size while the player stayed where they were.
describe('someone walks in front of the player, then stands on the mark', () => {
  test('the player is found again where they stood; the newcomer is someone else, never followed', () => {
    const { s, t: t0 } = calibrated();
    let t1 = t0;
    for (let i = 1; i <= 16; i++, t1 += FRAME_MS) s.frame([body(-0.1 * i)], t1); // to a side lane
    const player = body(-1.6);
    const a = hold(s, t1, 600, [player]);
    expect(a.log.at(-1)).toMatchObject({ tracking: true, isPlayer: true });
    // The newcomer, close to the camera (x1.9), crosses in front: the player is not reported.
    const log: Log[] = [];
    let t = a.t;
    for (let i = 0; i < 42; i++, t += FRAME_MS) {
      const walker = body(-2.8 + i * 0.07, 1.95 - i * 0.004); // x1.95 to x1.8, as on camera
      s.frame([walker], t);
      log.push({
        t: t - a.t,
        other: !!s.getState().otherPerson,
        tracking: s.getState().tracking,
        isPlayer: false,
      });
      expect(s.player).not.toBe(walker);
    }
    // Paused from the moment the player is lost, never back on for a few frames (no 3-2-1 for
    // nothing), and someone else is named once the newcomer is in the play area.
    const lost = log.findIndex((l) => !l.tracking);
    expect(lost).toBeGreaterThan(0);
    expect(log.slice(lost).every((l) => !l.tracking)).toBe(true);
    const on = log.findIndex((l) => l.other);
    expect(on).toBeGreaterThanOrEqual(lost);
    expect(log.slice(on).every((l) => l.other)).toBe(true);
    // The newcomer stands on the mark at x1.25; the player is seen again where they were.
    const newcomer = body(0.1, 1.25);
    const b = hold(s, t, 2000, [newcomer, player]);
    expect(s.player).toBe(player);
    expect(b.log.every((l) => l.other && !l.tracking)).toBe(true);
    // The newcomer leaves: the player plays on.
    const c = hold(s, b.t, 1000, [player]);
    expect(c.log.at(-1)).toMatchObject({ other: false, tracking: true, isPlayer: true });
  });
});

describe('the player away, someone on the mark', () => {
  test.each([1.8, 2.2])('a %s× stranger on the mark is someone else, never the player', (scale) => {
    const { s, t } = calibrated();
    const away = hold(s, t, 1000, []);
    expect(away.log.at(-1)!.tracking).toBe(false);
    const stranger = body(0, scale);
    const a = hold(s, away.t, 2000, [stranger]);
    expect(a.log.some((l) => l.isPlayer)).toBe(false);
    expect(firstOn(a.log, 'other')).toBeLessThanOrEqual(OTHER_ON_MS + 2 * FRAME_MS);
    expect(a.log.every((l) => !l.tracking)).toBe(true);
    // The stranger leaves and the player comes back to the mark.
    const gone = hold(s, a.t, 600, []);
    expect(gone.log.at(-1)!.other).toBe(false);
    const player = body(0.1);
    const back = hold(s, gone.t, 1500, [player]);
    const found = back.log.find((l) => l.isPlayer)!.t;
    expect(found).toBeGreaterThanOrEqual(REFIND_STILL_MS);
    expect(back.log.at(-1)).toMatchObject({ other: false, tracking: true, isPlayer: true });
  });

  test.each([
    ['a step closer', 1.5],
    ['a step further', 0.7],
    ['half a step closer', 1.25],
  ])('the player coming back %s (%s×), alone, is taken back, never flagged', (_n, scale) => {
    const { s, t } = calibrated();
    const away = hold(s, t, 1000, []);
    const player = body(0.2, scale);
    const back = hold(s, away.t, 1500, [player]);
    expect(back.log.find((l) => l.isPlayer)!.t).toBeGreaterThanOrEqual(REFIND_STILL_MS);
    expect(back.log.some((l) => l.other)).toBe(false);
    expect(back.log.at(-1)).toMatchObject({ other: false, tracking: true, isPlayer: true });
    // ... and followed from there: a sidestep a moment later stays the player.
    let now = back.t;
    for (let i = 1; i <= 9; i++, now += FRAME_MS) {
      const p = body(0.2 + 0.1 * i * scale, scale); // 0.9 of their own W in 0.3 s
      s.frame([p], now);
      expect(s.player).toBe(p);
    }
  });

  test('a body a step closer is not taken back while someone else stands in the play area', () => {
    const { s, t } = calibrated();
    const away = hold(s, t, 1000, []);
    const { log } = hold(s, away.t, 2000, [body(0, 1.5), body(1.2, 0.9)]);
    expect(log.some((l) => l.isPlayer)).toBe(false);
    expect(log.at(-1)).toMatchObject({ other: true, tracking: false });
  });

  test('the player walking back to the mark is not flagged as someone else', () => {
    const { s, t } = calibrated();
    const away = hold(s, t, 1000, []);
    const log: Log[] = [];
    let now = away.t;
    for (let i = 0; i <= 30; i++, now += FRAME_MS) {
      const p = body(3 - i * 0.1); // walks in from 3 W to the mark in 1 s
      s.frame([p], now);
      log.push({
        t: i,
        other: !!s.getState().otherPerson,
        tracking: false,
        isPlayer: s.player === p,
      });
    }
    const still = hold(s, now, 1200, [body(0)]);
    expect([...log, ...still.log].some((l) => l.other)).toBe(false);
    expect(still.log.at(-1)).toMatchObject({ tracking: true, isPlayer: true });
  });

  test.fails(
    'known limit: a stranger alone on the mark, x0.6-1.67 the player, is taken as the player',
    () => {
      const { s, t } = calibrated();
      const away = hold(s, t, 1000, []);
      const { log } = hold(s, away.t, 2000, [body(0, 1.05)]);
      expect(log.some((l) => l.isPlayer)).toBe(false);
    },
  );
});

// Every recorded clip, one body per frame, through the session: once calibrated, the follower
// must never drop the player (a dropped frame for a fast move would be a lost move or a pause).
const clips = [
  ...readdirSync('src/pose/fixtures')
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5)),
  ...['greg', 'near'].flatMap((d) =>
    readdirSync(`src/pose/fixtures/${d}`).map((f) => `${d}/${f.slice(0, -5)}`),
  ),
].filter((n) => !n.endsWith('leaveFrame'));
const standingFor = (n: string) => (n.includes('/') ? `${n.split('/')[0]}/standing` : 'standing');

function replayInSession(name: string, everyNth: number, extra?: (p: Point[]) => Point[][]) {
  const s = createSession();
  let t = 0;
  for (const f of loadClip(standingFor(name)).frames) {
    if (f.t > 2500) break;
    t = f.t;
    s.frame(f.pose ? [toPoints(f.pose)] : [], t);
  }
  expect(s.calibration).not.toBeNull();
  const t0 = t + 1000; // a gap: the player is found again on the mark, as after walking off
  const events: string[] = [];
  s.onMove((e) => events.push(e.type));
  // A drop counts while the player stays in view. After walking out of the frame (greg/mixed at
  // 5.5 s) they are taken back only standing still near the mark (REFIND_*), by design.
  let found = false;
  let lastPick = -Infinity;
  let dropped = 0;
  for (const [n, f] of loadClip(name).frames.entries()) {
    if (n % everyNth) continue;
    const pose = f.pose ? toPoints(f.pose) : null;
    s.frame(pose ? [pose, ...(extra?.(pose) ?? [])] : [], t0 + f.t);
    if (pose && s.player === pose) {
      found = true;
      lastPick = f.t;
    } else if (pose && found && f.t - lastPick <= FOLLOW_GAP_MS) dropped++;
  }
  return { found, dropped, events, other: s.otherPerson };
}

describe('every recorded clip through the session', () => {
  for (const nth of [1, 2, 3]) {
    test.each(clips)(`%s at 1/${nth} of the frames: the player is never dropped`, (name) => {
      const r = replayInSession(name, nth);
      expect(r.found).toBe(true);
      expect(r.dropped).toBe(0);
    });
  }
  test.each(clips)(
    '%s with a small spectator behind and a big one at the edge: same moves',
    (name) => {
      const alone = replayInSession(name, 1);
      // Two people standing still, placed from the clip's first pose (the player's start spot).
      const p = toPoints(loadClip(name).frames.find((f) => f.pose)!.pose!);
      const c = mid(p[L_SHOULDER], p[R_SHOULDER]);
      const w = Math.abs(p[L_SHOULDER].x - p[R_SHOULDER].x);
      const at = (dx: number, k: number) =>
        p.map((q) => ({ ...q, x: c.x + dx * w + (q.x - c.x) * k, y: c.y + (q.y - c.y) * k }));
      const people = [at(0.4, 0.45), at(2.8, 1.2)];
      const crowd = replayInSession(name, 1, () => people);
      expect(crowd.events).toEqual(alone.events);
      expect(crowd.dropped).toBe(0);
    },
  );
});
