// Measure elapsed game, JS and audio time between two HUD ticks in a real 180 s round.
import assert from 'node:assert/strict';
import { firstRound, launchRoundBrowser, summaries, validate } from './round.mjs';

const slow = process.argv.includes('--slow');
const b = await launchRoundBrowser(slow ? 9735 : 9733);
// Deliver all queued animation callbacks every fourth display tick, preserving the timestamp
// and cancellation contract. Audio and the HUD timer continue on their normal clocks.
function slowDisplay() {
  const raf = requestAnimationFrame.bind(window);
  let nextId = 0;
  let tick = 0;
  const queued = new Map();
  window.requestAnimationFrame = (cb) => {
    queued.set(++nextId, cb);
    return nextId;
  };
  window.cancelAnimationFrame = (id) => queued.delete(id);
  function advance(now) {
    if (++tick % 4 === 0) {
      for (const id of [...queued.keys()]) {
        const cb = queued.get(id);
        queued.delete(id);
        cb?.(now);
      }
    }
    raf(advance);
  }
  raf(advance);
}
function measure() {
  const marks = (window.driftMarks = []);
  let audio;
  window.AudioContext = class extends AudioContext {
    constructor(...args) {
      super(...args);
      audio = this;
    }
  };
  // The kick oscillator ramps down to 42 Hz. Record scheduled audio time, including lookahead.
  let kicks = 0;
  let lastKick = null;
  const ramp = AudioParam.prototype.exponentialRampToValueAtTime;
  AudioParam.prototype.exponentialRampToValueAtTime = function (value, time) {
    if (value === 42) {
      kicks++;
      lastKick = time - 0.12;
    }
    return ramp.call(this, value, time);
  };
  let lastClock;
  new MutationObserver(() => {
    const display = document.querySelector('.hud-clock .font-display-italic')?.textContent;
    if (!display || lastClock === display) return;
    lastClock = display;
    if (display === '2:50' || display === '0:10')
      marks.push({
        display,
        wall: performance.now() / 1000,
        audio: audio?.currentTime,
        kicks,
        lastKick,
      });
  }).observe(document, { subtree: true, childList: true, characterData: true });
}
try {
  if (slow)
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + slowDisplay + ')()' });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + measure + ')()' });
  await firstRound(b, '?store=local', 180);
  assert(await b.waitFor(/round complete/i, slow ? 360000 : 250000));
  const entries = await summaries(b);
  assert.equal(entries.length, 1);
  validate(entries[0]);
  assert.equal(entries[0].config.durationSec, 180);
  const marks = await b.eval('window.driftMarks');
  assert.equal(marks.length, 2, JSON.stringify(marks));
  const [start, end] = marks;
  assert(end.kicks > start.kicks && start.kicks > 0, 'scheduled music kicks missing');
  const gameSec = 160;
  const wallSec = end.wall - start.wall;
  const audioSec = end.audio - start.audio;
  console.log(
    JSON.stringify({
      gameSec,
      wallSec,
      audioSec,
      wallMinusGame: wallSec - gameSec,
      audioMinusGame: audioSec - gameSec,
      marks,
    }),
  );
} finally {
  await b.close();
}
