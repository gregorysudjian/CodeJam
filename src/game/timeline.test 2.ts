import { describe, expect, it } from 'vitest';
import type { Wave } from '@/contracts';
import { createTrack, intensityAt, speedFor } from './timeline';
import { SPEED_MAX, SPEED_MIN } from './tuning';

const wave = (t: number, intensity: number): Wave => ({ t, intensity, spawns: [] });

describe('speed and intensity', () => {
  it('maps intensity to speed, clamped', () => {
    expect(speedFor(0)).toBe(SPEED_MIN);
    expect(speedFor(1)).toBe(SPEED_MAX);
    expect(speedFor(2)).toBe(SPEED_MAX);
    expect(speedFor(-1)).toBe(SPEED_MIN);
  });

  it('interpolates intensity between waves and holds at the ends', () => {
    const w = [wave(4, 0), wave(8, 1)];
    expect(intensityAt(w, 0)).toBe(0);
    expect(intensityAt(w, 6)).toBeCloseTo(0.5);
    expect(intensityAt(w, 20)).toBe(1);
    expect(intensityAt([], 5)).toBe(0);
  });
});

describe('track distance', () => {
  it('equals speed × time at constant intensity', () => {
    const track = createTrack([wave(4, 0.5), wave(30, 0.5)], 45);
    const v = speedFor(0.5);
    expect(track.distanceAt(10)).toBeCloseTo(10 * v, 6);
    // the object due at t = 30 sits speed × (30 − 25) ahead at elapsed 25
    expect(track.distanceAt(30) - track.distanceAt(25)).toBeCloseTo(5 * v, 6);
  });

  it('is increasing and continuous when speed ramps', () => {
    const track = createTrack([wave(4, 0), wave(20, 1), wave(40, 0.2)], 45);
    let prev = track.distanceAt(0);
    for (let t = 0.013; t < 60; t += 0.37) {
      const d = track.distanceAt(t);
      expect(d).toBeGreaterThan(prev);
      expect(d - prev).toBeLessThan(0.38 * SPEED_MAX + 1e-9);
      prev = d;
    }
  });

  it('extends past the table end without jumping', () => {
    const track = createTrack([wave(4, 1)], 10);
    const a = track.distanceAt(19.99);
    const b = track.distanceAt(30);
    expect(b - a).toBeCloseTo(10.01 * SPEED_MAX, 3);
  });
});
