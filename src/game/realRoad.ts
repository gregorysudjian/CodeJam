import * as THREE from 'three';
import { clipOf } from './props';
import * as T from './tuning';

/** The road pattern follows the clip (tuning.ts REAL_CLIPS): cobblestones in the old town. */
const patternFor = (level: number): 'asphalt' | 'cobble' =>
  clipOf(level)?.road === 'cobble' ? 'cobble' : 'asphalt';

/**
 * The road under the track on 'real' levels (tuning.ts REAL_ROAD). The clips' road moves slower
 * than the game, so obstacles seemed to slide over it; this surface scrolls at exactly the game's
 * speed, in the floor grid's units, so the runner and the objects sit on it, and it fades into
 * the clip toward the vanishing point and at its sides. Drawn first of the see-through layers:
 * the lane paint, the runner's shadow (scene.ts catcher), the contact shadows and the floor
 * markers all land on it. Its colour is the clip's own road, sampled from the video (the scene
 * background) at each level and matched to the background's brightness.
 * Hidden on 'neon' levels and with Low graphics (no clip then): scene.ts passes level 0.
 */
export interface RealRoad {
  /** Once per frame: `dt` the frame's game seconds, `speed` world units per second, `level` the
   *  'real' level showing (1-based) or 0 for none (hidden). */
  update(dt: number, speed: number, level: number): void;
  setVisible(on: boolean): void;
  dispose(): void;
}

export function createRealRoad(scene: THREE.Scene): RealRoad {
  const R = T.REAL_ROAD;
  const length = R.near - R.far;
  const patterns = { asphalt: asphaltTexture(), cobble: cobbleTexture() };
  for (const t of Object.values(patterns)) t.repeat.set(R.width / R.tile, length / R.tile);
  const alpha = fadeTexture(R.fade, R.sideFade); // does not scroll: its own transform
  const mat = new THREE.MeshBasicMaterial({
    map: patterns.asphalt,
    alphaMap: alpha,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(R.width, length), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, R.y, (R.near + R.far) / 2);
  mesh.renderOrder = -10; // the first see-through layer: everything on the road draws over it
  mesh.visible = false;
  scene.add(mesh);

  // Road colour from the clip: a small canvas, the bottom-centre patch averaged.
  const probe = document.createElement('canvas');
  probe.width = 64;
  probe.height = 36;
  const pg = probe.getContext('2d', { willReadFrequently: true });
  const mean = {
    asphalt: patterns.asphalt.userData.mean as number,
    cobble: patterns.cobble.userData.mean as number,
  };
  let travel = 0;
  let shownLevel = 0;
  let sinceLevel = 0;
  let samples = 0;
  let forced: boolean | null = null; // setVisible

  const sample = (kind: 'asphalt' | 'cobble'): boolean => {
    const bg = scene.background;
    const video = bg instanceof THREE.VideoTexture ? (bg.image as HTMLVideoElement) : null;
    if (!pg || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
    try {
      pg.drawImage(video, 0, 0, probe.width, probe.height);
      const s = R.sample;
      const x0 = Math.floor(s.x0 * probe.width);
      const y0 = Math.floor(s.y0 * probe.height);
      const w = Math.max(1, Math.floor((s.x1 - s.x0) * probe.width));
      const h = Math.max(1, Math.floor((s.y1 - s.y0) * probe.height));
      const px = pg.getImageData(x0, y0, w, h).data;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < px.length; i += 4) {
        r += px[i]!;
        g += px[i + 1]!;
        b += px[i + 2]!;
      }
      const n = (px.length / 4) * 255;
      // The texture averages `mean`; the clip shows at the background's intensity (linear).
      const k = scene.backgroundIntensity / mean[kind];
      mat.color.setRGB(r / n, g / n, b / n, THREE.SRGBColorSpace).multiplyScalar(k);
      return true;
    } catch {
      return false; // a tainted or not yet decoded frame: keep the last colour
    }
  };

  return {
    update(dt, speed, level) {
      const on = forced ?? level > 0;
      mesh.visible = on && level > 0;
      if (!mesh.visible) {
        shownLevel = 0;
        return;
      }
      if (level !== shownLevel) {
        shownLevel = level;
        sinceLevel = 0;
        samples = 0;
        const kind = patternFor(level);
        if (mat.map !== patterns[kind]) {
          mat.map = patterns[kind];
          mat.needsUpdate = true;
        }
        if (sample(kind)) samples = 0; // a first guess now; refined below
      }
      sinceLevel += dt;
      const due = R.resampleSec[samples];
      if (due !== undefined && sinceLevel >= due) {
        if (sample(patternFor(level))) samples++;
      }
      // The world moves toward +z; the same convention as the floor grid (scene.ts).
      travel += speed * dt;
      mat.map!.offset.y = (((travel / R.tile) % 1) + 1) % 1;
    },
    setVisible(on) {
      forced = on ? null : false;
      if (!on) mesh.visible = false;
    },
    dispose() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mat.dispose();
      alpha.dispose();
      for (const t of Object.values(patterns)) t.dispose();
    },
  };
}

/** Deterministic noise, so every round's road looks the same. */
const rnd = (i: number): number => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

function canvasTexture(c: HTMLCanvasElement, mean: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.userData.mean = mean;
  return t;
}

/** Fine asphalt grain: light grey with darker and lighter aggregate specks (tileable). */
function asphaltTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 214 + (rnd(i) - 0.5) * 46 + (rnd(i * 7 + 3) > 0.985 ? 30 : 0);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(255, v));
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(c, 0.84);
}

/** Cobblestones in staggered rows with dark joints (Old Montreal, level 2), tileable. */
function cobbleTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  // Soft joints and stones of uneven size and shade, so the strip blends into the clip's street.
  g.fillStyle = 'rgb(150,150,150)'; // the joints
  g.fillRect(0, 0, size, size);
  const rows = 9;
  const cols = 6;
  const h = size / rows;
  const w = size / cols;
  for (let r = 0; r < rows; r++)
    for (let k = -1; k <= cols; k++) {
      const i = r * 31 + k + 7;
      const x = k * w + (r % 2 ? w / 2 : 0) + (rnd(i + 3) - 0.5) * 6;
      const sw = w * (0.8 + rnd(i + 4) * 0.12);
      const sh = h * (0.74 + rnd(i + 5) * 0.12);
      const shade = 208 + Math.floor((rnd(i) - 0.5) * 60);
      g.fillStyle = `rgb(${shade},${shade},${shade})`;
      g.beginPath();
      g.roundRect(x + (w - sw) / 2, r * h + (h - sh) / 2, sw, sh, 9);
      g.fill();
    }
  // Stones from k = -1 to cols overlap both edges, so the pattern tiles across.
  return canvasTexture(c, 0.78);
}

/** Opaque near the runner (the texture's bottom), fading to 0 over the far share and the sides. */
function fadeTexture(far: number, side: number): THREE.CanvasTexture {
  const w = 64;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const smooth = (k: number): number => {
    const x = Math.min(1, Math.max(0, k));
    return x * x * (3 - 2 * x);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const along = 1 - y / (h - 1); // canvas top = far end of the plane
      const across = Math.min(x, w - 1 - x) / (w - 1);
      const a = smooth((1 - along) / far) * smooth(across / side);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255);
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.userData.mean = 1;
  return t;
}
