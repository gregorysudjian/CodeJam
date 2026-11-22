import * as THREE from 'three';
import { backdropFor } from './backdrop';

/**
 * The level's Montreal clip (backdrop.ts `video`) as the sky behind the 3D track: a
 * THREE.VideoTexture that scene.ts sets as the scene background, darkened (look.ts
 * VIDEO_BACKDROP). The current level's clip plays, and the next level's loads meanwhile, so a
 * portal switches to a clip that is ready.
 *
 * Fallbacks, all to the built-in scenery exactly: a level with no `video`, a clip that fails to
 * load, and graphics quality 2 (the "Low graphics" toggle, `game.gfx = low`, or the automatic
 * ladder's last step). While a level's clip is still loading, the clip already showing stays.
 */
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

export function createVideoBackdrop(): VideoBackdrop {
  const clips = new Map<string, Clip>(); // opened lazily: at quality 2 nothing ever loads
  let shown: Clip | null = null;
  const clipFor = (level: number): Clip | null => {
    const src = backdropFor(level).video;
    if (!src) return null;
    let clip = clips.get(src);
    if (!clip) {
      clip = openClip(src);
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
      if (!enabled) {
        if (clips.size > 0) closeAll();
        return null;
      }
      const want = clipFor(level);
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
    dispose: closeAll,
  };
}
