// Can this device play? Neon Arena is built for Chrome on a laptop: the player stands about 1.5 m
// back and the webcam reads their moves. Visitors also scan the QR code with phones, or open the
// link in Safari or Firefox. This decides what to tell them; DeviceNotice.tsx shows it.
// Pure, so it is unit-tested; readEnvironment() is the only part that touches the browser.

export type DeviceVerdict = 'ok' | 'noWebGL' | 'phone' | 'browser';

export interface DeviceEnvironment {
  userAgent: string;
  /** navigator.userAgentData.mobile (Chromium only; undefined elsewhere). */
  uaMobile?: boolean;
  /** navigator.userAgentData.brands (Chromium only). */
  brands?: string[];
  maxTouchPoints: number;
  /** True when every pointer is coarse (a touch screen and no mouse or trackpad). */
  touchOnly: boolean;
  /** The game (Three.js) needs WebGL 2. */
  webgl2: boolean;
}

export interface DeviceCheck {
  verdict: DeviceVerdict;
  title: string;
  body: string;
  /** False when the game cannot run at all here; "Play anyway" is not offered. */
  canPlayAnyway: boolean;
}

const MESSAGES: Record<Exclude<DeviceVerdict, 'ok'>, Omit<DeviceCheck, 'verdict'>> = {
  noWebGL: {
    title: 'Play on a laptop in Chrome',
    body: "This browser can't draw the game (it needs WebGL 2). The leaderboard works here.",
    canPlayAnyway: false,
  },
  phone: {
    title: 'Play on a laptop in Chrome',
    body: 'You play standing 1.5 m from a laptop while its webcam follows your moves. On this phone, check the leaderboard.',
    canPlayAnyway: true,
  },
  browser: {
    title: 'Best in Chrome',
    body: 'Neon Arena is built and tested in Chrome. Here, camera tracking may be slow or not start, but the keyboard and the leaderboard work.',
    canPlayAnyway: true,
  },
};

export function isPhoneOrTablet(env: DeviceEnvironment): boolean {
  if (env.uaMobile) return true;
  const ua = env.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua)) return true;
  // iPadOS reports itself as a Mac; only the touch screen gives it away.
  if (/Macintosh/.test(ua) && env.maxTouchPoints > 1) return true;
  return env.touchOnly;
}

/** Chrome, Edge, Brave, Opera, Arc...: the Chromium engine the app is tested on. */
export function isChromium(env: DeviceEnvironment): boolean {
  const ua = env.userAgent;
  if (/Firefox\/|FxiOS|CriOS|EdgiOS/.test(ua)) return false;
  if (env.brands?.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b))) return true;
  return /Chrome\/|Chromium\/|Edg\//.test(ua);
}

export function checkDevice(env: DeviceEnvironment): DeviceCheck {
  const verdict: DeviceVerdict = !env.webgl2
    ? 'noWebGL'
    : isPhoneOrTablet(env)
      ? 'phone'
      : !isChromium(env)
        ? 'browser'
        : 'ok';
  if (verdict === 'ok') return { verdict, title: '', body: '', canPlayAnyway: true };
  return { verdict, ...MESSAGES[verdict] };
}

/** Reads the real browser. Never throws: anything it cannot read counts as "fine". */
export function readEnvironment(): DeviceEnvironment {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const uaData = (
    nav as
      | (Navigator & { userAgentData?: { mobile?: boolean; brands?: { brand: string }[] } })
      | undefined
  )?.userAgentData;
  let webgl2 = true;
  try {
    webgl2 = !!document.createElement('canvas').getContext('webgl2');
  } catch {
    // Some privacy setups throw; let the game try.
  }
  let touchOnly = false;
  try {
    touchOnly =
      matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  } catch {
    // No matchMedia (tests).
  }
  return {
    userAgent: nav?.userAgent ?? '',
    uaMobile: uaData?.mobile,
    brands: uaData?.brands?.map((b) => b.brand),
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    touchOnly,
    webgl2,
  };
}
