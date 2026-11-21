// Fixed timestamps isolate the game clock from the speed of the test machine.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
try {
  const { createCore } = await vite.ssrLoadModule('/src/game/core.ts');
  const { generateLevel } = await vite.ssrLoadModule('/src/workout/level.ts');
  const level = generateLevel({
    durationSec: 180,
    workout: 'fullBody',
    mode: 'floor',
    seed: 41492,
  });
  const idle = {
    tracking: true,
    lane: 0,
    ducking: false,
    airborne: false,
    leftArmUp: false,
    rightArmUp: false,
  };
  for (const hz of [60, 30, 20, 15, 10]) {
    const core = createCore(level);
    let finished = 0;
    core.onEvent((e) => {
      if (e.type === 'finished') finished++;
    });
    core.start();
    let frames = 0;
    while (!core.finished() && frames < 180 * hz * 4) {
      frames++;
      core.step(1 / hz, idle, (frames * 1000) / hz);
    }
    assert.equal(finished, 1);
    console.log(
      JSON.stringify({
        hz,
        frames,
        gameSec: core.elapsed(),
        wallSec: frames / hz,
        excessSec: frames / hz - core.elapsed(),
      }),
    );
  }
} finally {
  await vite.close();
}
