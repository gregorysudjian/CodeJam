// Run with the dev server on localhost:5173 and Node 22+. Each line is one completed round.
import assert from 'node:assert/strict';
import { sleep } from '../../../docs/qa/sweep/cdp.mjs';

import { firstRound, launchRoundBrowser } from './round.mjs';
const rounds = Number(process.argv[2] ?? 30);
assert(Number.isSafeInteger(rounds) && rounds > 0);
const browser = await launchRoundBrowser(9731);

// Keep only weak references. Retaining each renderer here would invalidate the measurement.
function installProbe() {
  const probe = (window.soak = { contexts: [], firstFrameMs: null, started: null });
  function start() {
    probe.started = performance.now();
    probe.firstFrameMs = null;
  }
  window.addEventListener(
    'click',
    (e) => {
      if (/start|play again/i.test(e.target.closest('button')?.textContent ?? '')) start();
    },
    true,
  );
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'Escape' && /try each move/i.test(document.body.innerText)) start();
    },
    true,
  );
  window.AudioContext = class extends AudioContext {
    constructor(...args) {
      super(...args);
      probe.contexts = probe.contexts.filter((ref) => ref.deref());
      probe.contexts.push(new WeakRef(this));
    }
  };
  window.__THREE_DEVTOOLS__ = new EventTarget();
  window.__THREE_DEVTOOLS__.addEventListener('observe', ({ detail: renderer }) => {
    if (!renderer.isWebGLRenderer) return;
    probe.renderer = new WeakRef(renderer);
    const render = renderer.render;
    renderer.render = function (...args) {
      const result = render.apply(this, args);
      if (probe.started !== null && probe.firstFrameMs === null && this.domElement.isConnected) {
        probe.firstFrameMs = performance.now() - probe.started;
      }
      return result;
    };
  });
}

try {
  await browser.send('Page.addScriptToEvaluateOnNewDocument', {
    source: '(' + installProbe + ')()',
  });
  await firstRound(browser);

  for (let round = 1; round <= rounds; round++) {
    if (round > 1) await browser.click('play again');
    assert(await browser.waitFor(/time left/i), 'HUD missing');
    await sleep(6000);
    for (const code of ['ArrowLeft', 'ArrowRight', 'Space', 'ArrowDown', 'KeyW', 'KeyQ', 'KeyE']) {
      await browser.key(code, 80);
    }
    const rendering = await browser.eval(`(() => {
      const info = soak.renderer?.deref()?.info;
      return { firstFrameMs: soak.firstFrameMs, resources: info ? { ...info.memory, programs: info.programs.length } : null };
    })()`);
    assert(rendering.resources && Number.isFinite(rendering.firstFrameMs), 'WebGL sample missing');
    assert(await browser.waitFor(/round complete/i, 120000), 'Round did not finish');
    await sleep(2500); // Wait for the audio tail and React unmount before the retained-heap sample.
    await browser.send('Runtime.discardConsoleEntries');
    await browser.send('HeapProfiler.collectGarbage');
    const { usedSize: heapBytes } = await browser.send('Runtime.getHeapUsage');
    const { result: win } = await browser.send('Runtime.evaluate', { expression: 'window' });
    const { listeners } = await browser.send('DOMDebugger.getEventListeners', {
      objectId: win.objectId,
    });
    await browser.send('Runtime.releaseObject', { objectId: win.objectId });
    const result = await browser.eval(`(() => {
      const sessions = JSON.parse(localStorage.getItem('codejam.local.sessions') ?? '[]');
      return { saved: sessions.length, score: sessions[0]?.score, accuracy: sessions[0]?.accuracy,
        fps: window.__gameFps, openAudio: soak.contexts.filter(ref => {
          const ctx = ref.deref(); return ctx && ctx.state !== 'closed';
        }).length };
    })()`);
    console.log(
      JSON.stringify({ round, ...rendering, heapBytes, listeners: listeners.length, ...result }),
    );
    assert.equal(result.saved, round);
    assert(Number.isFinite(result.score) && result.score >= 0);
    assert(Number.isFinite(result.accuracy) && result.accuracy >= 0 && result.accuracy <= 1);
    assert(Number.isFinite(result.fps?.avgFps), 'FPS sample missing');
    assert(
      !browser.logs.some((line) => /exception:|render failed/.test(line)),
      browser.logs.join('\n'),
    );
  }
} finally {
  await browser.close();
}
