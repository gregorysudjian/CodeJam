// Minimal Chrome DevTools Protocol driver for the QA sweep. Node 22+ (built-in WebSocket), no packages.
// The page's camera permission is denied, so no webcam ever turns on.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const CHROME =
  process.env.CHROME ??
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : 'google-chrome');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Hard stop for a whole run, so nothing loops forever. */
export function timebox(ms, label) {
  setTimeout(() => {
    console.error(`TIMEBOX ${label}: gave up after ${ms} ms`);
    process.exit(3);
  }, ms).unref();
}

export async function launch({ port, profile, base }) {
  mkdirSync(profile, { recursive: true });
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--mute-audio',
      '--deny-permission-prompts',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let targets = [];
  for (let i = 0; i < 50 && !targets.some((t) => t.type === 'page'); i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    } catch {
      /* not up yet */
    }
    if (!targets.some((t) => t.type === 'page')) await sleep(200);
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pending = new Map();
  const handlers = new Map();
  const logs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) for (const h of handlers.get(msg.method) ?? []) h(msg.params);
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const on = (method, h) => handlers.set(method, [...(handlers.get(method) ?? []), h]);
  on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error' || p.type === 'warning')
      logs.push(`${p.type}: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  });
  on('Runtime.exceptionThrown', (p) =>
    logs.push(`exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`),
  );
  on('Log.entryAdded', (p) => {
    if (p.entry.level === 'error') logs.push(`log error: ${p.entry.text} ${p.entry.url ?? ''}`);
  });
  for (const d of ['Page', 'Runtime', 'Log', 'Network']) await send(`${d}.enable`);
  await send('Browser.setPermission', {
    origin: new URL(base).origin,
    permission: { name: 'videoCapture' },
    setting: 'denied',
  }).catch(() => {});

  const KEYS = {
    ArrowLeft: ['ArrowLeft', 37],
    ArrowRight: ['ArrowRight', 39],
    ArrowUp: ['ArrowUp', 38],
    ArrowDown: ['ArrowDown', 40],
    Space: [' ', 32],
    Enter: ['Enter', 13],
    Escape: ['Escape', 27],
    Tab: ['Tab', 9],
  };
  const b = {
    send,
    logs,
    async size(width, height, deviceScaleFactor = 1) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false });
    },
    async go(url, waitMs = 1500) {
      const loaded = new Promise((r) => on('Page.loadEventFired', r));
      await send('Page.navigate', { url });
      await Promise.race([loaded, sleep(15000)]);
      await sleep(waitMs);
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description);
      return r.result.value;
    },
    async shot(dir, name) {
      mkdirSync(dir, { recursive: true });
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(dir, `${name}.png`), Buffer.from(data, 'base64'));
    },
    /** A real key press: `code` like 'KeyS' or 'Enter'. */
    async key(code, hold = 0) {
      const [k, vk] = KEYS[code] ?? [code.replace(/^Key/, '').toLowerCase(), code.replace(/^Key/, '').charCodeAt(0)];
      const text = k.length === 1 ? k : undefined;
      await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, text });
      if (hold) await sleep(hold);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
    },
    async type(text) {
      await send('Input.insertText', { text });
    },
    /** Click the first visible control whose text or aria-label matches the regex source. */
    async click(match) {
      const rect = await b.eval(`(() => {
        const re = new RegExp(${JSON.stringify(match)}, 'i');
        const el = [...document.querySelectorAll('button, [role=button], [role=radio], a')].find((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (re.test(e.innerText || '') || re.test(e.getAttribute('aria-label') || ''));
        });
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      if (!rect) throw new Error(`click: nothing matches /${match}/`);
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
        await send('Input.dispatchMouseEvent', { type, x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
      await sleep(400);
    },
    text: () => b.eval('document.body.innerText'),
    /** Wait until the page text matches, or give up after `ms`. */
    async waitFor(re, ms = 10000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (re.test(await b.text())) return true;
        await sleep(100);
      }
      return false;
    },
    layout: () =>
      b.eval(`({ hScroll: document.documentElement.scrollWidth > innerWidth, pageH: document.documentElement.scrollHeight, viewH: innerHeight })`),
    async close() {
      await send('Browser.close').catch(() => {});
      proc.kill();
    },
  };
  return b;
}
