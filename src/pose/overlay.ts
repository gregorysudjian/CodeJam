// Owner: A. Debug overlay: live values next to their thresholds, and sliders that change the
// thresholds live. Plain DOM, refreshed at most a few times a second (AGENTS.md rule 6).
// Toggled with D during play (engine.ts); always shown on the ?dev=pose page (debug.ts).
import type { EngineSnapshot } from './engine';
import {
  DETECTION,
  DETECTION_DEFAULTS,
  COPIED_LABEL_MS,
  OVERLAY_REFRESH_MS,
  resetDetectionTuning,
  SLIDERS,
} from './tuning';

export interface Overlay {
  readonly element: HTMLElement;
  readonly visible: boolean;
  /** Shows the panel, fixed over the page by default or inside `parent` (debug page). */
  show(parent?: HTMLElement): void;
  hide(): void;
  toggle(): void;
  /** Refreshes the text if visible (throttled). Call once per processed frame. */
  update(): void;
}

const f = (v: number, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '–');
const flag = (on: boolean) => (on ? '■' : '□');

/** The overlay's text for a snapshot. Pure, so it is unit-tested. */
export function overlayText(s: EngineSnapshot): string {
  const K = DETECTION;
  const lines = [
    `pose · ${s.mode} · ${f(s.fps, 1)} FPS ${s.delegate} · bodies ${s.bodies}`,
    // If FPS is low: camera fps also low = the camera (light); camera fps fine = the model (GPU).
    s.camera || 'camera not started',
    s.calibration
      ? `calibrated  W ${f(s.calibration.W, 3)}  T ${f(s.calibration.T, 3)}`
      : 'not calibrated',
  ];
  if (s.calibrating) {
    lines.push(`calibrating: ${s.calibrating.step} ${Math.round(s.calibrating.progress * 100)}%`);
  }
  const d = s.detector;
  if (d) {
    const st = d.state;
    const r = d.readout;
    lines.push(
      `tracking ${flag(st.tracking)}  lane ${st.lane}  duck ${flag(st.ducking)}  air ${flag(st.airborne)}  L ${flag(st.leftArmUp)}  R ${flag(st.rightArmUp)}`,
    );
    if (d.mode === 'floor') {
      lines.push(
        `side   ${f(r.offsetW)} W   (lane on ±${f(K.LANE_ON_W)}, off ±${f(K.LANE_OFF_W)})`,
        `drop   ${f(r.dropT)} T   (squat > ${f(K.SQUAT_ON_T)}, up < ${f(K.SQUAT_OFF_T)}; rep at ${K.SQUAT_HOLD_MS} ms or when up)`,
        `jump   rise > ${f(K.JUMP_ON_T)} T (${f(K.JUMP_AFTER_SQUAT_ON_T)} T just after a squat), speed ${f(r.upSpeedT, 1)} > ${f(K.JUMP_MIN_UP_SPEED_T, 1)} T/s`,
      );
    }
    lines.push(
      `arms   L ${f(r.leftArmT)} R ${f(r.rightArmT)} T over nose (up > ${f(K.ARM_UP_ABOVE_NOSE_T)}, down < ${f(K.ARM_DOWN_ABOVE_NOSE_T)})`,
      `now    W ${f(r.W, 3)}  T ${f(r.T, 3)}`,
    );
  }
  if (s.events.length) lines.push(`moves  ${s.events.map((e) => e.type).join(' · ')}`);
  return lines.join('\n');
}

export function createOverlay(getSnapshot: () => EngineSnapshot): Overlay {
  const root = document.createElement('div');
  root.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:9999;width:380px;max-width:calc(100vw - 16px);' +
    'max-height:calc(100vh - 16px);overflow:auto;padding:8px 10px;border-radius:6px;' +
    'background:rgba(0,0,0,0.8);color:#fff;font:12px/1.45 monospace';

  const text = document.createElement('pre');
  text.style.cssText = 'margin:0 0 6px;white-space:pre-wrap';

  const sliders = document.createElement('div');
  const inputs = SLIDERS.map(([key, min, max, step]) => {
    const row = document.createElement('label');
    row.style.cssText =
      'display:grid;grid-template-columns:150px 1fr 44px;gap:6px;align-items:center';
    const name = document.createElement('span');
    name.textContent = key;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const value = document.createElement('span');
    const sync = () => {
      input.value = String(DETECTION[key]);
      value.textContent = String(DETECTION[key]);
    };
    input.oninput = () => {
      DETECTION[key] = Number(input.value);
      value.textContent = input.value;
    };
    // Give the keyboard back once the slider is released: the app ignores keys typed into inputs,
    // so K (keyboard fallback) and R (recalibrate) would otherwise do nothing after tuning.
    input.onchange = () => input.blur();
    row.append(name, input, value);
    sliders.append(row);
    return sync;
  });
  const syncAll = () => inputs.forEach((sync) => sync());

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:6px;margin-top:6px';
  const button = (label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText =
      'padding:2px 8px;border:1px solid #888;border-radius:4px;background:#222;color:#fff;font:inherit;cursor:pointer';
    b.onclick = () => {
      onClick();
      b.blur(); // so Space or Enter (game keys) do not click it again
    };
    buttons.append(b);
    return b;
  };
  button('Reset', () => {
    resetDetectionTuning();
    syncAll();
  });
  const copy = button('Copy changed values', () => {
    const changed = Object.fromEntries(
      Object.entries(DETECTION).filter(
        ([k, v]) => DETECTION_DEFAULTS[k as keyof typeof DETECTION_DEFAULTS] !== v,
      ),
    );
    const json = JSON.stringify(changed, null, 2);
    navigator.clipboard?.writeText(json).then(
      () => {
        copy.textContent = 'Copied';
        setTimeout(() => (copy.textContent = 'Copy changed values'), COPIED_LABEL_MS);
      },
      () => console.info('[pose] tuning changes', json),
    );
  });

  root.append(text, sliders, buttons);

  let visible = false;
  let lastRefresh = 0;

  const overlay: Overlay = {
    element: root,
    get visible() {
      return visible;
    },
    show(parent) {
      if (parent) {
        root.style.position = 'static';
        parent.append(root);
      } else {
        root.style.position = 'fixed';
        document.body.append(root);
      }
      visible = true;
      syncAll();
      lastRefresh = 0;
      overlay.update();
    },
    hide() {
      visible = false;
      root.remove();
    },
    toggle() {
      if (visible) overlay.hide();
      else overlay.show();
    },
    update() {
      if (!visible) return;
      const now = performance.now();
      if (now - lastRefresh < OVERLAY_REFRESH_MS) return;
      lastRefresh = now;
      text.textContent = overlayText(getSnapshot());
    },
  };
  return overlay;
}
