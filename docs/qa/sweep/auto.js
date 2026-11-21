// In-page autoplayer for the seeded demo level (keyboard input). Injected after Start, during the
// 3 s intro. Game time is synced from the HUD cue (each wave's cue appears 2 s before it arrives,
// shown by a 100 ms poll), keeping the smallest offset seen. `skip` lists wave indices to ignore
// (to make a weaker run for the ghost).
(async (skip = []) => {
  const { generateLevel, DEMO_CONFIG } = await import('/src/workout/index.ts');
  const waves = generateLevel({ ...DEMO_CONFIG }).waves;
  const A = (window.__auto = { waves: waves.length, offset: Infinity, cue: 0, log: [], lane: 0, done: false });
  const gameNow = () => (performance.now() - A.offset) / 1000;
  A.gameNow = gameNow;

  const send = (type, code) => {
    const key = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowDown: 'ArrowDown', Space: ' ', KeyW: 'w', KeyQ: 'q', KeyE: 'e' }[code];
    window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true }));
  };
  const tap = (code) => { send('keydown', code); setTimeout(() => send('keyup', code), 40); };

  // Plan the actions (game seconds) for every wave.
  const actions = [];
  let lane = 0;
  waves.forEach((w, i) => {
    if (skip.includes(i)) return;
    const at = w.t - 0.08; // inside the keyboard PERFECT band [-0.15, +0.07)
    const block = w.spawns.find((s) => s.kind === 'block');
    const orb = w.spawns.find((s) => s.kind === 'orb');
    let target = lane;
    if (orb) target = orb.lanes[0];
    else if (block) {
      const free = [-1, 0, 1].filter((l) => !block.lanes.includes(l));
      target = free.sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane))[0];
    }
    if (target !== lane) {
      const dir = target > lane ? 'ArrowRight' : 'ArrowLeft';
      for (let k = 0; k < Math.abs(target - lane); k++) actions.push({ t: at + k * 0.03, fn: () => tap(dir) });
      lane = target;
    }
    for (const s of w.spawns) {
      const hold = s.holdSec ?? 0;
      if (s.kind === 'hurdle') actions.push({ t: at, fn: () => tap('Space') });
      if (s.kind === 'beam') {
        actions.push({ t: at, fn: () => send('keydown', 'ArrowDown') });
        actions.push({ t: w.t + hold + 0.25, fn: () => send('keyup', 'ArrowDown') });
      }
      if (s.kind === 'crate') {
        actions.push({ t: at, fn: () => send('keydown', 'KeyW') });
        actions.push({ t: w.t + hold + 0.25, fn: () => send('keyup', 'KeyW') });
      }
      if (s.kind === 'orb') {
        const arm = s.lanes[0] === -1 ? 'KeyQ' : 'KeyE';
        actions.push({ t: at, fn: () => send('keydown', arm) });
        actions.push({ t: w.t + 0.3, fn: () => send('keyup', arm) });
      }
    }
  });
  actions.sort((a, b) => a.t - b.t);

  // Sync: watch the cue's countdown text.
  let last = '';
  const read = () => {
    const el = document.querySelector('.hud-cue');
    return el ? el.textContent.trim() : '';
  };
  let next = 0;
  const tick = () => {
    const sig = read();
    if (sig !== last) {
      const num = Number(sig.match(/(\d)\s*$/)?.[1] ?? NaN);
      const lastNum = Number(last.match(/(\d)\s*$/)?.[1] ?? NaN);
      const now = performance.now();
      if (sig && (!last || num > lastNum || sig.replace(/\d\s*$/, '') !== last.replace(/\d\s*$/, ''))) {
        // A new cue: some wave arrives in 2 s of game time. Before sync it is the first wave;
        // after, the wave whose cue time is nearest the current estimate.
        let idx = 0;
        if (Number.isFinite(A.offset)) {
          const g = gameNow();
          idx = waves.reduce((b, w, j) => (Math.abs(w.t - 2 - g) < Math.abs(waves[b].t - 2 - g) ? j : b), 0);
        }
        const w = waves[idx];
        if (w) A.offset = Math.min(A.offset, now - (w.t - 2) * 1000);
        A.cue = idx + 1;
        A.log.push(`cue ${idx} at ${gameNow().toFixed(2)} (wave t ${w?.t.toFixed(2)})`);
      } else if (sig && num === 1 && lastNum === 2) {
        const w = waves[A.cue - 1];
        if (w) A.offset = Math.min(A.offset, now - (w.t - 1) * 1000);
      }
      last = sig;
    }
    if (Number.isFinite(A.offset)) {
      const g = gameNow();
      while (next < actions.length && actions[next].t <= g) {
        actions[next].fn();
        next++;
      }
      if (next >= actions.length) A.done = true;
    }
  };
  setInterval(tick, 4);
  return { waves: waves.length, actions: actions.length };
});
