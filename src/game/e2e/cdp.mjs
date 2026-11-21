// Minimal Chrome DevTools Protocol driver for src/game/e2e. Node 22+ (built-in WebSocket and
// fetch), no packages. Chrome runs on a throwaway profile with a fake camera (a test pattern), so
// the real webcam never turns on and nothing touches the operator's normal Chrome storage.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHROME =
  process.env.CHROME ??
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : 'google-chrome');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchChrome({ port, headless }) {
  const profile = mkdtempSync(join(tmpdir(), 'game-e2e-'));
  const proc = spawn(
    CHROME,
    [
      ...(headless ? ['--headless=new'] : ['--window-size=1512,945', '--window-position=0,0']),
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--mute-audio',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      // Keep the round running if another window covers this one (the app pauses when hidden).
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let target;
  for (let i = 0; i < 75 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch {
      /* not up yet */
    }
    if (!target) await sleep(200);
  }
  if (!target) throw new Error(`Chrome did not start (${CHROME}); set CHROME=/path/to/chrome`);
  const page = await connect(target.webSocketDebuggerUrl);
  page.close = () => {
    page.ws.close();
    proc.kill();
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500);
  };
  return page;
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => (ws.addEventListener('open', r, { once: true }), ws.addEventListener('error', j, { once: true })));
  let id = 0;
  const pending = new Map();
  const consoleLines = [];
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(JSON.stringify(msg.error)));
      else res(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const a = msg.params.args.map((x) => x.value ?? x.description ?? x.type);
      consoleLines.push({ level: msg.params.type, text: a.join(' ') });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      consoleLines.push({ level: 'exception', text: d.exception?.description ?? d.text });
    } else if (msg.method === 'Log.entryAdded') {
      consoleLines.push({ level: msg.params.entry.level, text: msg.params.entry.text });
    }
  });
  // Every call times out, so a reply Chrome never sends fails one round instead of hanging the run.
  const send = (method, params = {}, ms = 20000) =>
    new Promise((res, rej) => {
      const i = ++id;
      const timer = setTimeout(() => {
        pending.delete(i);
        rej(new Error(`no reply to ${method} within ${ms / 1000} s`));
      }, ms);
      pending.set(i, {
        res: (v) => (clearTimeout(timer), res(v)),
        rej: (e) => (clearTimeout(timer), rej(e)),
      });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  const page = {
    ws,
    send,
    consoleLines,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expr, ms = 10000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        try {
          if (await page.eval(expr)) return;
        } catch {
          /* page navigating */
        }
        await sleep(100);
      }
      throw new Error('timed out waiting for ' + expr);
    },
    async goto(url) {
      await send('Page.navigate', { url });
      await sleep(300);
      await page.waitFor('document.readyState === "complete"', 20000);
      consoleLines.length = 0;
    },
    text: () => page.eval(`document.body.innerText.replace(/\\s+/g, ' ')`),
    /** Clicks the first enabled button whose text starts with `label` (case-insensitive). */
    async click(label) {
      const ok = await page.eval(`(() => {
        const want = ${JSON.stringify(label.toLowerCase())};
        const b = [...document.querySelectorAll('button, a, [role=button], [role=switch]')].find((el) =>
          !el.disabled && (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').toLowerCase().startsWith(want));
        if (!b) return false;
        b.click();
        return true;
      })()`);
      if (!ok) throw new Error('no button starting with: ' + label);
    },
    key: (code) =>
      page.eval(`['keydown', 'keyup'].forEach((t) => window.dispatchEvent(new KeyboardEvent(t, { code: '${code}', key: '${code}', bubbles: true })))`),
  };
  return page;
}
