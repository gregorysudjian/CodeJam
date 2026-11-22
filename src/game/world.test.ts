import { describe, expect, it } from 'vitest';
import { backdropFor, LEVEL_BACKDROPS } from './backdrop';
import {
  planZones,
  sceneryInView,
  zoneIndexAt,
  zoneMix,
  zonePresence,
  ZONES,
  type ZoneMix,
} from './world';
import * as T from './tuning';

const speed = 15;
const plan45 = planZones(45, (t) => t * speed);
const mix = (): ZoneMix => ({ a: 0, b: 0, k: 0 });

describe('world zones', () => {
  it('goes city, tunnel, bridge, then the finale for the last 10 s', () => {
    const at = (t: number) => ZONES[zoneIndexAt(plan45, t * speed)];
    expect(at(-5)).toBe('city');
    expect(at(5)).toBe('city');
    expect(at(18)).toBe('tunnel');
    expect(at(30)).toBe('bridge');
    expect(at(45 - T.FINALE_SEC + 0.1)).toBe('finale');
    expect(at(60)).toBe('finale'); // the coast after the finish
  });

  it('keeps the order for any round length', () => {
    for (const dur of [10, 20, 45, 90, 180]) {
      const s = planZones(dur, (t) => t * speed).starts;
      for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThanOrEqual(s[i - 1]!);
    }
  });

  it('scenery rises out of the ground after a border and is full inside the zone', () => {
    const tunnel = 1;
    const start = plan45.starts[tunnel]!;
    expect(zonePresence(plan45, tunnel, start - 1)).toBe(0);
    expect(zonePresence(plan45, tunnel, start)).toBe(0);
    expect(zonePresence(plan45, tunnel, start + T.ZONE_RISE / 2)).toBeCloseTo(0.5);
    expect(zonePresence(plan45, tunnel, start + T.ZONE_RISE)).toBe(1);
    expect(zonePresence(plan45, 0, -1000)).toBe(1); // the city reaches back behind the start
  });

  it('blends colours smoothly across a border, never jumping', () => {
    const border = plan45.starts[2]!;
    const m = mix();
    zoneMix(plan45, border - T.ZONE_BLEND, m);
    let last = m.a + m.k;
    for (let d = border - T.ZONE_BLEND; d <= border + T.ZONE_BLEND; d += 0.5) {
      zoneMix(plan45, d, m);
      const pos = m.a + m.k; // position along the zone sequence
      expect(pos).toBeGreaterThanOrEqual(last - 1e-9);
      expect(pos - last).toBeLessThan(0.1); // no step larger than a tenth of a zone
      last = pos;
    }
    zoneMix(plan45, border, m);
    expect(m.a + m.k).toBeCloseTo(1.5); // halfway at the border
  });
});

describe('one segment per level (level.stages, backdrop.ts)', () => {
  const stages = Array.from({ length: 6 }, (_, i) => ({
    index: i + 1,
    startSec: i * 30,
    endSec: i * 30 + 30,
  }));
  const plan = planZones(180, (t) => t * speed, stages);

  it('follows the backdrop table: city, tunnel, bridge, city at dawn, bridge at night, finale', () => {
    expect(plan.starts).toHaveLength(6);
    expect(plan.starts.slice(1)).toEqual([30, 60, 90, 120, 150].map((t) => t * speed));
    expect(plan.scenery.map((i) => ZONES[i])).toEqual(LEVEL_BACKDROPS.map((b) => b.scenery));
    expect(plan.looks).toEqual(LEVEL_BACKDROPS.map((b) => b.look));
    expect(new Set(plan.looks).size).toBe(6); // every level looks different
  });

  it('each level has its own scenery in view, and the colours blend at its border', () => {
    const bridge = ZONES.indexOf('bridge');
    const mid = (k: number) => (k * 30 + 15) * speed;
    expect(zonePresence(plan, bridge, mid(2))).toBe(1); // level 3
    expect(zonePresence(plan, bridge, mid(1))).toBe(0); // level 2: the tunnel
    expect(zonePresence(plan, bridge, mid(4))).toBe(1); // level 5: the bridge again, at night
    expect(sceneryInView(plan, ZONES.indexOf('tunnel'), mid(0), mid(0) + 300)).toBe(true);
    expect(sceneryInView(plan, ZONES.indexOf('tunnel'), mid(3), mid(3) + 100)).toBe(false);
    const m = mix();
    zoneMix(plan, 90 * speed, m);
    expect([m.a, m.b]).toEqual([2, 3]);
    expect(m.k).toBeCloseTo(0.5);
  });

  it('backdropFor: one entry per level, the last one past the table', () => {
    expect(LEVEL_BACKDROPS).toHaveLength(6);
    expect(backdropFor(1).scenery).toBe('city');
    expect(backdropFor(6).scenery).toBe('finale');
    expect(backdropFor(9)).toBe(backdropFor(6));
  });
});
