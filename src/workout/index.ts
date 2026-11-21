// Owner: B (Patrick). Level generation, workout metadata and session scoring.
import type { Level, SessionConfig, WorkoutId, WorkoutInfo } from '@/contracts';
import { generateLevel as generate } from './level';
import { DEMO_CONFIG } from './tuning';

export { createSessionTracker } from './tracker';
/** The fixed-seed 45-second Full body round for the demo (DEMO.md). */
export { DEMO_CONFIG };

/**
 * Contract entry point. With `?demo=1` in the page URL it always returns the demo round,
 * whatever was picked, so the stage laptop plays the level the Player rehearsed.
 * The returned level.config is the demo config, so the saved session says so too.
 */
export function generateLevel(config: SessionConfig): Level {
  return generate(isDemoUrl() ? DEMO_CONFIG : config);
}

function isDemoUrl(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('demo') === '1';
  } catch {
    return false; // no window (tests, server)
  }
}

export const WORKOUTS: Record<WorkoutId, WorkoutInfo> = {
  legs: {
    id: 'legs',
    name: 'Legs',
    tagline: 'Squats, jumps and sidesteps',
    moves: ['squat', 'jump', 'sidestep'],
    availableIn: ['floor'],
  },
  arms: {
    id: 'arms',
    name: 'Arms',
    tagline: 'Fast left and right reaches',
    moves: ['reachLeft', 'reachRight', 'armsUp'],
    availableIn: ['floor', 'treadmill'],
  },
  shoulders: {
    id: 'shoulders',
    name: 'Shoulders',
    tagline: 'Overhead presses and holds',
    moves: ['armsUp', 'reachLeft', 'reachRight'],
    availableIn: ['floor', 'treadmill'],
  },
  fullBody: {
    id: 'fullBody',
    name: 'Full body',
    tagline: 'A bit of everything',
    moves: ['sidestep', 'jump', 'squat', 'armsUp'],
    availableIn: ['floor', 'treadmill'],
  },
};
