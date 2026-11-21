import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { introCamera, type CameraPose } from './intro';
import * as L from './look';
import type { Quality } from './quality';
import * as T from './tuning';
import { ZONES, zoneIndexAt, zoneMix, zonePresence, type ZoneMix, type ZonePlan } from './world';

/** A neon colour pushed above 1.0 so only neon parts pass the bloom threshold. */
export function neon(hex: number, boost = T.NEON_BOOST): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(boost);
}

export interface StageFrame {
  distance: number; // world scroll
  playerX: number; // the camera follows part of it
  dt: number; // visual seconds (0 while paused)
  realDt: number; // for fades that run while paused
  speed: number; // units per second, for the field-of-view kick
  fever: number; // streak tier 0 to 3: lane pulse, speed lines
  dim: boolean; // paused: darken the scene
  /** Intro fly-in progress, 0 (in front of the runner) to 1 (chase camera). */
  intro: number;
}

export interface Stage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  update(f: StageFrame): void;
  shake(): void;
  /** A combo milestone: a shockwave from the runner, a lane flash, a field-of-view punch. */
  milestone(): void;
  /** Quality ladder (quality.ts): 1 drops the pixel ratio to 1, 2 also drops bloom and extras. */
  setQuality(q: Quality): void;
  /**
   * Compiles every shader the round can need, now, also for objects still hidden (pooled
   * obstacles, speed lines, the finish arch, the end banner, the other zones' scenery). They
   * would otherwise compile mid-round, in the frame they first show. Two variants each: bloom
   * renders into a target (linear output), quality 2 straight to the screen (sRGB output), so a
   * step down to 2 does not recompile every material at once on a laptop that is already
   * struggling.
   */
  precompile(): void;
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

/** Lit windows for the towers: a dark facade with a deterministic scatter of warm and cool lights. */
function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000000';
  g.fillRect(0, 0, c.width, c.height);
  const cols = 4;
  const rows = 32;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const r = wrap(Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233) * 43758.5453, 1);
      if (r < 0.55) continue;
      g.fillStyle = r > 0.9 ? '#ffd9a0' : r > 0.75 ? '#7fe9ff' : '#3a4a66';
      g.fillRect(x * 16 + 4, y * 8 + 2, 8, 4);
    }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Positive modulo, for scrolling repeated scenery. */
const wrap = (x: number, m: number): number => ((x % m) + m) % m;
/** Deterministic pseudo-random 0 to 1 per index, so every round looks the same. */
const rnd = (i: number, salt: number): number => wrap(Math.sin(i * salt) * 43758.5453, 1);

