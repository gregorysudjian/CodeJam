// Real app, real local persistence, and keyboard events. Run against dev or preview.
import assert from 'node:assert/strict';
import { sleep } from '../../../docs/qa/sweep/cdp.mjs';
import { firstRound, launchRoundBrowser, summaries, validate } from './round.mjs';

const b = await launchRoundBrowser(9734);
let completed = 0;
async function finish() {
  assert(await b.waitFor(/round complete/i, 90000), 'no results screen');
  const saved = await summaries(b);
  assert.equal(saved.length, ++completed);
  assert.equal(new Set(saved.map((s) => s.id)).size, completed);
  validate(saved[0]);
  return saved[0];
}
async function again() {
  await b.click('play again');
  assert(await b.waitFor(/time left/i));
}
try {
  await firstRound(b);
  const idle = await finish();
  assert(Object.values(idle.reps).every((value) => value === 0));
  console.log('Idle player', idle.score, idle.accuracy);
  await again();
  await b.eval(`(() => {
    const codes = ['ArrowLeft','ArrowRight','ArrowUp','Space','ArrowDown','KeyW','KeyQ','KeyE'];
    function spam() {
      if (!document.querySelector('.hud-clock')) return;
      for (const code of codes) for (const type of ['keydown','keyup'])
        window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
      requestAnimationFrame(spam);
    }
    spam();
  })()`);
  const spam = await finish();
  assert(Object.values(spam.reps).some((value) => value > 0));
  console.log('All movement keys every frame', spam.score, spam.accuracy);
  await again();
  for (let pair = 0; pair < 20; pair++) {
    await b.key('Escape');
    assert(await b.waitFor(/paused/i));
    await b.key('Escape');
    assert(await b.waitFor(/^(?![\s\S]*PAUSED)[\s\S]*TIME LEFT/i));
    await b.key('KeyK');
    assert(await b.waitFor(/use keyboard/i), 'camera failure recovery missing');
    await b.click('use keyboard');
  }
  // Pause from the last active HUD second and wait past the original finish time.
  assert(await b.waitFor(/0:01\b/, 65000));
  await b.key('Escape');
  assert(await b.waitFor(/paused/i));
  for (let press = 0; press < 3; press++) await b.key('KeyW');
  await sleep(2000);
  assert.equal((await summaries(b)).length, completed);
  assert.match(await b.text(), /0:01\b/);
  await b.click('resume');
  const resumed = await finish();
  console.log(
    'Repeated pause and camera fallback, last-second resume',
    completed,
    'arms-up reps after three W presses exclusively on the pause screen:',
    resumed.reps.armsUp,
  );
  await again();
  assert(await b.waitFor(/0:01\b/, 65000));
  await b.key('Escape');
  assert(await b.waitFor(/paused/i));
  await b.click('end round');
  assert(await b.waitFor(/pick a workout/i));
  await sleep(2000);
  assert.equal((await summaries(b)).length, completed);
  console.log('Last-second quit discarded exactly one partial round');
  assert(!b.logs.some((line) => line.startsWith('exception:')), b.logs.join('\n'));
} finally {
  await b.close();
}
