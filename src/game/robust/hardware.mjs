// Exercise the real canvas, WebGL context and page lifecycle. Requires the Vite dev server.
import assert from 'node:assert/strict';
import { sleep } from '../../../docs/qa/sweep/cdp.mjs';

import { base, firstRound, launchRoundBrowser } from './round.mjs';
const b = await launchRoundBrowser(9732);
async function inspectFrame(label) {
  const frame = await b.eval(`new Promise(resolve => requestAnimationFrame(() => {
    const canvas = document.querySelector('canvas');
    const copy = document.createElement('canvas');
    copy.width = 32; copy.height = 18;
    const ctx = copy.getContext('2d');
    ctx.drawImage(canvas, 0, 0, 32, 18);
    const data = ctx.getImageData(0, 0, 32, 18).data;
    const colours = new Set();
    for (let i = 0; i < data.length; i += 4) colours.add(data[i] * 65536 + data[i+1] * 256 + data[i+2]);
    resolve({ colours: colours.size, width: canvas.width, height: canvas.height, dpr: devicePixelRatio });
  }))`);
  console.log(label, frame);
  assert(frame.colours > 1, label + ' produced a uniform canvas');
}
try {
  await firstRound(b);
  await sleep(4000);
  for (const [width, height, deviceScaleFactor] of [
    [1366, 768, 1],
    [1920, 1080, 1],
    [1280, 720, 1],
    [1280, 720, 2],
  ]) {
    await b.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile: false,
    });
    await sleep(200);
    await inspectFrame(width + 'x' + height + ' @' + deviceScaleFactor);
  }
  await b.send('Emulation.clearDeviceMetricsOverride');
  await b.send('Browser.setPermission', {
    origin: base,
    permission: { name: 'fullscreen', allowWithoutGesture: true },
    setting: 'granted',
  });
  const full = await b.send('Runtime.evaluate', {
    expression: 'document.documentElement.requestFullscreen()',
    userGesture: true,
    awaitPromise: true,
  });
  assert(!full.exceptionDetails, JSON.stringify(full.exceptionDetails));
  assert(await b.eval('!!document.fullscreenElement'));
  await inspectFrame('fullscreen');
  await b.eval('document.exitFullscreen()');
  assert(!(await b.eval('!!document.fullscreenElement')));
  await inspectFrame('windowed');

  const restored = await b.eval(`new Promise(resolve => {
    const canvas = document.querySelector('canvas');
    const ext = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!ext) return resolve(false);
    const timeout = setTimeout(() => resolve(false), 5000);
    canvas.addEventListener('webglcontextrestored', () => { clearTimeout(timeout); resolve(true); }, { once:true });
    canvas.addEventListener('webglcontextlost', () => setTimeout(() => ext.restoreContext(), 200), { once:true });
    ext.loseContext();
  })`);
  assert(restored, 'context restore event missing');
  await inspectFrame('restored');
  const { targetInfo } = await b.send('Target.getTargetInfo');
  const other = await b.send('Target.createTarget', { url: 'about:blank' });
  await b.send('Target.activateTarget', other);
  assert(await b.eval('document.hidden'), 'Chrome did not hide the game tab');
  const pausedClock = await b.eval("document.querySelector('.hud-clock').textContent");
  await sleep(60_000);
  await b.send('Target.activateTarget', { targetId: targetInfo.targetId });
  assert(await b.eval('!document.hidden'), 'Chrome did not foreground the game tab');
  assert.equal(await b.eval("document.querySelector('.hud-clock').textContent"), pausedClock);
  assert(await b.waitFor(/paused/i), 'round did not pause while hidden');
  await b.click('resume');
  await inspectFrame('visible and resumed');
  assert(await b.waitFor(/round complete/i, 90000));
  assert.equal(
    await b.eval("JSON.parse(localStorage.getItem('codejam.local.sessions')).length"),
    1,
  );
  assert(!b.logs.some((line) => /exception:|render failed/.test(line)), b.logs.join('\n'));
} finally {
  await b.close();
}
