import * as THREE from 'three';
import { backdropFor } from './backdrop';
import { VIDEO_BACKDROP } from './look';
import * as T from './tuning';

/**
 * The level's Montreal clip (backdrop.ts `video`) as the sky behind the 3D track: a
 * THREE.VideoTexture that scene.ts sets as the scene background, darkened (look.ts
 * VIDEO_BACKDROP). The current level's clip plays, and the next level's loads meanwhile, so a
 * portal switches to a clip that is ready.
 *
 * Fallbacks, all to the built-in scenery exactly: a level with no `video`, a clip that fails to
 * load, and graphics quality 2 (the "Low graphics" toggle, `game.gfx = low`, or the automatic
 * ladder's last step). While a level's clip is still loading, the clip already showing stays.
 *
 * Speed (backdropRate): on a 'real' level the clip plays at the rate that makes its road move under
 * the runner at the game's speed (tuning.ts REAL_CAMERA.roadSpeed), so obstacles don't slide on
 * it. `?dev=calib` shows the numbers and a marker painted on the road at the game's speed, and
 * [ and ] change the shown clip's road speed live (\ resets it).
 */

/**
 * The clip's playbackRate at game speed `speed` (world units per second). With the clip's
 * `roadSpeed` (a 'real' level): speed / roadSpeed within REAL_CAMERA's limits. Without: slower
 * levels play slower, from VIDEO_BACKDROP.rateMin at SPEED_MIN to 1x at SPEED_MAX.
 */
export function clipRate(speed: number, roadSpeed?: number): number {
  if (roadSpeed && roadSpeed > 0) {
    const R = T.REAL_CAMERA;
    return Math.min(R.rateMax, Math.max(R.rateMin, speed / roadSpeed));
  }
  const k = Math.min(1, Math.max(0, (speed - T.SPEED_MIN) / (T.SPEED_MAX - T.SPEED_MIN)));
  return VIDEO_BACKDROP.rateMin + (1 - VIDEO_BACKDROP.rateMin) * k;
}

const calibOn =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('dev') === 'calib';
const calibRoad = new Map<string, number>(); // ?dev=calib: road speeds changed live, by clip
const calibNow = { clip: '', real: false, speed: 0, rate: 1, at: 0 };

/** A clip's key in REAL_CAMERA.roadSpeed: its file name ('/media/x.mp4' → 'x.mp4'). */
export function clipName(src: string): string {
  return src.slice(src.lastIndexOf('/') + 1);
}

function roadSpeedFor(clip: string): number | undefined {
  return calibRoad.get(clip) ?? T.REAL_CAMERA.roadSpeed[clip];
}

/**
 * For scene.ts, each frame a clip shows: the playbackRate for `tex` (a texture from
 * createVideoBackdrop) at game speed `speed`.
 */
export function backdropRate(tex: THREE.Texture, speed: number): number {
  const clip = (tex.userData.clip as string | undefined) ?? '';
  const real = tex.userData.real === true;
  const rate = clipRate(speed, real ? roadSpeedFor(clip) : undefined);
  if (calibOn) Object.assign(calibNow, { clip, real, speed, rate, at: performance.now() });
  return rate;
}
export interface ClipState {
  readonly failed: boolean;
  readonly ready: boolean;
}

/**
 * Which clip to show: the level's own once it has a frame; while it loads, the one already
 * showing (a portal never shows a blank); none if the level has no clip or it failed.
 */
export function clipToShow<C extends ClipState>(want: C | null, shown: C | null): C | null {
  if (!want || want.failed) return null;
  if (want.ready) return want;
  return shown && !shown.failed ? shown : null;
}

interface Clip extends ClipState {
  readonly src: string;
  readonly video: HTMLVideoElement;
  readonly texture: THREE.VideoTexture;
  failed: boolean;
}

function openClip(src: string): Clip {
  const video = document.createElement('video');
  video.muted = true; // always: the game has its own sound
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  const clip: Clip = {
    src,
    video,
    texture,
    failed: false,
    get ready() {
      return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    },
  };
  video.addEventListener(
    'error',
    () => {
      clip.failed = true;
      console.warn(`[game] backdrop video ${src} did not load: built-in scenery instead`);
    },
    { once: true },
  );
  video.src = src;
  return clip;
}

function closeClip(clip: Clip): void {
  clip.video.pause();
  clip.texture.dispose();
  clip.video.removeAttribute('src');
  clip.video.load(); // frees the decoder and the buffered data
}

export interface VideoBackdrop {
  /**
   * Once per frame. `level`: the level the runner is in (1-based); `playing`: the clip runs (it
   * stands still while the game is paused); `enabled`: false at graphics quality 2.
   * Returns the texture to show behind the scene, or null for the built-in scenery.
   */
  update(level: number, playing: boolean, enabled: boolean): THREE.VideoTexture | null;
  dispose(): void;
}

/**
 * `?dev=calib`: the shown clip's numbers, and stripes painted across the track every 4 units that
 * move at the game's speed (drawn through the chase camera from tuning.ts, without its sway or
 * streak zoom). Adjust the road speed until the clip's road moves with the stripes.
 */
