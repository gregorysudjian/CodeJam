import { describe, expect, it } from 'vitest';
import { heartCount, hudCueLabel, hudOverlay, raceProgress } from '@/ui/screens/hudRules';

describe('pause messages', () => {
  const base = { paused: false, trackingLost: false, resuming: false };
  it('without pauseReason, behaves as before: tracking lost wins over a user pause', () => {
    expect(hudOverlay(base)).toBeNull();
    expect(hudOverlay({ ...base, paused: true })).toBe('user');
    expect(hudOverlay({ ...base, trackingLost: true })).toBe('trackingLost');
    expect(hudOverlay({ ...base, paused: true, trackingLost: true })).toBe('trackingLost');
  });
  it('someone else in the frame has its own message, with or without trackingLost', () => {
    expect(hudOverlay({ ...base, paused: true, pauseReason: 'otherPerson' })).toBe('otherPerson');
    expect(hudOverlay({ ...base, trackingLost: true, pauseReason: 'otherPerson' })).toBe(
      'otherPerson',
    );
    expect(hudOverlay({ ...base, pauseReason: 'otherPerson' })).toBe('otherPerson');
    expect(hudOverlay({ ...base, paused: true, pauseReason: 'user' })).toBe('user');
  });
  it('the 3-2-1 before a resume hides every message', () => {
    expect(hudOverlay({ ...base, trackingLost: true, resuming: true })).toBeNull();
    expect(
      hudOverlay({ ...base, paused: true, pauseReason: 'otherPerson', resuming: true }),
    ).toBeNull();
    expect(hudOverlay({ ...base, paused: true, resuming: true })).toBeNull();
  });
});

it('hearts are whole and never more than the total', () => {
  expect(heartCount({ left: 2, total: 3 })).toEqual({ left: 2, total: 3 });
  expect(heartCount({ left: -1, total: 3 })).toEqual({ left: 0, total: 3 });
  expect(heartCount({ left: 5, total: 3 })).toEqual({ left: 3, total: 3 });
  expect(heartCount({ left: 1, total: -2 })).toEqual({ left: 0, total: 0 });
});

describe('race progress', () => {
  it('moves from start to finish with elapsed time', () => {
    expect(raceProgress(0, 90)).toBe(0);
    expect(raceProgress(54, 90)).toBe(0.6);
    expect(raceProgress(90, 90)).toBe(1);
  });
  it('clamps the marker to the track and guards zero duration', () => {
    expect(raceProgress(-1, 90)).toBe(0);
    expect(raceProgress(100, 90)).toBe(1);
    expect(raceProgress(10, 0)).toBe(0);
  });
});

it('uses a neutral REACH label for either arm', () => {
  expect(hudCueLabel('reachLeft')).toBe('REACH');
  expect(hudCueLabel('reachRight')).toBe('REACH');
  expect(hudCueLabel('jump')).toBe('JUMP');
});
