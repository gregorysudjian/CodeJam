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
    async reducedMotion() {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    },
    /** WCAG AA text contrast on what is on screen now. Each visible text run is compared with the
     *  pixels behind it (a second screenshot with all text made transparent), so glass, gradients,
     *  images and video count. Returns the runs under 4.5:1 (3:1 for large text: 24 px, or 18.66 px
     *  bold), worst first. Skips aria-hidden and disabled text (WCAG exempts inactive controls). */
    async contrast() {
      const runs = await b.eval(`(() => {
        const out = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!n.textContent.trim() || !el || el.closest('[aria-hidden="true"], :disabled, [aria-disabled="true"], script, style, noscript')) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility !== 'visible') continue;
          let op = 1;
          for (let a = el; a; a = a.parentElement) op *= Number(getComputedStyle(a).opacity);
          // SVG text (chart ticks) is painted with fill, not color.
          const paint = el instanceof SVGElement ? cs.fill : cs.color;
          if (!/^rgba?\\(/.test(paint)) continue;
          const c = paint.match(/[\\d.]+/g).map(Number);
          const alpha = (c[3] ?? 1) * op;
          if (alpha < 0.05) continue; // gradient-clipped or faded-out text
          const range = document.createRange(); range.selectNodeContents(n);
          for (const r of range.getClientRects()) {
            const x = Math.max(0, r.left), y = Math.max(0, r.top), x2 = Math.min(innerWidth, r.right), y2 = Math.min(innerHeight, r.bottom);
            if (x2 - x < 2 || y2 - y < 2) continue;
            // Covered by something else (the pause overlay over the HUD, a sticky footer): not visible.
            const top = document.elementFromPoint((x + x2) / 2, (y + y2) / 2);
            if (!top || !(top === el || el.contains(top) || top.contains(el))) continue;
            const size = parseFloat(cs.fontSize), weight = Number(cs.fontWeight) || 400;
            out.push({ text: n.textContent.trim().slice(0, 30), x, y, w: x2 - x, h: y2 - y, rgb: c.slice(0, 3), alpha, large: size >= 24 || (size >= 18.66 && weight >= 700), size });
          }
        }
        // Text fields: the typed value, or the placeholder when empty (neither is a text node).
        for (const el of document.querySelectorAll('input, textarea')) {
          if (el.closest('[aria-hidden="true"]') || el.disabled || /^(hidden|checkbox|radio|range|color|file)$/.test(el.type)) continue;
          const text = el.value || el.placeholder;
          if (!text) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility !== 'visible') continue;
          const paint = el.value ? cs.color : getComputedStyle(el, '::placeholder').color;
          if (!/^rgba?\\(/.test(paint)) continue;
          const c = paint.match(/[\\d.]+/g).map(Number);
          let op = 1;
          for (let a = el; a; a = a.parentElement) op *= Number(getComputedStyle(a).opacity);
          const alpha = (c[3] ?? 1) * op;
          if (alpha < 0.05) continue;
          const r = el.getBoundingClientRect();
          const px = (p) => parseFloat(cs[p]) || 0;
          const x = Math.max(0, r.left + px('borderLeftWidth') + px('paddingLeft')), x2 = Math.min(innerWidth, r.right - px('borderRightWidth') - px('paddingRight'));
          const y = Math.max(0, r.top + px('borderTopWidth') + px('paddingTop')), y2 = Math.min(innerHeight, r.bottom - px('borderBottomWidth') - px('paddingBottom'));
          if (x2 - x < 2 || y2 - y < 2) continue;
          const top = document.elementFromPoint((x + x2) / 2, (y + y2) / 2);
          if (top !== el && !el.contains(top)) continue;
          const size = parseFloat(cs.fontSize), weight = Number(cs.fontWeight) || 400;
          out.push({ text: (el.value ? '' : 'placeholder: ') + text.slice(0, 30), x, y, w: x2 - x, h: y2 - y, rgb: c.slice(0, 3), alpha, large: size >= 24 || (size >= 18.66 && weight >= 700), size });
        }
        const s = document.createElement('style'); s.id = '__qa_hide_text';
        // transition: none, or transition-colors elements fade out instead of hiding before the shot.
        s.textContent = '*, *::before, *::after, ::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; transition: none !important; } svg text, svg tspan { fill: transparent !important; stroke: transparent !important; }';
        document.head.appendChild(s);
        return out;
      })()`);
      let data;
      try {
        await sleep(120);
        ({ data } = await send('Page.captureScreenshot', { format: 'png' }));
      } finally {
        // Always show the text again, or every later shot in this browser would be blank. Colours come
        // back with transitions still off (flushed), so nothing fades back in during the next shot.
        await b.eval(`(() => {
          const s = document.getElementById('__qa_hide_text');
          if (!s) return;
          s.textContent = '*, *::before, *::after { transition: none !important; }';
          void document.body.offsetHeight;
          for (const el of document.querySelectorAll('*')) getComputedStyle(el).color;
          s.remove();
        })()`);
      }
      return b.eval(`(async (b64, runs) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const k = img.width / innerWidth;
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        const lum = (r, gg, bb) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(bb);
        const fails = [];
        for (const t of runs) {
          const d = g.getImageData(Math.round(t.x * k), Math.round(t.y * k), Math.max(1, Math.round(t.w * k)), Math.max(1, Math.round(t.h * k))).data;
          const ratios = [];
          for (let i = 0; i < d.length; i += 12) {
            const fg = t.rgb.map((v, j) => v * t.alpha + d[i + j] * (1 - t.alpha));
            const a = lum(...fg), bg = lum(d[i], d[i + 1], d[i + 2]);
            ratios.push((Math.max(a, bg) + 0.05) / (Math.min(a, bg) + 0.05));
          }
          ratios.sort((p, q) => p - q);
          const ratio = ratios[Math.floor(ratios.length * 0.1)]; // 10th percentile: ignores grain, keeps real hot spots
          const need = t.large ? 3 : 4.5;
          if (ratio < need) fails.push({ text: t.text, ratio: +ratio.toFixed(2), need, size: t.size });
        }
        return fails.sort((p, q) => p.ratio / p.need - q.ratio / q.need);
      })(${JSON.stringify(data)}, ${JSON.stringify(runs)})`);
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
