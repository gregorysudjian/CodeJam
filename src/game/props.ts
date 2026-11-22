import * as THREE from 'three';
import * as T from './tuning';

/**
 * Realistic-mode helpers for obstacles.ts (levels whose backdrop style is 'real'): the soft
 * contact shadow that sits on the road under every grounded object, so nothing floats over the
 * video. No shadow maps: one shared radial-gradient texture and material, a unit plane scaled to
 * each footprint. Gameplay never sees any of this.
 */
export interface ContactShadows {
  /**
   * A shadow for a footprint of `w` (across) by `d` (along the track, toward -z from z0),
   * centred at x. Add it to the object's group; it starts hidden (show it on 'real' levels).
   */
  make(w: number, d: number, x?: number, z0?: number): THREE.Mesh;
  dispose(): void;
}

export function createContactShadows(): ContactShadows {
  const tex = radialShadowTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: 0x000000,
    transparent: true,
    opacity: T.REAL_PROPS.shadowOpacity,
    depthWrite: false,
    fog: true,
  });
  const geo = new THREE.PlaneGeometry(1, 1);
  const s = T.REAL_PROPS.shadowSpread;
  return {
    make(w, d, x = 0, z0 = 0) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.scale.set(w + 2 * s, d + 2 * s, 1);
      m.position.set(x, T.REAL_PROPS.shadowY, z0 - d / 2);
      m.renderOrder = -1; // under the floor markers and the objects
      m.userData.realOnly = true;
      m.visible = false;
      return m;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}

/** White in the middle fading to nothing at the edge: the alpha the black material shows. */
function radialShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
