import { describe, expect, test } from 'vitest';
import { createDetector } from './detect';
import { overlayText } from './overlay';
import { DETECTION } from './tuning';

const base = {
  fps: 29.7,
  delegate: 'GPU' as const,
  mode: 'floor' as const,
  calibration: null,
  calibrating: null,
  detector: null,
  bodies: 1,
  events: [],
};

describe('overlay text', () => {
  test('before calibration', () => {
    const text = overlayText(base);
    expect(text).toContain('29.7 FPS GPU');
    expect(text).toContain('not calibrated');
  });

  test('shows live values next to the current thresholds, which follow the sliders', () => {
    const cal = { centreX: 0.5, centreY: 0.68, W: 0.1, T: 0.2 };
    const text = overlayText({ ...base, calibration: cal, detector: createDetector(cal) });
    expect(text).toContain(`lane on ±${DETECTION.LANE_ON_W.toFixed(2)}`);
    expect(text).toContain('squat >');
    const old = DETECTION.LANE_ON_W;
    DETECTION.LANE_ON_W = 0.75;
    expect(overlayText({ ...base, calibration: cal, detector: createDetector(cal) })).toContain(
      'lane on ±0.75',
    );
    DETECTION.LANE_ON_W = old;
  });

  test('treadmill mode shows only arms', () => {
    const cal = { centreX: 0.5, centreY: 0.5, W: 0.2, T: 0.36 };
    const text = overlayText({
      ...base,
      mode: 'treadmill',
      calibration: cal,
      detector: createDetector(cal, 'treadmill'),
    });
    expect(text).not.toContain('lane on');
    expect(text).toContain('arms');
  });

  test('lists recent moves and calibration progress', () => {
    const text = overlayText({
      ...base,
      calibrating: { step: 'holdStill', progress: 0.4, message: '' },
      events: [
        { type: 'jump', t: 1 },
        { type: 'squat', t: 2 },
      ],
    });
    expect(text).toContain('holdStill 40%');
    expect(text).toContain('jump · squat');
  });
});
