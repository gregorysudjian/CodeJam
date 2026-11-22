import { describe, expect, it } from 'vitest';
import type { Wave } from '@/contracts';
import { createLeadBlend, createTrack, intensityAt, levelIntensityAt, speedFor } from './timeline';
import {
  LEAD_BLEND_PER_SEC,
  LEVEL_SPEED_EASE_SEC,
  SPEED_MAX,
  SPEED_MIN,
  VISUAL_LEAD_SEC,
} from './tuning';

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

describe('lead blend (mid-round input switch)', () => {
  const { pose, keyboard } = VISUAL_LEAD_SEC;

  it('starts on the given table and follows a switch at a limited rate, without overshoot', () => {
    const blend = createLeadBlend(pose);
    expect(blend.get()).toEqual(pose);
    blend.step(keyboard, 0.1); // K: camera to keyboard
    expect(blend.get().squat).toBeCloseTo(pose.squat - LEAD_BLEND_PER_SEC * 0.1);
    expect(blend.get().jump).toBeCloseTo(pose.jump - LEAD_BLEND_PER_SEC * 0.1);
    for (let i = 0; i < 100; i++) blend.step(keyboard, 1 / 60);
    expect(blend.get()).toEqual(keyboard); // settled exactly, never below 0
  });

  it('never moves an object faster than the blend rate allows (no jump on screen)', () => {
    const blend = createLeadBlend(keyboard);
    let prev = blend.get().armsUp;
    for (let i = 0; i < 60; i++) {
      blend.step(pose, 1 / 60);
      const now = blend.get().armsUp;
      expect(now - prev).toBeLessThanOrEqual(LEAD_BLEND_PER_SEC / 60 + 1e-12);
      prev = now;
    }
    expect(blend.get().armsUp).toBeCloseTo(pose.armsUp);
  });

  it('stands still while paused (dt 0) and with an unchanged table', () => {
    const blend = createLeadBlend(pose);
    blend.step(keyboard, 0);
    expect(blend.get()).toEqual(pose);
    blend.step(pose, 1);
    expect(blend.get()).toEqual(pose);
  });
});

describe('speed per level (level.stages)', () => {
  const stages = [0, 30, 60].map((s, i) => ({ index: i + 1, startSec: s, endSec: s + 30 }));
  // Each level's waves share one intensity (the generator); a wave near a boundary is absent.
  const ws = [wave(5, 0.1), wave(20, 0.1), wave(35, 0.3), wave(50, 0.3), wave(65, 0.5)];

  it('is flat within a level, whatever the waves around it', () => {
    for (const t of [0, 10, 25, 29.9]) expect(levelIntensityAt(ws, stages, t)).toBe(0.1);
    for (const t of [31 + LEVEL_SPEED_EASE_SEC, 45, 59.9])
      expect(levelIntensityAt(ws, stages, t)).toBe(0.3);
  });

  it('eases to the next level over LEVEL_SPEED_EASE_SEC from the boundary, never overshooting', () => {
    let prev = levelIntensityAt(ws, stages, 30);
    expect(prev).toBe(0.1);
    for (let t = 30; t <= 30 + LEVEL_SPEED_EASE_SEC; t += 0.05) {
      const x = levelIntensityAt(ws, stages, t);
      expect(x).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(x).toBeLessThanOrEqual(0.3 + 1e-12);
      prev = x;
    }
    expect(levelIntensityAt(ws, stages, 30 + LEVEL_SPEED_EASE_SEC)).toBe(0.3);
  });

  it('the track uses it: objects and floor still agree (distance is the integral of speed)', () => {
    const track = createTrack(ws, 90, stages);
    expect(track.speedAt(45)).toBe(speedFor(0.3));
    const d = track.distanceAt(40) - track.distanceAt(38);
    expect(d).toBeCloseTo(2 * speedFor(0.3), 1);
  });
});
