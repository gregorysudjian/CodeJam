import * as THREE from 'three';
import type { MoveType, ObstacleKind, Spawn } from '@/contracts';
import { GLYPH, paintGlyph, type Glyph } from './glyph';
import type { Verdict } from './judge';
import { neon } from './scene';
import * as T from './tuning';

/**
 * Pooled obstacle views. Every view stays in the scene (hidden when free), shares
 * geometry and materials, and is coloured by the move that clears it.
 * A view's origin is the object's front edge on the centre line; it extends toward -z.
 */
type ColorKey = keyof typeof T.MOVE_COLOR;
type Role = 'body' | 'edge' | 'glow' | 'tele';

export function colorKeyFor(move: MoveType): ColorKey {
  return move === 'reachLeft' || move === 'reachRight' ? 'reach' : move;
}

interface Palette {
  body: THREE.Material;
  edge: THREE.Material;
  glow: THREE.Material;
  tele: THREE.Material;
}

function makePalette(hex: number): Palette {
  return {
    body: new THREE.MeshStandardMaterial({
      color: T.COLOR_BODY,
      emissive: new THREE.Color(hex),
      emissiveIntensity: 0.22,
      roughness: 0.45,
      metalness: 0.5,
    }),
    edge: new THREE.LineBasicMaterial({ color: neon(hex) }),
    glow: new THREE.MeshBasicMaterial({ color: neon(hex) }),
    tele: new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex),
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };
}

export interface ObstacleView {
  readonly kind: ObstacleKind;
  readonly root: THREE.Group;
  show(spawn: Spawn, length: number): void;
  /**
   * The move was seen in the window: smash the crate, start collecting the orb.
   * `attractor` gives the world position the orb flies to (the hand that grabbed it).
   */
  engage(attractor?: () => THREE.Vector3): void;
  setVerdict(v: Verdict): void;
  tick(dt: number, time: number): void;
}

export interface Obstacles {
  acquire(kind: ObstacleKind): ObstacleView;
  release(view: ObstacleView): void;
  /** Expanding ring at the player's feet. */
  burst(x: number, move: MoveType | 'hit'): void;
  tick(dt: number): void;
  /** Frees shared geometry and every cached material, including ones not on screen. */
  dispose(): void;
}