function createCalibOverlay(isPlaying: () => boolean): () => void {
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:9999;padding:6px 8px;background:rgba(0,0,0,.75);' +
    'color:#fff;font:12px/1.4 monospace;white-space:pre;pointer-events:none';
  const cv = document.createElement('canvas');
  cv.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;z-index:9998;pointer-events:none';
  document.body.append(cv, box);
  const g = cv.getContext('2d');
  const step = T.REAL_CAMERA.calibStep;
  const onKey = (e: KeyboardEvent): void => {
    const clip = calibNow.clip;
    if (!clip) return;
    const cur = roadSpeedFor(clip) ?? calibNow.speed;
    const round = (x: number): number => Math.round(Math.max(step, x) * 100) / 100;
    if (e.code === 'BracketLeft') calibRoad.set(clip, round(cur - step));
    else if (e.code === 'BracketRight') calibRoad.set(clip, round(cur + step));
    else if (e.code === 'Backslash') calibRoad.delete(clip);
  };
  window.addEventListener('keydown', onKey);
  // The chase camera (no sway): forward and up, in the y-z plane.
  const P = T.CAMERA_POS;
  const fy = T.CAMERA_LOOK.y - P.y;
  const fz = T.CAMERA_LOOK.z - P.z;
  const fn = Math.hypot(fy, fz);
  let road = 0; // how far the stripes have moved
  let last = performance.now();
  let raf = 0;
  const frame = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const live = now - calibNow.at < 250; // a clip is showing
    if (live && isPlaying()) road += calibNow.speed * dt;
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
    if (g) {
      g.clearRect(0, 0, W, H);
      const k = Math.min(
        1,
        Math.max(0, (calibNow.speed - T.SPEED_MIN) / (T.SPEED_MAX - T.SPEED_MIN)),
      );
      const tan = Math.tan(((T.CAMERA_FOV + T.FOV_KICK_SPEED * k) * Math.PI) / 360);
      const at = (x: number, z: number): [number, number] | null => {
        const dy = -P.y;
        const dz = z - P.z;
        const depth = (dy * fy + dz * fz) / fn;
        if (depth < 0.5) return null;
        const up = (-dy * fz + dz * fy) / fn;
        return [
          W / 2 + ((x - P.x) / depth / (tan * (W / H))) * (W / 2),
          H / 2 - (up / depth / tan) * (H / 2),
        ];
      };
      g.strokeStyle = '#ff2bd6';
      g.lineWidth = 3;
      const half = T.LANE_WIDTH * 1.5;
      for (let i = 0; live && i < 14; i++) {
        const z = (road % 4) + 2 - 4 * i;
        const a = at(-half, z);
        const b = at(half, z);
        if (!a || !b) continue;
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
      }
    }
    const clip = calibNow.clip;
    const rs = clip ? roadSpeedFor(clip) : undefined;
    const clips = Object.keys(T.REAL_CAMERA.roadSpeed)
      .concat([...calibRoad.keys()])
      .filter((x, i, all) => all.indexOf(x) === i);
    box.textContent = live
      ? `CALIB ${clip} ${calibNow.real ? 'real' : 'neon'}\n` +
        `game ${calibNow.speed.toFixed(1)} u/s  road ${rs?.toFixed(2) ?? '-'} u/s\n` +
        `rate ${calibNow.rate.toFixed(2)}` +
        (rs ? `  (wants ${(calibNow.speed / rs).toFixed(2)})\n` : '\n') +
        `[ / ] road -/+${step}   \\ reset\n` +
        `roadSpeed: { ${clips.map((c) => `'${c}': ${roadSpeedFor(c)}`).join(', ')} }`
      : 'CALIB: no clip showing';
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    box.remove();
    cv.remove();
  };
}

export function createVideoBackdrop(): VideoBackdrop {
  const clips = new Map<string, Clip>(); // opened lazily: at quality 2 nothing ever loads
  let shown: Clip | null = null;
  let playingNow = false;
  const closeCalib = calibOn ? createCalibOverlay(() => playingNow) : null;
  const clipFor = (level: number): Clip | null => {
    const src = backdropFor(level).video;
    if (!src) return null;
    let clip = clips.get(src);
    if (!clip) {
      clip = openClip(src);
      clip.texture.userData.horizon = backdropFor(level).horizon; // scene.ts lines it up
      clip.texture.userData.clip = clipName(src); // backdropRate
      clip.texture.userData.real = backdropFor(level).style === 'real';
      clip.texture.userData.level = level; // scene.ts reads the level's style and light from it
      clips.set(src, clip);
    }
    return clip;
  };
  const closeAll = (): void => {
    for (const c of clips.values()) closeClip(c);
    clips.clear();
    shown = null;
  };

  return {
    update(level, playing, enabled) {
      playingNow = playing;
      if (!enabled) {
        if (clips.size > 0) closeAll();
        return null;
      }
      const want = clipFor(level);
      // A clip can play on several levels: it carries the one it is playing for now.
      if (want) {
        want.texture.userData.level = level;
        want.texture.userData.real = backdropFor(level).style === 'real';
      }
      const next = clipFor(level + 1); // loads during this level
      const pick = clipToShow(want, shown);
      if (pick !== shown) shown?.video.pause();
      shown = pick;
      // Earlier levels' clips are done with: free them.
      for (const c of clips.values()) {
        if (c === shown || c === want || c === next) continue;
        closeClip(c);
        clips.delete(c.src);
      }
      if (shown) {
        if (playing && shown.video.paused)
          shown.video.play().catch(() => {}); // muted: allowed
        else if (!playing && !shown.video.paused) shown.video.pause();
      }
      return shown?.texture ?? null;
    },
    dispose() {
      closeAll();
      closeCalib?.();
    },
  };
}
