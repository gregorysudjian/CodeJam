// Owner: B (Patrick). Level generation, workout metadata and session scoring.
import type { WorkoutId, WorkoutInfo } from '@/contracts';

export { generateLevel } from './level';
export { createSessionTracker } from './tracker';
/** The fixed-seed 45-second Full body round for the demo (DEMO.md). */
export { DEMO_CONFIG } from './tuning';

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