export function createObstacles(scene: THREE.Scene): Obstacles {
  const L = T.LANE_WIDTH;
  const W = 3 * L;
  const palettes = {} as Record<ColorKey, Palette>;
  for (const k of Object.keys(T.MOVE_COLOR) as ColorKey[])
    palettes[k] = makePalette(T.MOVE_COLOR[k]);
  const hitPalette = makePalette(T.COLOR_HIT);

  /* Shared geometry. */
  const boxCache = new Map<string, { geo: THREE.BoxGeometry; edges: THREE.EdgesGeometry }>();
  const box = (w: number, h: number, d: number) => {
    const key = `${w}|${h}|${d}`;
    let g = boxCache.get(key);
    if (!g) {
      const geo = new THREE.BoxGeometry(w, h, d);
      g = { geo, edges: new THREE.EdgesGeometry(geo) };
      boxCache.set(key, g);
    }
    return g;
  };
  const tag = <O extends THREE.Object3D>(o: O, role: Role): O => {
    o.userData.role = role;
    return o;
  };
  const placeholder = palettes.jump;
  /** Dark body with neon edges. */
  const neonBox = (w: number, h: number, d: number): THREE.Group => {
    const g = box(w, h, d);
    const grp = new THREE.Group();
    grp.add(tag(new THREE.Mesh(g.geo, placeholder.body), 'body'));
    grp.add(tag(new THREE.LineSegments(g.edges, placeholder.edge), 'edge'));
    return grp;
  };
  const glowBox = (w: number, h: number, d: number): THREE.Mesh =>
    tag(new THREE.Mesh(box(w, h, d).geo, placeholder.glow), 'glow');
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  /** Floor marker: unit plane on the ground, scaled by the caller. */
  const floorPlate = (): THREE.Mesh => {
    const m = tag(new THREE.Mesh(planeGeo, placeholder.tele), 'tele');
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    return m;
  };
  const laneX = (lane: number): number => lane * L;

  /* Icons: a sprite above each object showing the move (glyph.ts), readable from 2 m. */
  const iconMats = new Map<string, THREE.SpriteMaterial>();
  const iconMaterial = (glyph: Glyph, key: ColorKey | 'hit'): THREE.SpriteMaterial => {
    const id = `${glyph}|${key}`;
    let m = iconMats.get(id);
    if (!m) {
      const hex = key === 'hit' ? T.COLOR_HIT : T.MOVE_COLOR[key];
      m = new THREE.SpriteMaterial({
        map: drawGlyph(glyph, hex),
        transparent: true,
        depthWrite: false,
      });
      m.color.setScalar(T.ICON_BRIGHTNESS);
      iconMats.set(id, m);
    }
    return m;
  };
  const makeIcon = (): THREE.Sprite => {
    const sprite = new THREE.Sprite(iconMaterial('up', 'jump'));
    sprite.scale.setScalar(T.ICON_SIZE);
    return sprite;
  };
  const burstColors = {} as Record<ColorKey, THREE.Color>;
  for (const k of Object.keys(T.MOVE_COLOR) as ColorKey[]) burstColors[k] = neon(T.MOVE_COLOR[k]);
  const hitBurstColor = neon(T.COLOR_HIT);

  const applyPalette = (root: THREE.Object3D, p: Palette): void => {
    root.traverse((o) => {
      const role = o.userData.role as Role | undefined;
      if (role && (o instanceof THREE.Mesh || o instanceof THREE.LineSegments))
        o.material = p[role];
    });
  };

  /* ── Shared geometry for the per-kind shapes (one upload, every pooled view) ── */
  const crateRow = T.CRATE_HEIGHT / 2;
  const crossGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-L * 0.4, -crateRow * 0.4, 0.41),
    new THREE.Vector3(L * 0.4, crateRow * 0.4, 0.41),
    new THREE.Vector3(-L * 0.4, crateRow * 0.4, 0.41),
    new THREE.Vector3(L * 0.4, -crateRow * 0.4, 0.41),
  ]);
  const orbShellSource = new THREE.IcosahedronGeometry(T.ORB_RADIUS * 1.55, 0);
  const orbGeo = {
    core: new THREE.IcosahedronGeometry(T.ORB_RADIUS, 1),
    shell: new THREE.EdgesGeometry(orbShellSource),
    halo: new THREE.TorusGeometry(T.ORB_RADIUS * 2, 0.03, 6, 40),
    pillar: new THREE.CylinderGeometry(0.035, 0.035, 1, 6),
  };
  orbShellSource.dispose();

  /**
   * What a builder returns. `makeView` turns it into a pooled ObstacleView: it colours the
   * parts by move on `show`, turns them red on a hit, and calls the optional hooks.
   */
  interface Parts {
    root: THREE.Group;
    /** Reset for reuse and fit to this spawn (lanes, hold length). */
    configure(spawn: Spawn, length: number): void;
    /** The move icon; its glyph comes from GLYPH by kind. */
    icon?: THREE.Sprite;
    engage?(attractor?: () => THREE.Vector3): void;
    onHit?(): void;
    tick?(dt: number, time: number): void;
  }

  function makeView(kind: ObstacleKind, parts: Parts): ObstacleView {
    const { root, icon } = parts;
    const glyph = GLYPH[kind];
    root.visible = false;
    scene.add(root);
    return {
      kind,
      root,
      show(spawn, length) {
        const key = colorKeyFor(spawn.requires);
        applyPalette(root, palettes[key]);
        if (icon && glyph) icon.material = iconMaterial(glyph, key);
        parts.configure(spawn, length);
        root.visible = true;
      },
      engage(attractor) {
        parts.engage?.(attractor);
      },
      setVerdict(v) {
        if (v !== 'hit') return;
        applyPalette(root, hitPalette);
        if (icon && glyph) icon.material = iconMaterial(glyph, 'hit');
        parts.onHit?.();
      },
      tick(dt, time) {
        parts.tick?.(dt, time);
      },
    };
  }

  /* ── Builders, one per kind ── */

  function buildBlock(): Parts {
    const root = new THREE.Group();
    const walls = [-1, 0, 1].map((lane) => {
      const g = new THREE.Group();
      g.position.x = laneX(lane);
      const wall = neonBox(L * 0.86, T.BLOCK_HEIGHT, T.BLOCK_DEPTH);
      wall.position.set(0, T.BLOCK_HEIGHT / 2, -T.BLOCK_DEPTH / 2);
      const stripe = glowBox(L * 0.86, 0.08, 0.06);
      stripe.position.set(0, T.BLOCK_HEIGHT * 0.62, 0.02);
      g.add(wall, stripe);
      root.add(g);
      return g;
    });
    // The free lane gets the floor marker and the "go here" icon.
    const guide = floorPlate();
    guide.scale.set(L * 0.8, T.TELEGRAPH_LENGTH, 1);
    guide.position.z = -T.TELEGRAPH_LENGTH / 2 + 1;
    const sprite = makeIcon();
    sprite.position.y = T.ICON_HEIGHT.block;
    root.add(guide, sprite);
    return {
      root,
      icon: sprite,
      configure(spawn) {
        const free = ([-1, 0, 1] as const).find((l) => !spawn.lanes.includes(l)) ?? 0;
        walls.forEach((g, i) => (g.visible = spawn.lanes.includes((i - 1) as -1 | 0 | 1)));
        guide.position.x = sprite.position.x = laneX(free);
      },
    };
  }

  function buildHurdle(): Parts {
    const root = new THREE.Group();
    const bar = glowBox(W, 0.12, 0.12);
    bar.position.y = T.HURDLE_HEIGHT;
    const bar2 = glowBox(W, 0.05, 0.05);
    bar2.position.y = T.HURDLE_HEIGHT * 0.45;
    const panel = tag(new THREE.Mesh(planeGeo, placeholder.tele), 'tele');
    panel.scale.set(W, T.HURDLE_HEIGHT, 1);
    panel.position.y = T.HURDLE_HEIGHT / 2;
    root.add(bar, bar2, panel);
    for (const s of [-1, 1]) {
      const post = neonBox(0.18, T.HURDLE_HEIGHT + 0.15, 0.18);
      post.position.set((s * W) / 2, (T.HURDLE_HEIGHT + 0.15) / 2, 0);
      root.add(post);
    }
    const plate = floorPlate();
    plate.scale.set(W, 2.5, 1);
    plate.position.z = 1.25;
    const sprite = makeIcon();
    sprite.position.y = T.ICON_HEIGHT.hurdle;
    root.add(plate, sprite);
    return { root, icon: sprite, configure() {} };
  }

  function buildBeam(): Parts {
    const root = new THREE.Group();
    const top = T.BEAM_HEIGHT;
    // Front: a solid slab. A long (held) beam continues as an open frame of rails and
    // ribs, so the camera, which sits above the beam, still sees the runner underneath.
    const slab = neonBox(W + 0.6, 0.45, T.BEAM_MIN_DEPTH);
    slab.position.set(0, top + 0.225, -T.BEAM_MIN_DEPTH / 2);
    const lip = glowBox(W + 0.6, 0.07, 0.07);
    lip.position.set(0, top, 0.02);
    root.add(slab, lip);

    const span = new THREE.Group(); // unit length along -z, scaled by the hold length
    const plate = floorPlate();
    plate.scale.set(W, 1, 1);
    plate.position.z = -0.5;
    span.add(plate);
    for (const s of [-1, 1]) {
      const rail = glowBox(0.08, 0.08, 1);
      rail.position.set(s * (W / 2 + 0.3), top + 0.2, -0.5);
      span.add(rail);
    }
    root.add(span);
    const ribs = Array.from({ length: T.BEAM_MAX_RIBS }, () => {
      const rib = glowBox(W + 0.6, 0.06, 0.06);
      rib.position.y = top + 0.2;
      root.add(rib);
      return rib;
    });

    const backPosts: THREE.Object3D[] = [];
    for (const s of [-1, 1]) {
      const front = neonBox(0.2, top, 0.2);
      front.position.set(s * (W / 2 + 0.3), top / 2, 0);
      const back = neonBox(0.2, top, 0.2);
      back.position.set(s * (W / 2 + 0.3), top / 2, -1);
      backPosts.push(back);
      root.add(front, back);
    }
    const sprite = makeIcon();
    sprite.position.y = T.ICON_HEIGHT.beam;
    root.add(sprite);
    return {
      root,
      icon: sprite,
      configure(_spawn, length) {
        const long = length > T.BEAM_MIN_DEPTH;
        const depth = Math.max(T.BEAM_MIN_DEPTH, length);
        span.visible = long;
        span.scale.z = depth;
        const ribCount = long
          ? Math.min(T.BEAM_MAX_RIBS, Math.floor(depth / T.BEAM_RIB_SPACING))
          : 0;
        ribs.forEach((rib, i) => {
          rib.visible = i < ribCount;
          rib.position.z = -((i + 1) * depth) / (ribCount + 1);
        });
        for (const p of backPosts) p.position.z = -depth;
      },
    };
  }

  function buildCrate(): Parts {
    const root = new THREE.Group();
    const h = crateRow;
    const pieces: {
      obj: THREE.Group;
      home: THREE.Vector3;
      vel: THREE.Vector3;
      spin: THREE.Vector3;
    }[] = [];
    for (let row = 0; row < 2; row++) {
      for (let lane = -1; lane <= 1; lane++) {
        const obj = neonBox(L * 0.92, h - 0.08, 0.8);
        obj.add(tag(new THREE.LineSegments(crossGeo, placeholder.edge), 'edge'));
        const home = new THREE.Vector3(laneX(lane), row * h + h / 2, -0.4);
        obj.position.copy(home);
        root.add(obj);
        pieces.push({
          obj,
          home,
          vel: new THREE.Vector3(lane * 3.2 + (row - 0.5) * 0.8, 3.5 + row * 2.5, -2 - row),
          spin: new THREE.Vector3(2 + lane, 3 - row * 2, lane * 2.5 + 1),
        });
      }
    }
    // Long crates (overhead hold): rails above the track for the hold length.
    const rails = new THREE.Group();
    for (const s of [-1, 1]) {
      const rail = glowBox(0.1, 0.1, 1);
      rail.position.set((s * W) / 2, T.CRATE_HEIGHT + 0.3, -0.5);
      rails.add(rail);
    }
    root.add(rails);
    const plate = floorPlate();
    plate.scale.set(W, 2.5, 1);
    plate.position.z = 1.25;
    root.add(plate);
    const sprite = makeIcon();
    sprite.position.y = T.ICON_HEIGHT.crate;
    root.add(sprite);

    let smashT = -1;
    const smash = (): void => {
      if (smashT < 0) smashT = 0;
      sprite.visible = false;
    };
    return {
      root,
      icon: sprite,
      configure(spawn, length) {
        smashT = -1;
        sprite.visible = true;
        for (const p of pieces) {
          p.obj.position.copy(p.home);
          p.obj.rotation.set(0, 0, 0);
          p.obj.scale.setScalar(1);
          p.obj.visible = true;
        }
        rails.visible = (spawn.holdSec ?? 0) > 0;
        rails.scale.z = Math.max(1, length);
      },
      engage: smash,
      onHit: smash, // the runner crashes through: the pieces fly, already red
      tick(dt) {
        if (smashT < 0) return;
        smashT += dt;
        const t = smashT;
        for (const p of pieces) {
          p.obj.position.set(
            p.home.x + p.vel.x * t,
            p.home.y + p.vel.y * t - 4.9 * t * t,
            p.home.z + p.vel.z * t,
          );
          p.obj.rotation.set(p.spin.x * t, p.spin.y * t, p.spin.z * t);
          p.obj.scale.setScalar(Math.max(0.01, 1 - (t / T.SMASH_SEC) * 0.7));
          p.obj.visible = t < T.SMASH_SEC;
        }
      },
    };
  }

  function buildOrb(): Parts {
    const root = new THREE.Group();
    const orbs = [-1, 0, 1].map((lane) => {
      const g = new THREE.Group();
      g.position.x = laneX(lane);
      const float = new THREE.Group();
      float.position.y = T.ORB_HEIGHT;
      const core = tag(new THREE.Mesh(orbGeo.core, placeholder.glow), 'glow');
      const shell = tag(new THREE.LineSegments(orbGeo.shell, placeholder.edge), 'edge');
      const halo = tag(new THREE.Mesh(orbGeo.halo, placeholder.glow), 'glow');
      float.add(core, shell, halo);
      const pillar = tag(new THREE.Mesh(orbGeo.pillar, placeholder.tele), 'tele');
      pillar.scale.y = T.ORB_HEIGHT;
      pillar.position.y = T.ORB_HEIGHT / 2;
      const plate = floorPlate();
      plate.scale.set(L * 0.7, L * 0.7, 1);
      g.add(float, pillar, plate);
      root.add(g);
      return { g, float, shell, halo };
    });
    let collectT = -1;
    let attract: (() => THREE.Vector3) | null = null;
    const local = new THREE.Vector3();
    return {
      root,
      configure(spawn) {
        collectT = -1;
        attract = null;
        orbs.forEach((o, i) => {
          o.g.visible = spawn.lanes.includes((i - 1) as -1 | 0 | 1);
          o.float.scale.setScalar(1);
          o.float.position.set(0, T.ORB_HEIGHT, 0);
        });
      },
      engage(attractor) {
        if (collectT >= 0) return;
        collectT = 0;
        attract = attractor ?? null;
      },
      tick(dt, time) {
        if (collectT >= 0) collectT += dt;
        const k = collectT >= 0 ? Math.min(1, collectT / T.COLLECT_SEC) : 0;
        for (const o of orbs) {
          o.shell.rotation.set(time * 0.9, time * 1.3, 0);
          o.halo.rotation.set(Math.PI / 2 + Math.sin(time * 2) * 0.3, 0, time);
          if (collectT < 0) {
            o.float.position.y = T.ORB_HEIGHT + Math.sin(time * 3) * 0.08;
            continue;
          }
          if (!o.g.visible) continue;
          if (attract) {
            // Fly into the hand: ease toward it in the lane group's own space.
            o.g.worldToLocal(local.copy(attract()));
            o.float.position.lerp(local, 1 - Math.exp(-T.COLLECT_PULL * dt));
          } else {
            o.float.position.y += dt * 2;
          }
          o.float.scale.setScalar(Math.max(0.001, 1 - k * k));
        }
      },
    };
  }

  const builders: Record<ObstacleKind, () => ObstacleView> = {
    block: () => makeView('block', buildBlock()),
    hurdle: () => makeView('hurdle', buildHurdle()),
    beam: () => makeView('beam', buildBeam()),
    crate: () => makeView('crate', buildCrate()),
    orb: () => makeView('orb', buildOrb()),
  };
  const free: Record<ObstacleKind, ObstacleView[]> = {
    block: [],
    hurdle: [],
    beam: [],
    crate: [],
    orb: [],
  };
  // Warm the pool so the first waves never build geometry mid-round.
  for (const kind of Object.keys(builders) as ObstacleKind[]) {
    for (let i = 0; i < T.POOL_WARM; i++) free[kind].push(builders[kind]());
  }

  /* Bursts: rings that expand from the player's feet on a clear or collect. */
  const ringGeo = new THREE.RingGeometry(0.62, 0.78, 48);
  const bursts = Array.from({ length: T.BURST_POOL }, () => {
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.05;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, mat, t: Infinity };
  });
  let nextBurst = 0;

  return {
    acquire(kind) {
      return free[kind].pop() ?? builders[kind]();
    },
    release(view) {
      view.root.visible = false;
      free[view.kind].push(view);
    },
    burst(x, move) {
      const b = bursts[nextBurst]!;
      nextBurst = (nextBurst + 1) % bursts.length;
      b.t = 0;
      b.mat.color.copy(move === 'hit' ? hitBurstColor : burstColors[colorKeyFor(move)]);
      b.mesh.position.x = x;
      b.mesh.visible = true;
    },
    dispose() {
      for (const g of boxCache.values()) {
        g.geo.dispose();
        g.edges.dispose();
      }
      planeGeo.dispose();
      crossGeo.dispose();
      for (const g of Object.values(orbGeo)) g.dispose();
      for (const p of [...Object.values(palettes), hitPalette])
        for (const m of Object.values(p)) m.dispose();
      for (const m of iconMats.values()) {
        m.map?.dispose();
        m.dispose();
      }
      ringGeo.dispose();
    },
    tick(dt) {
      for (const b of bursts) {
        if (!b.mesh.visible) continue;
        b.t += dt;
        const k = b.t / T.BURST_SEC;
        if (k >= 1) {
          b.mesh.visible = false;
          continue;
        }
        b.mesh.scale.setScalar(1 + k * 3.2);
        b.mat.opacity = 1 - k;
      }
    },
  };
}

/** The badge texture for one glyph and colour (glyph.ts paints it). */
function drawGlyph(glyph: Glyph, hex: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  paintGlyph(c.getContext('2d')!, glyph, `#${hex.toString(16).padStart(6, '0')}`, 64, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
