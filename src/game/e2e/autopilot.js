// In-page keyboard autopilot for src/game/e2e (injected before START; dev server only).
// The round clock starts INTRO_SEC after <body data-game="running"> turns on (the 3-2-1), and
// stops while it is off (pauses). The level is read from React's fiber tree, because the select
// screen picks a random seed for every workout but the demo.
// Modes: 'perfect' does what core.test.ts's perfect() player does, with the real key codes;
// 'idle' presses nothing; 'spam' taps the game's keys about 30 times a second.
window.__findLevel = () => {
  for (const el of document.querySelectorAll('canvas')) {
    const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
    for (let f = k && el[k]; f; f = f.return) {
      if (f.memoizedProps?.level?.waves) return f.memoizedProps.level;
      for (let h = f.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) {
        const v = Array.isArray(h.memoizedState) ? h.memoizedState[0] : h.memoizedState;
        if (v && v.waves && v.config) return v;
      }
    }
  }
  return null;
};

// Anything from outside the script (a click or key on the window, focus lost, the tab hidden) can
// throw the autopilot off; record it with the round time, so a failure can be told apart from a bug.
window.__e2eOutside = [];
const outside = (what) => window.__e2eOutside.push(`${what} at ${(window.__e2eTime ?? 0).toFixed(1)} s`);
window.addEventListener('blur', () => outside('window lost focus'));
document.addEventListener('visibilitychange', () => document.hidden && outside('page hidden'));
for (const type of ['keydown', 'pointerdown'])
  window.addEventListener(type, (e) => e.isTrusted && outside(type === 'keydown' ? `real key ${e.code}` : 'real click'), true);

window.__startAutopilot = (mode, introSec) => {
  const send = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
  const tap = (code) => {
    send('keydown', code);
    setTimeout(() => send('keyup', code), 40);
  };
  const held = new Set();
  const hold = (code, on) => {
    if (on && !held.has(code)) (held.add(code), send('keydown', code));
    if (!on && held.has(code)) (held.delete(code), send('keyup', code));
  };
  let level = null;
  let lane = 0;
  let wasAirborne = false;
  // What a perfect player does at round time e (judge.ts: requirementMet).
  const wanted = (e) => {
    const s = { lane, duck: false, jump: false, left: false, right: false };
    for (const wave of level.waves)
      for (const sp of wave.spawns) {
        if (e < wave.t - 0.3 || e > wave.t + 0.1 + (sp.holdSec ?? 0)) continue;
        if (sp.kind === 'block') {
          const free = [-1, 0, 1].filter((l) => !sp.lanes.includes(l));
          s.lane = free.includes(lane) ? lane : free.includes(0) ? 0 : free[0];
        }
        if (sp.kind === 'hurdle') s.jump = true;
        if (sp.kind === 'beam') s.duck = true;
        if (sp.kind === 'crate') s.left = s.right = true;
        if (sp.kind === 'orb') {
          if (level.config.mode === 'treadmill') {
            const l = sp.lanes[0]; // treadmill orbs: -1 left arm, 1 right arm, 0 both
            if (l <= 0) s.left = true;
            if (l >= 0) s.right = true;
          } else Object.assign(s, { lane: sp.lanes[0], right: true });
        }
      }
    return s;
  };
  // On blur the keyboard input releases every key (src/input): press the held ones again next tick.
  window.addEventListener('blur', () => held.clear());
  const SPAM = ['ArrowLeft', 'ArrowRight', 'Space', 'ArrowDown', 'KeyW', 'KeyQ', 'KeyE'];
  let spamI = 0;
  let t0 = null;
  let pausedAt = null;
  let pausedMs = 0;
  const id = setInterval(() => {
    const now = performance.now();
    if (document.body.dataset.game !== 'running') {
      if (t0 !== null && pausedAt === null) pausedAt = now;
      return;
    }
    if (t0 === null) {
      t0 = now + introSec * 1000;
      level = window.__findLevel();
      window.__e2eLevel = level && { config: level.config, objects: level.waves.reduce((n, w) => n + w.spawns.length, 0) };
    }
    if (pausedAt !== null) (pausedMs += now - pausedAt), (pausedAt = null);
    if (now < t0) return;
    const e = (now - t0 - pausedMs) / 1000;
    window.__e2eTime = e;
    if (mode === 'idle' || !level) return;
    if (mode === 'spam') {
      if (Math.random() < 0.5) tap(SPAM[spamI++ % SPAM.length]);
      return;
    }
    const w = wanted(e);
    if (w.lane !== lane) {
      tap(w.lane < lane ? 'ArrowLeft' : 'ArrowRight');
      lane += w.lane < lane ? -1 : 1;
    }
    if (w.jump && !wasAirborne) tap('Space');
    wasAirborne = w.jump;
    hold('ArrowDown', w.duck);
    hold('KeyW', w.left && w.right);
    hold('KeyQ', w.left && !w.right);
    hold('KeyE', w.right && !w.left);
  }, 16);
  window.__stopAutopilot = () => {
    clearInterval(id);
    held.forEach((c) => send('keyup', c));
  };
};
