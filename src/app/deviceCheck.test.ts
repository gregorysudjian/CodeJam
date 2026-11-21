import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DeviceNotice } from './DeviceNotice';
import { checkDevice, readEnvironment, type DeviceEnvironment } from './deviceCheck';

// Real user-agent strings (late 2026 versions).
const UA = {
  chromeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  edgeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
  firefoxWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
};

const env = (over: Partial<DeviceEnvironment>): DeviceEnvironment => ({
  userAgent: UA.chromeWin,
  maxTouchPoints: 0,
  touchOnly: false,
  webgl2: true,
  ...over,
});

describe('checkDevice', () => {
  it.each([
    ['Chrome on Windows', env({})],
    ['Chrome on a Mac', env({ userAgent: UA.chromeMac })],
    ['Edge on Windows', env({ userAgent: UA.edgeWin })],
    ['a touch-screen Windows laptop with a trackpad', env({ maxTouchPoints: 10 })],
    ['Chrome, brands only', env({ userAgent: '', brands: ['Chromium', 'Google Chrome'] })],
  ])('lets %s play with no message', (_, e) => {
    expect(checkDevice(e).verdict).toBe('ok');
  });

  it.each([
    ['an iPhone (Safari)', env({ userAgent: UA.iphoneSafari, maxTouchPoints: 5, touchOnly: true })],
    ['an iPhone (Chrome, which is WebKit)', env({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 })],
    ['an Android phone', env({ userAgent: UA.androidChrome, uaMobile: true, touchOnly: true })],
    ['an Android tablet', env({ userAgent: UA.androidTablet, maxTouchPoints: 5 })],
    ['an iPad (reports a Mac)', env({ userAgent: UA.safariMac, maxTouchPoints: 5 })],
    ['a touch-only device', env({ touchOnly: true })],
  ])('sends %s to the leaderboard, with "play anyway"', (_, e) => {
    const c = checkDevice(e);
    expect(c.verdict).toBe('phone');
    expect(c.title).toMatch(/laptop in Chrome/);
    expect(c.canPlayAnyway).toBe(true);
  });

  it.each([
    ['Firefox', env({ userAgent: UA.firefoxWin })],
    ['Safari on a Mac', env({ userAgent: UA.safariMac })],
  ])('warns on %s but lets them play', (_, e) => {
    const c = checkDevice(e);
    expect(c.verdict).toBe('browser');
    expect(c.canPlayAnyway).toBe(true);
  });

  it('without WebGL 2 the game cannot run: no "play anyway", even in Chrome', () => {
    const c = checkDevice(env({ webgl2: false }));
    expect(c.verdict).toBe('noWebGL');
    expect(c.canPlayAnyway).toBe(false);
    expect(checkDevice(env({ webgl2: false, userAgent: UA.iphoneSafari })).verdict).toBe('noWebGL');
  });

  it('readEnvironment never throws outside a browser', () => {
    expect(() => readEnvironment()).not.toThrow();
  });

  it('every message is short enough to read at a glance', () => {
    for (const e of [
      env({ webgl2: false }),
      env({ touchOnly: true }),
      env({ userAgent: UA.firefoxWin }),
    ]) {
      const c = checkDevice(e);
      expect(c.title.length).toBeLessThanOrEqual(30);
      expect(c.body.length).toBeLessThanOrEqual(160);
    }
  });
});

describe('DeviceNotice component', () => {
  const html = (e: DeviceEnvironment) =>
    renderToStaticMarkup(
      createElement(DeviceNotice, {
        check: checkDevice(e),
        onLeaderboard: () => {},
        onPlayAnyway: () => {},
      }),
    );

  it('renders nothing on a laptop in Chrome', () => {
    expect(html(env({}))).toBe('');
  });

  it('on a phone: the leaderboard first, then "Play anyway"', () => {
    const h = html(env({ touchOnly: true }));
    expect(h).toContain('role="alertdialog"');
    expect(h).toContain('Play on a laptop in Chrome');
    expect(h.indexOf('See the leaderboard')).toBeLessThan(h.indexOf('Play anyway'));
  });

  it('in Firefox: "Continue" first, the leaderboard second', () => {
    const h = html(env({ userAgent: UA.firefoxWin }));
    expect(h.indexOf('Continue')).toBeGreaterThan(-1);
    expect(h.indexOf('Continue')).toBeLessThan(h.indexOf('See the leaderboard'));
  });

  it('without WebGL 2: only the leaderboard', () => {
    const h = html(env({ webgl2: false }));
    expect(h).toContain('See the leaderboard');
    expect(h).not.toContain('Play anyway');
    expect(h).not.toContain('Continue');
  });
});
