import { describe, expect, test } from 'vitest';
import { createSession } from './session';
import type { MoveType } from '@/contracts';
import { createDetector, type Point } from './detect';
import { calibrateFromClip, loadClip, rng, scaleAbout, toPoints } from './fixtures';
import { createGestureDetector } from './gesture';

type Transform = (body: Point[], frame: number) => Point[];
interface Variant {
  name: string;
  transform?: Transform;
  fps?: number;
  mirror?: boolean;
}
type Event = { type: MoveType | 'pause'; frame: number; t: number };
const inView = (p: Point) =>
  p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 ? { ...p, visibility: 0 } : p;
const roll =
  (deg: number): Transform =>
  (body) => {
    const a = (deg * Math.PI) / 180;
    return body.map((p) => {
      const x = (p.x - 0.5) * 640,
        y = (p.y - 0.5) * 480;
      return inView({
        ...p,
        x: 0.5 + (Math.cos(a) * x - Math.sin(a) * y) / 640,
        y: 0.5 + (Math.sin(a) * x + Math.cos(a) * y) / 480,
      });
    });
  };
// Reflect the image and swap anatomical labels, including eyes, ears and mouth corners.
const mirrored: Transform = (body) => {
  const out = body.map((p) => ({ ...p, x: 1 - p.x }));
  const pairs = [
    [1, 4],
    [2, 5],
    [3, 6],
    ...Array.from({ length: 13 }, (_, i) => [7 + 2 * i, 8 + 2 * i]),
  ];
  for (const [l, r] of pairs) [out[l], out[r]] = [out[r], out[l]];
  return out;
};
const variants: Variant[] = [
  ...[0.7, 1.3].map((s) => ({
    name: 'scale ' + s,
    transform: (b: Point[]) => scaleAbout(0.5, 0.97, s)(b).map(inView),
  })),
  ...[-5, 5].map((d) => ({ name: 'roll ' + d, transform: roll(d) })),
  ...[-0.2, 0.2].map((d) => ({
    name: 'height ' + d,
    transform: (b: Point[]) => b.map((p) => inView({ ...p, y: p.y + d })),
  })),
  { name: 'mirror', transform: mirrored, mirror: true },
  ...[10, 15, 20, 30].map((fps) => ({ name: 'fps ' + fps, fps })),
  ...[1, 2, 3, 4, 5].map((n) => ({
    name: 'visibility ' + n,
    transform: (b: Point[], i: number) =>
      i % 45 >= 20 && i % 45 < 20 + n ? b.map((p) => ({ ...p, visibility: 0 })) : b,
  })),
];
const names = Object.keys(import.meta.glob('./fixtures/**/*.json'))
  .map((p) => p.slice('./fixtures/'.length, -5))
  .sort();
const cutoffs: Record<string, number> = { standing: 5500, jump: 7200, 'greg/mixed': 6300 };
const identity: Transform = (b) => b;
function forEachFrame(
  clip: ReturnType<typeof loadClip>,
  fps: number | undefined,
  emit: (index: number, t: number) => void,
) {
  const last = clip.frames.length - 1;
  if (fps) {
    // Sample the nearest captured pose on an irregular synthetic camera clock. A nominal 30 FPS
    // can reuse a capture from a slower source. Record both the source index and simulated time.
    const random = rng(16);
    let i = 0;
    for (
      let t = clip.frames[0].t;
      t <= clip.frames[last].t;
      t += (1000 / fps) * (0.8 + 0.4 * random())
    ) {
      while (i < last && Math.abs(clip.frames[i + 1].t - t) <= Math.abs(clip.frames[i].t - t)) i++;
      emit(i, t);
    }
  } else clip.frames.forEach((f, i) => emit(i, f.t));
}

function play(name: string, v: Variant): Event[] {
  const clip = loadClip(name);
  const group = name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '';
  const self = ['armsUp', 'reach', 'mixed'].includes(name);
  const transform = v.transform ?? identity;
  const calibration = calibrateFromClip(
    self ? clip : loadClip(group + 'standing'),
    self ? 300 : 1000,
    'floor',
    (b) => transform(b, 0),
  );
  const det = createDetector(calibration);
  const gesture = createGestureDetector();
  const result: Event[] = [];
  const emit = (frame: number, t: number) => {
    const raw = clip.frames[frame].pose;
    const pose = raw ? transform(toPoints(raw), frame) : null;
    for (const event of det.update(pose, t)) {
      if (t <= (cutoffs[name] ?? Infinity)) result.push({ ...event, frame });
    }
    if (gesture.update(pose, t, det.state, det.readout)) result.push({ type: 'pause', frame, t });
  };
  const last = clip.frames.length - 1;
  forEachFrame(clip, v.fps, emit);
  if (name === 'near/squat' || name === 'greg/squat') {
    for (let dt = 33; dt <= 1000; dt += 33) emit(last, clip.frames[last].t + dt);
  }
  return result;
}
function reflect(type: Event['type']) {
  return type === 'reachLeft' ? 'reachRight' : type === 'reachRight' ? 'reachLeft' : type;
}
function compare(name: string, v: Variant) {
  const base = play(name, { name: 'original' }).map((e) => ({
    ...e,
    type: v.mirror ? reflect(e.type) : e.type,
  }));
  const actual = play(name, v);
  if (!name.split('/').at(-1)?.startsWith('pauseX')) {
    expect(
      actual.filter((e) => e.type === 'pause'),
      name + ' / ' + v.name,
    ).toEqual([]);
  }
  const unused = new Set(actual);
  const missed: Event[] = [];
  // Associate a rep with the same move within half a second, one-to-one, nearest first.
  // Without time matching, a false move later in the clip could cancel a genuine miss.
  for (const expected of base) {
    const nearest = [...unused]
      .filter((e) => e.type === expected.type && Math.abs(e.t - expected.t) <= 500)
      .sort((a, b) => Math.abs(a.t - expected.t) - Math.abs(b.t - expected.t))[0];
    if (nearest) unused.delete(nearest);
    else missed.push(expected);
  }
  return { base, missed, extra: [...unused] };
}

