import * as THREE from 'three';
import { clipOf } from './props';
import * as T from './tuning';

/** The road pattern follows the clip (tuning.ts REAL_CLIPS): cobblestones in the old town. */
type Pattern = 'asphalt' | 'cobble';
const patternFor = (level: number): Pattern =>
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
  for (const [k, t] of Object.entries(patterns))
    t.repeat.set(R.width / R.tile[k as Pattern], length / R.tile[k as Pattern]);
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
      const tile = R.tile[patternFor(level)];
      mat.map!.offset.y = (((travel / tile) % 1) + 1) % 1;
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

/** A tileable road texture; `userData.mean` is its measured average brightness (0 to 1), so the
 *  clip's sampled road colour divided by it gives the strip the clip's own colour. */
function canvasTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  const px = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += px[i]!;
  t.userData.mean = sum / (px.length / 4) / 255;
  return t;
}

/** Blurs a tile without seams: drawn 3 x 3 with the filter, the middle copy kept. */
function blurTile(c: HTMLCanvasElement, px: number): void {
  const s = c.width;
  const big = document.createElement('canvas');
  big.width = big.height = s * 3;
  const bg = big.getContext('2d')!;
  bg.filter = `blur(${px}px)`;
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) bg.drawImage(c, x * s, y * s);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, s, s);
  g.drawImage(big, s, s, s, s, 0, 0, s, s);
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
  return canvasTexture(c);
}

/** Cobblestones in staggered rows with dark joints (Old Montreal, level 2), tileable. */
function cobbleTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  // Like the clip's street: worn stones of uneven size and shade, lit a little from above, in dark
  // soft joints, slightly blurred (the clip is video, not a sharp texture).
  g.fillStyle = 'rgb(108,108,108)'; // the joints
  g.fillRect(0, 0, size, size);
  const rows = 10; // even: the staggered rows meet seamlessly at the tile edge
  const cols = 6;
  const h = size / rows;
  const w = size / cols;
  for (let r = 0; r < rows; r++)
    for (let k = -1; k <= cols; k++) {
      const i = r * 31 + ((k + cols) % cols) + 7; // k = -1 and cols - 1 are the same stone
      const x = k * w + (r % 2 ? w / 2 : 0) + (rnd(i + 3) - 0.5) * 8;
      // Hand-laid, not a grid: uneven sizes and a slight tilt per stone.
      const sw = w * (0.72 + rnd(i + 4) * 0.22);
      const sh = h * (0.66 + rnd(i + 5) * 0.22);
      const x0 = x + (w - sw) / 2;
      const y0 = r * h + (h - sh) / 2;
      const shade = 196 + Math.floor((rnd(i) - 0.5) * 70);
      const grad = g.createRadialGradient(
        x0 + sw * 0.4,
        y0 + sh * 0.35,
        0,
        x0 + sw * 0.5,
        y0 + sh * 0.5,
        sw * 0.62,
      );
      grad.addColorStop(0, `rgb(${shade + 22},${shade + 22},${shade + 22})`);
      grad.addColorStop(1, `rgb(${shade - 38},${shade - 38},${shade - 38})`);
      g.fillStyle = grad;
      g.save();
      g.translate(x0 + sw / 2, y0 + sh / 2);
      g.rotate((rnd(i + 6) - 0.5) * 0.14);
      g.beginPath();
      g.roundRect(-sw / 2, -sh / 2, sw, sh, Math.min(sw, sh) * (0.25 + rnd(i + 8) * 0.2));
      g.fill();
      g.restore();
    }
  // Fine grain over stones and joints alike, so no stone is a flat colour.
  const img = g.getImageData(0, 0, size, size);
  for (let p = 0; p < size * size; p++) {
    const n = (rnd(p + 101) - 0.5) * 26;
    for (let ch = 0; ch < 3; ch++)
      img.data[p * 4 + ch] = Math.max(0, Math.min(255, img.data[p * 4 + ch]! + n));
  }
  g.putImageData(img, 0, 0);
  blurTile(c, 1.4);
  // Stones from k = -1 to cols overlap both edges, so the pattern tiles across.
  return canvasTexture(c);
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