export function createStage(canvas: HTMLCanvasElement, plan: ZonePlan): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !T.BLOOM_ENABLED,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, T.MAX_PIXEL_RATIO));
  renderer.setClearColor(T.COLOR_BG, 1);

  const scene = new THREE.Scene();
  const bgColor = new THREE.Color(T.COLOR_BG);
  scene.background = bgColor;
  const fog = new THREE.Fog(T.COLOR_BG, T.FOG_NEAR, T.FOG_FAR);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(T.CAMERA_FOV, 16 / 9, 0.1, 400);
  scene.add(camera); // so its child, the pause overlay, renders

  // Pause overlay: a dark sheet just in front of the camera.
  const dimMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const dimSheet = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), dimMat);
  dimSheet.position.z = -0.2;
  dimSheet.renderOrder = 999;
  dimSheet.visible = false;
  camera.add(dimSheet);
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
  const span = T.TRACK_LENGTH;
  const gridTex = gridTexture();
  gridTex.repeat.set(floorWidth / T.GRID_TILE, T.TRACK_LENGTH / T.GRID_TILE);
  gridTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const floorMat = new THREE.MeshBasicMaterial({ map: gridTex });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorWidth, T.TRACK_LENGTH), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = (zNear + zFar) / 2;
  scene.add(floor);

  // The track itself is a slightly lit strip over the grid.
  const trackStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(3 * T.LANE_WIDTH, T.TRACK_LENGTH),
    new THREE.MeshBasicMaterial({
      color: T.COLOR_TRACK,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  trackStrip.rotation.x = -Math.PI / 2;
  trackStrip.position.set(0, 0.004, floor.position.z);
  scene.add(trackStrip);

  /* Lane lines: solid lime edges, dashed lime dividers. They never change colour. */
  const limeMat = new THREE.MeshBasicMaterial({ color: neon(T.COLOR_LIME, T.NEON_BOOST * 0.8) });
  const limeBase = new THREE.Color(T.COLOR_LIME);
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

  const m4 = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const instanced = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    count: number,
  ): THREE.InstancedMesh => {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.frustumCulled = false;
    for (let i = 0; i < count; i++) m.setMatrixAt(i, hidden);
    scene.add(m);
    return m;
  };
  /** World distance of a scrolled piece at scene z (objects ahead have negative z). */
  const worldAt = (distance: number, z: number): number => distance - z;
  /** Recycled z of piece i spaced `spacing` apart, scrolling at `rate` times the track. */
  const recycledZ = (i: number, spacing: number, distance: number, rate = 1): number =>
    zNear - wrap(i * spacing - distance * rate, span);
  const zoneIndex = (name: (typeof ZONES)[number]): number => ZONES.indexOf(name);
  const CITY = zoneIndex('city');
  const TUNNEL = zoneIndex('tunnel');
  const BRIDGE = zoneIndex('bridge');
  const FINALE = zoneIndex('finale');
  /** True if zone i reaches anywhere into the recycled stretch at this distance. */
  const zoneInView = (i: number, distance: number): boolean => {
    const start = plan.starts[i] ?? Infinity;
    const end = plan.starts[i + 1] ?? Infinity;
    return start < worldAt(distance, zFar) && end > worldAt(distance, zNear);
  };

  /* City and finale: neon gates the runner passes through. */
  const archSpan = T.ARCH_COUNT * T.ARCH_SPACING;
  const archHalf = halfTrack + 1.1;
  const postGeo = new THREE.BoxGeometry(0.1, T.ARCH_HEIGHT, 0.1);
  const barGeo = new THREE.BoxGeometry(archHalf * 2 + 0.1, 0.1, 0.1);
  const archMat = new THREE.MeshBasicMaterial({ color: neon(T.COLOR_LIME, T.NEON_BOOST * 0.4) });
  // Lambert, not standard: the same look on these dark surfaces, cheaper per pixel.
  const archDimMat = new THREE.MeshLambertMaterial({ color: 0x141b26 });
  const plinthGeo = new THREE.BoxGeometry(0.7, 0.5, 0.7);
  // Instanced: 3 draw calls for every gate instead of 5 per gate.
  const archPosts = instanced(postGeo, archMat, T.ARCH_COUNT * 2);
  const archPlinths = instanced(plinthGeo, archDimMat, T.ARCH_COUNT * 2);
  const archBars = instanced(barGeo, archMat, T.ARCH_COUNT);

  /* City and finale: dark towers with lit windows and neon caps, scrolling for parallax. */
  const towerCount = T.TOWER_COUNT;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const winTex = windowTexture();
  const towerMat = new THREE.MeshLambertMaterial({
    color: 0x0e1420,
    emissive: 0xffffff,
    emissiveMap: winTex,
    emissiveIntensity: 0.55,
  });
  const capGeo = new THREE.BoxGeometry(1.04, 0.12, 1.04);
  const capMat = new THREE.MeshBasicMaterial({ color: neon(T.MOVE_COLOR.sidestep, 0.85) });
  const capMat2 = new THREE.MeshBasicMaterial({ color: neon(T.MOVE_COLOR.armsUp, 0.85) });
  const towers = instanced(boxGeo, towerMat, towerCount);
  const capsA = instanced(capGeo, capMat, towerCount);
  const capsB = instanced(capGeo, capMat2, towerCount);
  const towerInfo = Array.from({ length: towerCount }, (_, i) => {
    const r1 = rnd(i, 12.9898);
    const r2 = rnd(i, 78.233);
    const side = i % 2 === 0 ? -1 : 1;
    return {
      x: side * (halfTrack + 13 + r1 * 22),
      z0: (i / towerCount) * span,
      w: 2 + r2 * 3,
      h: 3 + r1 * r2 * 22 + r2 * 4,
      capB: r2 > 0.62,
    };
  });

  /* Bridge: the skyline across the water, far away and slow. */
  const skyMat = new THREE.MeshLambertMaterial({
    color: 0x0a1222,
    emissive: 0xffffff,
    emissiveMap: winTex,
    emissiveIntensity: 0.4,
  });
  const skyline = instanced(boxGeo, skyMat, T.SKYLINE_COUNT);
  const skyInfo = Array.from({ length: T.SKYLINE_COUNT }, (_, i) => {
    const r1 = rnd(i, 31.7);
    const r2 = rnd(i, 7.13);
    const side = i % 2 === 0 ? -1 : 1;
    return {
      x: side * (60 + r1 * 45),
      z0: (i / T.SKYLINE_COUNT) * span,
      w: 4 + r2 * 7,
      h: 14 + r1 * 34 + r2 * 10,
    };
  });

  /* Bridge: pylons with lit strips, fanned cables, railings, glints on the water. */
  const pylonCount = Math.ceil(span / T.BRIDGE_PYLON_SPACING) * 2;
  const pylonH = 17;
  const pylonX = halfTrack + 2.4;
  const pylonMat = new THREE.MeshLambertMaterial({ color: 0x101a2a });
  const accentAMat = new THREE.MeshBasicMaterial({ color: neon(T.MOVE_COLOR.sidestep, 0.9) });
  const accentBMat = new THREE.MeshBasicMaterial({ color: neon(T.MOVE_COLOR.armsUp, 0.9) });
  const pylons = instanced(boxGeo, pylonMat, pylonCount);
  const pylonStrips = instanced(boxGeo, accentAMat, pylonCount);
  const cablesPerPylon = 6; // three each way, on one side
  const cables = instanced(boxGeo, accentAMat, pylonCount * cablesPerPylon);
  const railPosts = Math.ceil(span / T.BRIDGE_RAIL_SPACING);
  const posts = instanced(boxGeo, pylonMat, railPosts * 2);
  const rails = instanced(boxGeo, accentBMat, railPosts * 2);
  const glintCount = 70;
  const glintMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(T.MOVE_COLOR.sidestep).multiplyScalar(0.5),
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glints = instanced(new THREE.PlaneGeometry(1, 1), glintMat, glintCount);
  const glintInfo = Array.from({ length: glintCount }, (_, i) => ({
    x: (i % 2 === 0 ? -1 : 1) * (halfTrack + 3 + rnd(i, 3.3) * 30),
    z0: rnd(i, 9.1) * span,
    len: 1.5 + rnd(i, 5.7) * 4,
  }));
  const quat = new THREE.Quaternion();
  const axisX = new THREE.Vector3(1, 0, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  /* Tunnel: walls, ceiling, a neon ring every segment, light strips along the walls. */
  const tunnelCount = Math.ceil(span / T.TUNNEL_SEGMENT);
  const tunnelMat = new THREE.MeshBasicMaterial({ color: 0x0d0a18 });
  const tunnelWalls = instanced(boxGeo, tunnelMat, tunnelCount * 3);
  const ringPosts = instanced(boxGeo, accentBMat, tunnelCount * 2);
  const ringBars = instanced(boxGeo, accentBMat, tunnelCount);
  const tunnelStrips = instanced(boxGeo, accentAMat, tunnelCount * 4);

  /* Particles: drifting motes (city), sparks (tunnel), stars (bridge), gold (finale). */
  const glowTex = glowTexture();
  const pCount = T.PARTICLE_COUNT;
  const pPositions = new Float32Array(pCount * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  const pMat = new THREE.PointsMaterial({
    map: glowTex,
    size: T.PARTICLE_SIZE,
    sizeAttenuation: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: new THREE.Color(L.ZONE_LOOK.city.particle),
  });
  const particles = new THREE.Points(pGeo, pMat);
  particles.frustumCulled = false;
  scene.add(particles);
  // Kept off the track (|x| ≥ 5.5): a glowing dot over a lane could read as an orb.
  const pInfo = Array.from({ length: pCount }, (_, i) => ({
    x: (i % 2 === 0 ? -1 : 1) * (5.5 + rnd(i, 4.7) * 16),
    y: 0.6 + rnd(i, 8.3) * 10,
    z0: rnd(i, 2.9) * 120,
    phase: rnd(i, 6.1) * Math.PI * 2,
  }));
  let particleTravel = 0;

  /* Speed lines: streaks of light rushing past at a high streak. */
  const lineMat = new THREE.MeshBasicMaterial({
    color: neon(T.COLOR_LIME, T.NEON_BOOST * 0.6),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const speedLines = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.035, 0.035, T.SPEED_LINE_LENGTH),
    lineMat,
    T.SPEED_LINE_COUNT,
  );
  speedLines.frustumCulled = false;
  speedLines.visible = false;
  scene.add(speedLines);
  const lineInfo = Array.from({ length: T.SPEED_LINE_COUNT }, (_, i) => {
    const r1 = rnd(i, 91.7);
    const r2 = rnd(i, 17.3);
    const side = i % 2 === 0 ? -1 : 1;
    return {
      x: side * (halfTrack + 0.8 + r1 * 7),
      y: 0.4 + r2 * 4.5,
      z0: (i / T.SPEED_LINE_COUNT) * T.SPEED_LINE_SPAN,
    };
  });

  /* Horizon glow at the vanishing point. */
  const horizonMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: new THREE.Color(T.COLOR_LIME).multiplyScalar(0.22),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(160, 60), horizonMat);
  horizon.position.set(0, 4, zFar + 10);
  scene.add(horizon);

  /* Combo milestone shockwave: a floor ring that races out from the runner. */
  const shockMat = new THREE.MeshBasicMaterial({
    color: neon(T.COLOR_LIME, T.NEON_BOOST),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), shockMat); // thin: floor cues stay visible
  shock.rotation.x = -Math.PI / 2;
  shock.position.y = 0.06;
  shock.visible = false;
  scene.add(shock);
  let shockT = Infinity;

  /* Post-processing. */
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (T.BLOOM_ENABLED) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(
      new THREE.Vector2(256, 256),
      T.BLOOM_STRENGTH,
      T.BLOOM_RADIUS,
      T.BLOOM_THRESHOLD,
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  let quality: Quality = 0;
  let baseFov = T.CAMERA_FOV;
  let lastDpr = window.devicePixelRatio || 1;
  const resize = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    lastDpr = window.devicePixelRatio || 1;
    const pr = quality >= 1 ? 1 : Math.min(lastDpr, T.MAX_PIXEL_RATIO);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer?.setPixelRatio(pr);
    composer?.setSize(w, h);
    // The composer sizes bloom to the canvas; shrink its blur further (look.ts BLOOM_SCALE).
    bloom?.setSize(Math.round(w * pr * L.BLOOM_SCALE), Math.round(h * pr * L.BLOOM_SCALE));
    camera.aspect = w / h;
    // Keep the three lanes in view on narrow (portrait) screens.
    baseFov = w / h < 1 ? T.CAMERA_FOV * 1.35 : T.CAMERA_FOV;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  /* Zone colours, blended at the camera. */
  const looks = ZONES.map((z) => L.ZONE_LOOK[z]);
  const colA = new THREE.Color();
  const colB = new THREE.Color();
  const mixed: ZoneMix = { a: 0, b: 0, k: 0 };
  const blend = (pick: (l: T.ZoneLook) => number, out: THREE.Color): THREE.Color =>
    out.copy(colA.set(pick(looks[mixed.a]!))).lerp(colB.set(pick(looks[mixed.b]!)), mixed.k);
  const blendNum = (pick: (l: T.ZoneLook) => number): number =>
    pick(looks[mixed.a]!) + (pick(looks[mixed.b]!) - pick(looks[mixed.a]!)) * mixed.k;
  const tmp = new THREE.Color();

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let shakeAmount = 0;
  let camX = 0;
  let clock = 0;
  let fovKick = 0;
  let punch = 0; // milestone field-of-view punch, degrees
  let flash = 0; // milestone lane flash, 0 to 1
  const cam: CameraPose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 };
  const extras = (): boolean => quality < 2; // the quality ladder drops these at level 2

  return {
    scene,
    camera,
    update({ distance, playerX, dt, realDt, speed, fever, dim, intro }) {
      clock += dt;
      gridTex.offset.y = wrap(distance / T.GRID_TILE, 1);

      for (let i = 0; i < dashesPerLine; i++) {
        const z = zNear - wrap(i * T.DASH_SPACING - distance, dashSpan);
        m4.makeTranslation(-T.LANE_WIDTH / 2, 0.012, z);
        dashes.setMatrixAt(i * 2, m4);
        m4.makeTranslation(T.LANE_WIDTH / 2, 0.012, z);
        dashes.setMatrixAt(i * 2 + 1, m4);
      }
      dashes.instanceMatrix.needsUpdate = true;

      /* Colours of the zone the camera is in, blended across borders. */
      zoneMix(plan, worldAt(distance, T.CAMERA_POS.z * 0.5), mixed);
      blend((l) => l.bg, bgColor);
      fog.color.copy(bgColor);
      renderer.setClearColor(bgColor, 1);
      fog.near = blendNum((l) => l.fogNear);
      fog.far = blendNum((l) => l.fogFar);
      blend((l) => l.horizon, horizonMat.color).multiplyScalar(
        blendNum((l) => l.horizonGain) * (1 + flash * 1.5),
      );
      blend((l) => l.floor, floorMat.color);
      blend((l) => l.accentA, tmp);
      capMat.color.copy(tmp).multiplyScalar(0.85);
      accentAMat.color.copy(tmp).multiplyScalar(0.9);
      blend((l) => l.accentB, tmp);
      capMat2.color.copy(tmp).multiplyScalar(0.85);
      accentBMat.color.copy(tmp).multiplyScalar(0.9);
      blend((l) => l.arch, tmp);
      archMat.color.copy(tmp).multiplyScalar(T.NEON_BOOST * 0.4);
      blend((l) => l.particle, pMat.color);

      /* City and finale gates. */
      for (let i = 0; i < T.ARCH_COUNT; i++) {
        // Offset so that no arch stands near the runner at the start: the intro camera orbits there.
        const z = zNear - wrap(i * T.ARCH_SPACING - distance + 22, archSpan);
        // Shown or not, never shrunk: a lowered top bar would sweep across the camera. Each
        // arch keeps its spot on the track while it approaches, so this is decided far away.
        const d = worldAt(distance, z);
        const on = Math.max(zonePresence(plan, CITY, d), zonePresence(plan, FINALE, d)) > 0.5;
        for (let s = 0; s < 2; s++) {
          const x = (s === 0 ? -1 : 1) * archHalf;
          archPosts.setMatrixAt(
            i * 2 + s,
            on ? m4.makeTranslation(x, T.ARCH_HEIGHT / 2, z) : hidden,
          );
          archPlinths.setMatrixAt(i * 2 + s, on ? m4.makeTranslation(x, 0.25, z) : hidden);
        }
        archBars.setMatrixAt(i, on ? m4.makeTranslation(0, T.ARCH_HEIGHT, z) : hidden);
      }
      archPosts.instanceMatrix.needsUpdate = true;
      archPlinths.instanceMatrix.needsUpdate = true;
      archBars.instanceMatrix.needsUpdate = true;

      /* City and finale towers, rising out of the ground at a border. */
      const parallax = distance * T.TOWER_PARALLAX;
      const towersOn = extras() && (zoneInView(CITY, distance) || zoneInView(FINALE, distance));
      towers.visible = capsA.visible = capsB.visible = towersOn;
      for (let i = 0; i < towerCount && towersOn; i++) {
        const t = towerInfo[i]!;
        const z = zNear - wrap(t.z0 - parallax, span);
        const d = worldAt(distance, z);
        const p = Math.max(zonePresence(plan, CITY, d), zonePresence(plan, FINALE, d));
        if (p <= 0.01) {
          towers.setMatrixAt(i, hidden);
          capsA.setMatrixAt(i, hidden);
          capsB.setMatrixAt(i, hidden);
          continue;
        }
        const h = t.h * p;
        m4.makeScale(t.w, h, t.w).setPosition(t.x, h / 2, z);
        towers.setMatrixAt(i, m4);
        m4.makeScale(t.w, 1, t.w).setPosition(t.x, h, z);
        (t.capB ? capsB : capsA).setMatrixAt(i, m4);
        (t.capB ? capsA : capsB).setMatrixAt(i, hidden);
      }
      if (towersOn) {
        towers.instanceMatrix.needsUpdate = true;
        capsA.instanceMatrix.needsUpdate = true;
        capsB.instanceMatrix.needsUpdate = true;
      }

      /* Bridge. */
      const bridgeOn = zoneInView(BRIDGE, distance);
      pylons.visible =
        pylonStrips.visible =
        cables.visible =
        posts.visible =
        rails.visible =
          bridgeOn;
      const skyOn = bridgeOn && extras();
      skyline.visible = glints.visible = skyOn;
      if (bridgeOn) {
        for (let i = 0; i < pylonCount / 2; i++) {
          const z = recycledZ(i, T.BRIDGE_PYLON_SPACING, distance);
          const p = zonePresence(plan, BRIDGE, worldAt(distance, z));
          for (const s of [0, 1]) {
            const k = i * 2 + s;
            const x = (s === 0 ? -1 : 1) * pylonX;
            if (p <= 0.01) {
              pylons.setMatrixAt(k, hidden);
              pylonStrips.setMatrixAt(k, hidden);
              for (let c = 0; c < cablesPerPylon; c++)
                cables.setMatrixAt(k * cablesPerPylon + c, hidden);
              continue;
            }
            const h = pylonH * p;
            m4.makeScale(0.9, h, 0.9).setPosition(x, h / 2, z);
            pylons.setMatrixAt(k, m4);
            m4.makeScale(0.12, h * 0.92, 0.95).setPosition(x - Math.sign(x) * 0.46, h / 2, z);
            pylonStrips.setMatrixAt(k, m4);
            // Cables fan from the pylon top down to the deck edge on both sides.
            for (let c = 0; c < cablesPerPylon; c++) {
              const dir = c < cablesPerPylon / 2 ? 1 : -1;
              const reach = 8 + (c % (cablesPerPylon / 2)) * 9; // along the track
              const top = h - 0.6;
              const lowY = 1.1;
              const len = Math.hypot(reach, top - lowY);
              const angle = Math.atan2(top - lowY, reach) * dir;
              quat.setFromAxisAngle(axisX, angle);
              pos.set(x, (top + lowY) / 2, z + (dir * reach) / 2);
              scl.set(0.05, 0.05, len);
              m4.compose(pos, quat, scl);
              cables.setMatrixAt(k * cablesPerPylon + c, m4);
            }
          }
        }
        for (let i = 0; i < railPosts; i++) {
          const z = recycledZ(i, T.BRIDGE_RAIL_SPACING, distance);
          const p = zonePresence(plan, BRIDGE, worldAt(distance, z));
          for (const s of [0, 1]) {
            const k = i * 2 + s;
            const x = (s === 0 ? -1 : 1) * (halfTrack + 0.55);
            if (p <= 0.01) {
              posts.setMatrixAt(k, hidden);
              rails.setMatrixAt(k, hidden);
              continue;
            }
            m4.makeScale(0.08, 0.95 * p, 0.08).setPosition(x, (0.95 * p) / 2, z);
            posts.setMatrixAt(k, m4);
            m4.makeScale(0.06, 0.06, T.BRIDGE_RAIL_SPACING).setPosition(
              x,
              0.95 * p,
              z - T.BRIDGE_RAIL_SPACING / 2,
            );
            rails.setMatrixAt(k, m4);
          }
        }
        for (const m of [pylons, pylonStrips, cables, posts, rails])
          m.instanceMatrix.needsUpdate = true;
      }
      if (skyOn) {
        const sky = distance * T.SKYLINE_PARALLAX;
        for (let i = 0; i < T.SKYLINE_COUNT; i++) {
          const s = skyInfo[i]!;
          const z = zNear - wrap(s.z0 - sky, span);
          // Far away: its presence follows the camera's zone, not its own spot on the track.
          const p = zonePresence(plan, BRIDGE, worldAt(distance, -40));
          if (p <= 0.01) {
            skyline.setMatrixAt(i, hidden);
            continue;
          }
          const h = s.h * p;
          m4.makeScale(s.w, h, s.w).setPosition(s.x, h / 2 - 1, z);
          skyline.setMatrixAt(i, m4);
        }
        skyline.instanceMatrix.needsUpdate = true;
        for (let i = 0; i < glintCount; i++) {
          const g = glintInfo[i]!;
          const z = zNear - wrap(g.z0 - distance, span);
          const p = zonePresence(plan, BRIDGE, worldAt(distance, z));
          const tw = reduceMotion ? 0.7 : 0.45 + 0.55 * Math.abs(Math.sin(clock * 1.7 + i));
          if (p <= 0.01) {
            glints.setMatrixAt(i, hidden);
            continue;
          }
          quat.setFromAxisAngle(axisX, -Math.PI / 2);
          pos.set(g.x, 0.03, z);
          scl.set(0.12 * tw * p, g.len, 1);
          m4.compose(pos, quat, scl);
          glints.setMatrixAt(i, m4);
        }
        glints.instanceMatrix.needsUpdate = true;
      }

      /* Tunnel. */
      const tunnelOn = zoneInView(TUNNEL, distance);
      tunnelWalls.visible = ringPosts.visible = ringBars.visible = tunnelOn;
      tunnelStrips.visible = tunnelOn && extras();
      if (tunnelOn) {
        const W = T.TUNNEL_HALF_WIDTH;
        const H = T.TUNNEL_HEIGHT;
        const seg = T.TUNNEL_SEGMENT;
        for (let i = 0; i < tunnelCount; i++) {
          const z = recycledZ(i, seg, distance);
          const d = worldAt(distance, z);
          const inside = zoneIndexAt(plan, d) === TUNNEL;
          // Segment from z to z - seg, so the mouth starts exactly at the border.
          const zc = z - seg / 2;
          const show = inside && zoneIndexAt(plan, worldAt(distance, z - seg)) === TUNNEL;
          for (let s = 0; s < 3; s++) {
            if (!show) {
              tunnelWalls.setMatrixAt(i * 3 + s, hidden);
              continue;
            }
            if (s < 2) m4.makeScale(0.4, H, seg).setPosition((s === 0 ? -1 : 1) * W, H / 2, zc);
            else m4.makeScale(2 * W + 0.4, 0.4, seg).setPosition(0, H, zc);
            tunnelWalls.setMatrixAt(i * 3 + s, m4);
          }
          for (let s = 0; s < 2; s++) {
            if (!show) {
              ringPosts.setMatrixAt(i * 2 + s, hidden);
              continue;
            }
            m4.makeScale(0.16, H, 0.16).setPosition((s === 0 ? -1 : 1) * (W - 0.25), H / 2, z);
            ringPosts.setMatrixAt(i * 2 + s, m4);
          }
          if (show) {
            m4.makeScale(2 * W - 0.4, 0.16, 0.16).setPosition(0, H - 0.25, z);
            ringBars.setMatrixAt(i, m4);
          } else ringBars.setMatrixAt(i, hidden);
          for (let s = 0; s < 4; s++) {
            if (!show || !extras()) {
              tunnelStrips.setMatrixAt(i * 4 + s, hidden);
              continue;
            }
            const x = (s % 2 === 0 ? -1 : 1) * (W - 0.22);
            const y = s < 2 ? 1.2 : 4.6;
            m4.makeScale(0.06, 0.06, seg * 0.7).setPosition(x, y, zc);
            tunnelStrips.setMatrixAt(i * 4 + s, m4);
          }
        }
        for (const m of [tunnelWalls, ringPosts, ringBars, tunnelStrips])
          m.instanceMatrix.needsUpdate = true;
      }

      /* Particles drift past at the zone's rate. Dropped at quality 2, halved at 1. */
      particles.visible = extras();
      if (particles.visible) {
        particleTravel += dt * speed * blendNum((l) => l.particleRate);
        const n = quality >= 1 ? Math.floor(pCount / 2) : pCount;
        pGeo.setDrawRange(0, n);
        const sway = reduceMotion ? 0 : 1;
        for (let i = 0; i < n; i++) {
          const p = pInfo[i]!;
          pPositions[i * 3] = p.x + Math.sin(clock * 0.6 + p.phase) * 0.6 * sway;
          pPositions[i * 3 + 1] = p.y + Math.sin(clock * 0.9 + p.phase) * 0.35 * sway;
          pPositions[i * 3 + 2] = zNear - wrap(p.z0 - particleTravel, 120);
        }
        pGeo.attributes.position!.needsUpdate = true;
      }

      // Lane lines pulse faster and brighter as the streak climbs, and flash at a milestone.
      flash = Math.max(0, flash - realDt * 1.6);
      const pulse = fever > 0 && !reduceMotion ? 0.5 + 0.5 * Math.sin(clock * (3 + fever * 2)) : 0;
      limeMat.color
        .copy(limeBase)
        .multiplyScalar(T.NEON_BOOST * (0.8 + fever * 0.12 + pulse * fever * 0.15 + flash * 0.8));

      // Milestone shockwave from the runner's feet.
      shockT += dt;
      const sk = shockT / T.SHOCKWAVE_SEC;
      shock.visible = sk < 1;
      if (shock.visible) {
        shock.position.set(playerX, 0.06, 0);
        shock.scale.setScalar(reduceMotion ? T.SHOCKWAVE_SCALE * 0.5 : 1 + sk * T.SHOCKWAVE_SCALE);
        shockMat.opacity = 1 - sk;
      }

      // Speed lines from the second tier (streak 10).
      const lineTarget = reduceMotion || fever < 2 ? 0 : fever === 2 ? 0.55 : 0.9;
      lineMat.opacity += (lineTarget - lineMat.opacity) * (1 - Math.exp(-3 * dt));
      speedLines.visible = lineMat.opacity > 0.01;
      if (speedLines.visible) {
        const travel = distance * T.SPEED_LINE_RATE;
        for (let i = 0; i < lineInfo.length; i++) {
          const l = lineInfo[i]!;
          m4.makeTranslation(l.x, l.y, zNear - wrap(l.z0 - travel, T.SPEED_LINE_SPAN));
          speedLines.setMatrixAt(i, m4);
        }
        speedLines.instanceMatrix.needsUpdate = true;
      }

      // A small field-of-view kick with speed and streak sells the speed-up; a milestone punches it.
      punch *= Math.exp(-5 * realDt);
      if (!reduceMotion) {
        const target =
          ((speed - T.SPEED_MIN) / (T.SPEED_MAX - T.SPEED_MIN)) * T.FOV_KICK_SPEED +
          fever * T.FOV_KICK_TIER;
        fovKick += (target - fovKick) * (1 - Math.exp(-2 * dt));
        camera.fov = baseFov + (fovKick + punch) * intro;
        camera.updateProjectionMatrix();
      }

      // With bloom the sheet blends in linear light, before the sRGB conversion, so the same
      // perceived darkening needs a stronger sheet: 1 - (1 - d)^2.2.
      const bloomOn = composer !== null && quality < 2;
      const dimTarget = !dim ? 0 : bloomOn ? 1 - (1 - T.PAUSE_DIM) ** 2.2 : T.PAUSE_DIM;
      dimMat.opacity += (dimTarget - dimMat.opacity) * (1 - Math.exp(-8 * realDt));
      dimSheet.visible = dimMat.opacity > 0.01;

      camX += (playerX * T.CAMERA_FOLLOW_X - camX) * (1 - Math.exp(-6 * dt));
      shakeAmount *= Math.exp(-T.SHAKE_DECAY * dt);
      const sx = (Math.random() - 0.5) * shakeAmount;
      const sy = (Math.random() - 0.5) * shakeAmount;
      if (intro < 1) {
        // Intro fly-in around the runner, landing exactly on the chase camera.
        introCamera(intro, cam);
        const follow = camX * intro + playerX * (1 - intro);
        camera.position.set(cam.px + follow, cam.py, cam.pz);
        camera.lookAt(cam.lx + follow, cam.ly, cam.lz);
      } else {
        camera.position.set(T.CAMERA_POS.x + camX + sx, T.CAMERA_POS.y + sy, T.CAMERA_POS.z);
        camera.lookAt(look.x + camX * 0.5, look.y, look.z);
      }
    },
    shake() {
      if (!reduceMotion) shakeAmount = T.SHAKE_AMPLITUDE;
    },
    milestone() {
      shockT = 0;
      flash = 1;
      if (!reduceMotion) punch = 4;
    },
    setQuality(q) {
      if (q === quality) return;
      quality = q;
      resize();
    },
    precompile() {
      // renderer.compile walks the whole scene, hidden objects included (three r187), so the
      // other zones' scenery compiles here too.
      try {
        if (composer && quality < 2) {
          renderer.setRenderTarget(composer.readBuffer); // where RenderPass draws the scene
          renderer.compile(scene, camera);
          renderer.setRenderTarget(null);
        }
        renderer.compile(scene, camera); // straight to the screen (quality 2)
      } catch (err) {
        console.warn('[game] shader precompile failed: only first-use stalls', err);
      } finally {
        renderer.setRenderTarget(null);
      }
    },
    render() {
      // A ResizeObserver misses a pixel-ratio change with the same CSS size (window dragged
      // from the laptop screen to a projector), so check it here: one comparison per frame.
      if ((window.devicePixelRatio || 1) !== lastDpr) resize();
      if (composer && quality < 2) composer.render();
      else renderer.render(scene, camera);
    },
    dispose() {
      ro.disconnect();
      scene.traverse((o) => {
        if (o instanceof THREE.Sprite) {
          o.material.map?.dispose();
          o.material.dispose();
        } else if (
          o instanceof THREE.Mesh ||
          o instanceof THREE.LineSegments ||
          o instanceof THREE.InstancedMesh ||
          o instanceof THREE.Points
        ) {
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
      winTex.dispose();
      bloom?.dispose();
      composer?.dispose();
      renderer.dispose();
    },
  };
}