const known: Record<string, string[]> = {
  'scale 1.3|near/jump': ['miss jump 182'],
  'scale 1.3|near/mixed': ['miss squat 180', 'miss sidestep 182', 'miss sidestep 204'],
  'roll -5|greg/armsUp': ['extra reachLeft 41'],
  'roll -5|near/reach': ['miss reachRight 8', 'extra reachLeft 44', 'extra reachLeft 201'],
  'roll 5|greg/armsUp': ['extra reachRight 41'],
  'roll 5|near/reach': ['extra reachRight 84', 'extra reachRight 201'],
  'fps 10|greg/leaveFrame': ['miss sidestep 121', 'extra sidestep 155', 'extra sidestep 184'],
  'fps 10|greg/mixed': [
    'miss jump 35',
    'miss reachRight 61',
    'miss reachLeft 75',
    'extra squat 42',
  ],
  'fps 10|greg/reach': ['miss reachLeft 140'],
  'fps 15|greg/mixed': ['miss reachRight 61'],
  'fps 15|greg/reach': ['miss reachLeft 140'],
  'fps 20|greg/reach': ['miss reachLeft 140'],
  'visibility 3|greg/leaveFrame': ['miss sidestep 121'],
  'visibility 4|greg/leaveFrame': ['miss sidestep 121', 'miss sidestep 200'],
  'visibility 4|greg/mixed': ['miss reachLeft 75'],
  'visibility 5|greg/leaveFrame': ['miss sidestep 121', 'miss sidestep 200'],
  'visibility 5|greg/mixed': ['miss reachLeft 75'],
};

// Separate expected failures from new ones. One known miss must not hide another move
// or a false pause in the same clip. Frame numbers refer to the original recording.
describe.each(variants)('$name', (variant) => {
  for (const name of names) {
    const expected = known[variant.name + '|' + name] ?? [];
    const differences = () => {
      const { missed, extra } = compare(name, variant);
      return [
        ...missed.map((e) => 'miss ' + e.type + ' ' + e.frame),
        ...extra.map((e) => 'extra ' + e.type + ' ' + e.frame),
      ];
    };
    test(name + ' has no new misses, extra moves or false pauses', () => {
      expect(differences().filter((d) => !expected.includes(d))).toEqual([]);
    });
    if (expected.length)
      test.fails('Abdo: ' + name + ' reproduces every move without extras', () => {
        expect(differences()).toEqual([]);
      });
  }
});
test('the positive pause control contains two independent recorded X holds', () => {
  expect(play('near/pauseX', { name: 'original' }).filter((e) => e.type === 'pause')).toHaveLength(
    2,
  );
});

const framing = [
  { name: 'original', transform: identity },
  ...variants.filter((v) => v.transform && !v.name.startsWith('visibility')),
];
const prompts: Record<string, string> = {
  'standing|scale 0.7': 'tooFar',
  'greg/standing|scale 0.7': 'tooFar',
  'standing|height 0.2': 'tooClose',
  'near/standing|height -0.2': 'tooClose',
  'near/standing|height 0.2': 'tooClose',
  'near/standing|scale 1.3': 'tooClose',
};
describe.each(['standing', 'greg/standing', 'near/standing'])(
  '%s framing during calibration',
  (name) => {
    test.each(framing)('$name', (variant) => {
      const s = createSession();
      for (const [i, f] of loadClip(name).frames.entries()) {
        if (f.t > 4000 || s.calibration) break;
        s.frame(f.pose ? [(variant.transform ?? identity)(toPoints(f.pose), i)] : [], f.t);
      }
      expect(s.calibration ? 'done' : s.calibrating?.step).toBe(
        prompts[name + '|' + variant.name] ?? 'done',
      );
    });
  },
);

test('the full session suppresses the two extra detector lane changes as Greg leaves at 10 FPS', () => {
  const s = createSession();
  const stand = loadClip('greg/standing');
  forEachFrame(stand, undefined, (i, t) => {
    const pose = stand.frames[i].pose;
    s.frame(pose ? [toPoints(pose)] : [], t);
  });
  expect(s.calibration).not.toBeNull();
  const start = stand.frames.at(-1)!.t + 33;
  const events: { type: MoveType; t: number }[] = [];
  s.onMove((e) => events.push({ type: e.type, t: Math.round(e.t - start) }));
  const clip = loadClip('greg/leaveFrame');
  forEachFrame(clip, 10, (i, t) => {
    const pose = clip.frames[i].pose;
    s.frame(pose ? [toPoints(pose)] : [], start + t);
  });
  expect(events).toEqual([{ type: 'sidestep', t: 6796 }]);
});
