import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import * as T from './tuning';

/** A neon colour pushed above 1.0 so only neon parts pass the bloom threshold. */
export function neon(hex: number, boost = T.NEON_BOOST): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(boost);
}

export interface Stage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Scroll the world to `distance` and place the camera behind `playerX`. */
  update(distance: number, playerX: number, dt: number): void;
  shake(): void;
  render(): void;
  dispose(): void;
}

function gridTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = `#${new THREE.Color(T.COLOR_FLOOR).getHexString()}`;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = `#${new THREE.Color(T.COLOR_GRID).getHexString()}`;
  g.lineWidth = 3;
  g.strokeRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Positive modulo, for scrolling repeated scenery. */
const wrap = (x: number, m: number): number => ((x % m) + m) % m;

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !T.BLOOM_ENABLED, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, T.MAX_PIXEL_RATIO));
  renderer.setClearColor(T.COLOR_BG, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(T.COLOR_BG);
  scene.fog = new THREE.Fog(T.COLOR_BG, T.FOG_NEAR, T.FOG_FAR);

  const camera = new THREE.PerspectiveCamera(T.CAMERA_FOV, 16 / 9, 0.1, 400);
  const look = new THREE.Vector3(T.CAMERA_LOOK.x, T.CAMERA_LOOK.y, T.CAMERA_LOOK.z);

  scene.add(new THREE.HemisphereLight(0x9fb3cc, 0x05070b, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 9, 7);
  scene.add(sun);

  /* Floor: a scrolling grid. */
  const halfTrack = (3 * T.LANE_WIDTH) / 2;
  const floorWidth = 90;
  const zNear = 14; // scenery recycles from here (behind the camera) ...
  const zFar = zNear - T.TRACK_LENGTH; // ... to here
  const gridTex = gridTexture();
  gridTex.repeat.set(floorWidth / T.GRID_TILE, T.TRACK_LENGTH / T.GRID_TILE);
  gridTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorWidth, T.TRACK_LENGTH),
    new THREE.MeshBasicMaterial({ map: gridTex }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = (zNear + zFar) / 2;
  scene.add(floor);

  // The track itself is a slightly lit strip over the grid.
  const trackStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(3 * T.LANE_WIDTH, T.TRACK_LENGTH),
    new THREE.MeshBasicMaterial({ color: T.COLOR_TRACK, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  trackStrip.rotation.x = -Math.PI / 2;
  trackStrip.position.set(0, 0.004, floor.position.z);
  scene.add(trackStrip);

  /* Lane lines: solid lime edges, dashed lime dividers. */
  const limeMat = new THREE.MeshBasicMaterial({ color: neon(T.COLOR_LIME, T.NEON_BOOST * 0.8) });
  const edgeGeo = new THREE.BoxGeometry(0.06, 0.03, T.TRACK_LENGTH);
  for (const x of [-halfTrack, halfTrack]) {
    const edge = new THREE.Mesh(edgeGeo, limeMat);
    edge.position.set(x, 0.015, floor.position.z);
    scene.add(edge);
  }
  const dashGeo = new THREE.BoxGeometry(0.06, 0.02, T.DASH_SPACING * 0.45);
  const dashMat = new THREE.MeshBasicMaterial({ color: neon(T.COLOR_LIME, T.NEON_BOOST * 0.45) });
  const dashesPerLine = Math.ceil(T.TRACK_LENGTH / T.DASH_SPACING);
  const dashSpan = dashesPerLine * T.DASH_SPACING;
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashesPerLine * 2);
  dashes.frustumCulled = false;
  scene.add(dashes);

  /* Gates: neon arches the runner passes through. */
  const archSpan = T.ARCH_COUNT * T.ARCH_SPACING;
  const archHalf = halfTrack + 1.1;
  const postGeo = new THREE.BoxGeometry(0.1, T.ARCH_HEIGHT, 0.1);
  const barGeo = new THREE.BoxGeometry(archHalf * 2 + 0.1, 0.1, 0.1);
  const archMat = new THREE.MeshBasicMaterial({ color: neon(T.COLOR_LIME, T.NEON_BOOST * 0.4) });
  const archDimMat = new THREE.MeshStandardMaterial({ color: 0x141b26, roughness: 0.6, metalness: 0.4 });
  const plinthGeo = new THREE.BoxGeometry(0.7, 0.5, 0.7);
  const arches: THREE.Group[] = [];
  for (let i = 0; i < T.ARCH_COUNT; i++) {
    const a = new THREE.Group();
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, archMat);
      post.position.set(s * archHalf, T.ARCH_HEIGHT / 2, 0);
      const plinth = new THREE.Mesh(plinthGeo, archDimMat);
      plinth.position.set(s * archHalf, 0.25, 0);
      a.add(post, plinth);
    }
    const bar = new THREE.Mesh(barGeo, archMat);
    bar.position.y = T.ARCH_HEIGHT;
    a.add(bar);
    arches.push(a);
    scene.add(a);
  }

  /* Skyline: dark towers on both sides with neon caps, scrolling for parallax. */
  const towerCount = T.TOWER_COUNT;
  const towerSpan = T.TRACK_LENGTH;
  const towerGeo = new THREE.BoxGeometry(1, 1, 1);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x0e1420, roughness: 0.8, metalness: 0.2 });
  const capGeo = new THREE.BoxGeometry(1.04, 0.12, 1.04);
  const capMat = new THREE.MeshBasicMaterial({ color: neon(T.MOVE_COLOR.sidestep, T.NEON_BOOST * 0.5) });
  const capMat2 = new THREE.MeshBasicMaterial({ color: neon(T.MOVE_COLOR.armsUp, T.NEON_BOOST * 0.5) });
  const towers = new THREE.InstancedMesh(towerGeo, towerMat, towerCount);
  const capsA = new THREE.InstancedMesh(capGeo, capMat, towerCount);
  const capsB = new THREE.InstancedMesh(capGeo, capMat2, towerCount);
  for (const m of [towers, capsA, capsB]) {
    m.frustumCulled = false;
    scene.add(m);
  }
  // Deterministic pseudo-random layout so every round looks the same.
  const towerInfo = Array.from({ length: towerCount }, (_, i) => {
    const r1 = wrap(Math.sin(i * 12.9898) * 43758.5453, 1);
    const r2 = wrap(Math.sin(i * 78.233) * 12345.678, 1);
    const side = i % 2 === 0 ? -1 : 1;
    return {
      x: side * (halfTrack + 13 + r1 * 22),
      z0: (i / towerCount) * towerSpan,
      w: 2 + r2 * 3,
      h: 3 + r1 * r2 * 22 + r2 * 4,
      capB: r2 > 0.62,
    };
  });

  /* Horizon glow at the vanishing point. */
  const glowTex = glowTexture();
  const horizon = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 60),
    new THREE.MeshBasicMaterial({
      map: glowTex,
      color: new THREE.Color(T.COLOR_LIME).multiplyScalar(0.22),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  horizon.position.set(0, 4, zFar + 10);
  scene.add(horizon);

  /* Post-processing. */
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (T.BLOOM_ENABLED) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), T.BLOOM_STRENGTH, T.BLOOM_RADIUS, T.BLOOM_THRESHOLD);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  const resize = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const pr = Math.min(window.devicePixelRatio || 1, T.MAX_PIXEL_RATIO);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer?.setPixelRatio(pr);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    // Keep the three lanes in view on narrow (portrait) screens.
    camera.fov = w / h < 1 ? T.CAMERA_FOV * 1.35 : T.CAMERA_FOV;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let shakeAmount = 0;
  let camX = 0;
  const m4 = new THREE.Matrix4();

  return {
    scene,
    camera,
    update(distance, playerX, dt) {
      gridTex.offset.y = wrap(distance / T.GRID_TILE, 1);

      for (let i = 0; i < dashesPerLine; i++) {
        const z = zNear - wrap(i * T.DASH_SPACING - distance, dashSpan);
        m4.makeTranslation(-T.LANE_WIDTH / 2, 0.012, z);
        dashes.setMatrixAt(i * 2, m4);
        m4.makeTranslation(T.LANE_WIDTH / 2, 0.012, z);
        dashes.setMatrixAt(i * 2 + 1, m4);
      }
      dashes.instanceMatrix.needsUpdate = true;

      for (let i = 0; i < arches.length; i++) {
        arches[i]!.position.z = zNear - wrap(i * T.ARCH_SPACING - distance + 10, archSpan);
      }

      const parallax = distance * T.TOWER_PARALLAX;
      for (let i = 0; i < towerCount; i++) {
        const t = towerInfo[i]!;
        const z = zNear - wrap(t.z0 - parallax, towerSpan);
        m4.makeScale(t.w, t.h, t.w).setPosition(t.x, t.h / 2, z);
        towers.setMatrixAt(i, m4);
        m4.makeScale(t.w, 1, t.w).setPosition(t.x, t.h, z);
        (t.capB ? capsB : capsA).setMatrixAt(i, m4);
        m4.makeScale(0, 0, 0);
        (t.capB ? capsA : capsB).setMatrixAt(i, m4);
      }
      towers.instanceMatrix.needsUpdate = true;
      capsA.instanceMatrix.needsUpdate = true;
      capsB.instanceMatrix.needsUpdate = true;

      camX += (playerX * T.CAMERA_FOLLOW_X - camX) * (1 - Math.exp(-6 * dt));
      shakeAmount *= Math.exp(-T.SHAKE_DECAY * dt);
      const sx = (Math.random() - 0.5) * shakeAmount;
      const sy = (Math.random() - 0.5) * shakeAmount;
      camera.position.set(T.CAMERA_POS.x + camX + sx, T.CAMERA_POS.y + sy, T.CAMERA_POS.z);
      camera.lookAt(look.x + camX * 0.5, look.y, look.z);
    },
    shake() {
      if (!reduceMotion) shakeAmount = T.SHAKE_AMPLITUDE;
    },
    render() {
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
    dispose() {
      ro.disconnect();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments || o instanceof THREE.InstancedMesh) {
          o.geometry.dispose();
          const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            const map = (m as THREE.MeshBasicMaterial).map;
            map?.dispose();
            m.dispose();
          }
        }
      });
      gridTex.dispose();
      glowTex.dispose();
      bloom?.dispose();
      composer?.dispose();
      renderer.dispose();
    },
  };
}
