import * as THREE from 'three';
import type { MoveType, ObstacleKind, Spawn } from '@/contracts';
import { GLYPH, paintGlyph, type Glyph } from './glyph';
import * as LK from './look';
import type { Verdict } from './judge';
import { isReal } from './backdrop';
import { createContactShadows } from './props';
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
    // Lambert, not standard: the dark bodies look the same, and near the camera they fill a
    // large part of the screen, so the cheaper shading pays.
    body: new THREE.MeshLambertMaterial({
      color: T.COLOR_BODY,
      emissive: new THREE.Color(hex),
      emissiveIntensity: 0.22,
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

/** Looks per kind (obstacles.ts builders); the shape, colour and icon that tell the move stay. */
export const VARIANTS = 3;

/**
 * Which look an object gets: a hash of its time, so a level (and its ghost) always looks the
 * same, and neighbours rarely repeat.
 */
export function variantFor(t: number, kind: ObstacleKind): number {
  const salt = { block: 1, hurdle: 2, beam: 3, crate: 4, orb: 5 }[kind];
  const h = Math.sin(Math.round(t * 100) * 12.9898 + salt * 78.233) * 43758.5453;
  return Math.floor((h - Math.floor(h)) * VARIANTS) % VARIANTS;
}

/**
 * How much a move icon grows at `fromCamera` world units from the camera: 1 up close, then in
 * proportion to the distance (a constant size on screen), capped at ICON_GROW_MAX.
 */
export function iconGrow(fromCamera: number): number {
  return Math.min(LK.ICON_GROW_MAX, Math.max(1, fromCamera / LK.ICON_GROW_FROM));
}

export interface ObstacleView {
  readonly kind: ObstacleKind;
  readonly root: THREE.Group;
  /**
   * `variant`: 0 to VARIANTS - 1, from variantFor. `level` (1-based, a round of levels only):
   * the level's themed skin (look.ts OBSTACLE_SKIN) once its texture has loaded.
   */
  show(spawn: Spawn, length: number, variant: number, level?: number): void;
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
  /** Graphics quality 2 (Low graphics): every object shown from now on gets the neon look. */
  setLowGraphics(on: boolean): void;
  /** Frees shared geometry and every cached material, including ones not on screen. */
  dispose(): void;
}

/** A level whose backdrop style is 'real' (backdrop.ts, package C) gets realistic obstacles. */
function isRealLevel(level: number | undefined): boolean {
  return level !== undefined && isReal(level);
}

/**
 * Realistic mode, on 'real' levels (props.ts, tuning.ts REAL_PROPS): lit materials and no light
 * of their own. Bodies are painted steel, the neon bars are paint in the move's colour, the edges
 * go, and the floor markers are road paint instead of light. A hit tints everything red.
 */
function makeRealPalette(hex: number): Palette {
  const hidden = new THREE.LineBasicMaterial();
  hidden.visible = false;
  return {
    body: new THREE.MeshLambertMaterial({ color: T.REAL_PROPS.steel }),
    edge: hidden,
    glow: new THREE.MeshLambertMaterial({ color: hex }),
    tele: new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: T.REAL_PROPS.paintOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };
}

export function createObstacles(scene: THREE.Scene): Obstacles {
  // Reduced motion: crate pieces shrink where they stand, burst rings fade without expanding.
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const L = T.LANE_WIDTH;
  const W = 3 * L;
  const palettes = {} as Record<ColorKey, Palette>;
  const realPalettes = {} as Record<ColorKey, Palette>;
  for (const k of Object.keys(T.MOVE_COLOR) as ColorKey[]) {
    palettes[k] = makePalette(T.MOVE_COLOR[k]);
    realPalettes[k] = makeRealPalette(T.MOVE_COLOR[k]);
  }
  const hitPalette = makePalette(T.COLOR_HIT);
  const realHitPalette = makeRealPalette(T.COLOR_HIT);
  const shadows = createContactShadows();
  let lowGraphics = false;

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
  const guideTex = chevronTexture();
  const guideMat = new THREE.MeshBasicMaterial({
    map: guideTex,
    color: neon(T.MOVE_COLOR.sidestep, 1.2),
    transparent: true,
    opacity: LK.GUIDE_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
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

  /*
   * Themed skins: per level and kind, a texture (public/media/obstacles/tex-{level}-{kind}.jpg)
   * on the object's main faces, so a level's obstacles match its street. The shape, the neon
   * edges, the icon and the move colour (painted into every texture) stay. A skin is used only
   * once its texture has loaded; until then, or if it fails, the object keeps its neon look.
   * Hurdles and beams repeat their strip along their length (look.ts OBSTACLE_SKIN.repeat).
   */
  const S = LK.OBSTACLE_SKIN;
  type SkinKind = Exclude<ObstacleKind, 'orb'>;
  const skins = new Map<string, THREE.Material>(); // `${level}|${kind}`, once loaded
  const emblems = new Map<number, THREE.SpriteMaterial>(); // orb emblem per level, once loaded
  const skinTextures: THREE.Texture[] = [];
  const skinReady = (kind: ObstacleKind, level: number): boolean =>
    kind === 'orb' ? emblems.has(level) : skins.has(`${level}|${kind}`);
  /** Views shown before their level's skin loaded, still undecided: re-shown once it has. */
  const unskinned = new Map<ObstacleView, { level: number; again: () => void }>();
  const loader = new THREE.TextureLoader();
  let disposed = false;
  const loadTex = (url: string, onReady: (t: THREE.Texture) => void): Promise<void> =>
    new Promise((done) => {
      const tex = loader.load(
        url,
        () => {
          if (!disposed) onReady(tex);
          done();
        },
        undefined,
        () => {
          console.warn(`[game] obstacle skin ${url} did not load: neon look instead`);
          done();
        },
      );
      tex.colorSpace = THREE.SRGBColorSpace;
      skinTextures.push(tex);
    });
  // One material of the same kind, compiled with the scene (precompile), so the first skinned
  // object does not stall a frame.
  const skinProbe = new THREE.Mesh(
    planeGeo,
    new THREE.MeshLambertMaterial({ map: new THREE.Texture() }),
  );
  skinProbe.visible = false;
  scene.add(skinProbe);
  // Level by level: level 1's five arrive first (its first objects show during the intro, while
  // the level videos are loading too), then each next level well before it is reached.
  const loadLevel = (level: number): Promise<unknown> => {
    const jobs = (['block', 'hurdle', 'beam', 'crate'] as const satisfies SkinKind[]).map((kind) =>
      loadTex(`${S.dir}tex-${level}-${kind}.jpg`, (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        const img = tex.image as { width: number; height: number };
        // The face is `repeat` times as wide as high; a wider image needs fewer copies.
        tex.repeat.set(Math.max(1, Math.round(S.repeat[kind] / (img.width / img.height))), 1);
        // Real levels only (isRealLevel): a lit material, no light of its own (bloom is off there).
        skins.set(`${level}|${kind}`, new THREE.MeshLambertMaterial({ map: tex }));
      }),
    );
    jobs.push(
      loadTex(`${S.dir}tex-${level}-orb.jpg`, (tex) =>
        emblems.set(
          level,
          new THREE.SpriteMaterial({
            map: tex,
            // Cut out by its own brightness (the black background goes), drawn without glow.
            alphaMap: tex,
            transparent: true,
            depthWrite: false,
          }),
        ),
      ),
    );
    return Promise.all(jobs).then(() => {
      for (const u of [...unskinned.values()]) if (u.level === level) u.again();
    });
  };
  void (async () => {
    for (let level = 1; level <= S.levels && !disposed; level++) await loadLevel(level);
  })();
  /** Puts level `level`'s skin on the parts tagged `skin`; false if it is not loaded. */
  const applySkin = (root: THREE.Object3D, kind: SkinKind, level: number | undefined): boolean => {
    const m = level === undefined ? undefined : skins.get(`${level}|${kind}`);
    if (!m) return false;
    root.traverse((o) => {
      if (o.userData.skin && o instanceof THREE.Mesh) o.material = m;
    });
    return true;
  };
  /** A hit on a real level: the skinned faces turn red (the texture tinted, still lit). */
  const skinHits = new Map<THREE.Material, THREE.MeshLambertMaterial>();
  const applySkinHit = (root: THREE.Object3D): void =>
    root.traverse((o) => {
      if (!o.userData.skin || !(o instanceof THREE.Mesh)) return;
      const m = o.material as THREE.MeshLambertMaterial;
      let red = skinHits.get(m);
      if (!red) {
        red = m.clone();
        red.color.setHex(T.REAL_PROPS.hitTint);
        skinHits.set(m, red);
      }
      o.material = red;
    });

  /** `keepSkin`: leave the skinned faces as they are (a real hit tints them itself). */
  const applyPalette = (root: THREE.Object3D, p: Palette, keepSkin = false): void => {
    root.traverse((o) => {
      const role = o.userData.role as Role | undefined;
      if (keepSkin && o.userData.skin) return;
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
  const pipeGeo = new THREE.CylinderGeometry(0.27, 0.27, W + 0.6, 16, 1);
  const bandGeo = new THREE.TorusGeometry(0.3, 0.035, 6, 24);
  const crystalSource = new THREE.OctahedronGeometry(T.ORB_RADIUS * 1.25, 0);
  const crystalGeo = {
    core: new THREE.OctahedronGeometry(T.ORB_RADIUS * 0.9, 0),
    shell: new THREE.EdgesGeometry(crystalSource),
    ring: new THREE.TorusGeometry(T.ORB_RADIUS * 1.6, 0.025, 6, 40),
  };
  crystalSource.dispose();
  const gemSource = new THREE.DodecahedronGeometry(T.ORB_RADIUS * 1.35, 0);
  const gemGeo = {
    core: new THREE.SphereGeometry(T.ORB_RADIUS * 0.7, 16, 12),
    shell: new THREE.EdgesGeometry(gemSource),
  };
  gemSource.dispose();

  /**
   * What a builder returns. `makeView` turns it into a pooled ObstacleView: it colours the
   * parts by move on `show`, turns them red on a hit, and calls the optional hooks.
   */
  interface Parts {
    root: THREE.Group;
    /**
     * Reset for reuse and fit to this spawn (lanes, hold length, look). Called after the move's
     * palette is applied, so it can put the level's skin over it (applySkin).
     */
    configure(spawn: Spawn, length: number, variant: number, level?: number): void;
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
    let goesPast = false; // a hit or a missed orb: hidden once it is past the runner
    // Realistic mode (isRealLevel): the contact shadows show only then.
    const realOnly: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (o.userData.realOnly) realOnly.push(o);
    });
    let real = false;
    const view: ObstacleView = {
      kind,
      root,
      show(spawn, length, variant, level) {
        // Realistic on a 'real' level once this kind's skin has loaded; until then, if it fails,
        // on a 'neon' level and with Low graphics: today's neon object, unchanged.
        const wantsReal = !lowGraphics && isRealLevel(level);
        // Shown before its level's skin arrived (the first objects appear on the round's first
        // frame): shown again with it once it loads, while still undecided (see loadLevel).
        if (wantsReal && !skinReady(kind, level!))
          unskinned.set(view, {
            level: level!,
            again: () => view.show(spawn, length, variant, level),
          });
        else unskinned.delete(view);
        real = wantsReal && skinReady(kind, level!);
        goesPast = false;
        const key = colorKeyFor(spawn.requires);
        applyPalette(root, (real ? realPalettes : palettes)[key]);
        for (const o of realOnly) o.visible = real;
        if (icon && glyph) icon.material = iconMaterial(glyph, key);
        if (icon) icon.visible = true;
        // The level goes to the builder only when real: it puts the level's skin on then.
        parts.configure(spawn, length, variant % VARIANTS, real ? level : undefined);
        root.visible = true;
      },
      engage(attractor) {
        unskinned.delete(view); // a crate mid-smash or an orb in flight keeps its look
        parts.engage?.(attractor);
      },
      setVerdict(v) {
        unskinned.delete(view); // decided: no more look changes
        // A cleared object's icon goes: it would pass over the runner and hide the move.
        if ((v === 'cleared' || v === 'collected') && icon) icon.visible = false;
        if (v === 'hit' || v === 'missed') goesPast = true;
        if (v !== 'hit') return;
        if (real) {
          applySkinHit(root); // the skinned faces first, then the rest (it keeps them)
          applyPalette(root, realHitPalette, true);
        } else applyPalette(root, hitPalette);
        if (icon && glyph) icon.material = iconMaterial(glyph, 'hit');
        parts.onHit?.();
      },
      tick(dt, time) {
        // Past the runner the icon has said its piece; a missed object's red icon would
        // otherwise pass right by the camera.
        if (icon?.visible && root.position.z > LK.ICON_HIDE_PAST) icon.visible = false;
        if (goesPast && root.visible && root.position.z > LK.MISSED_HIDE_PAST) root.visible = false;
        if (icon) {
          // Far away the icon grows, so it keeps a readable size on screen (look.ts); it grows
          // upward from its base, so it never sinks into its own object. A block's icon stays
          // centred in the free lane.
          const size = T.ICON_SIZE * iconGrow(T.CAMERA_POS.z - root.position.z);
          icon.scale.setScalar(size);
          const base = kind === 'block' || kind === 'orb' ? 0 : T.ICON_HEIGHT[kind];
          if (base > 0) icon.position.y = base + (size - T.ICON_SIZE) / 2;
        }
        parts.tick?.(dt, time);
      },
    };
    return view;
  }

  /* ── Builders, one per kind ── */

  /** A thin glowing bar, rotated in the front plane by `angle`. */
  const slat = (w: number, h: number, angle: number): THREE.Mesh => {
    const m = glowBox(w, h, 0.05);
    m.rotation.z = angle;
    return m;
  };
  /** Shows look `variant` of a list of look groups, hides the rest. */
  const pickLook = (looks: readonly THREE.Object3D[], variant: number): void =>
    looks.forEach((g, i) => (g.visible = i === variant));
  /** Marks a neonBox's body as the face a level skin goes on. */
  const skinned = (grp: THREE.Group): THREE.Group => {
    grp.children[0]!.userData.skin = true;
    return grp;
  };
  const looksOf = (parent: THREE.Object3D, n = VARIANTS): THREE.Group[] =>
    Array.from({ length: n }, () => {
      const g = new THREE.Group();
      parent.add(g);
      return g;
    });

  function buildBlock(): Parts {
    const root = new THREE.Group();
    const H = T.BLOCK_HEIGHT;
    const w = L * 0.86;
    const looks: THREE.Group[][] = [];
    // Every look is the same solid wall (it must read as "not this lane"); only its lights differ.
    const walls = [-1, 0, 1].map((lane) => {
      const g = new THREE.Group();
      g.position.x = laneX(lane);
      const wall = skinned(neonBox(w, H, T.BLOCK_DEPTH));
      wall.position.set(0, H / 2, -T.BLOCK_DEPTH / 2);
      g.add(wall, shadows.make(w, T.BLOCK_DEPTH));
      const [a, b, c] = looksOf(g);
      // 0: one bright stripe.
      const stripe = glowBox(w, 0.08, 0.06);
      stripe.position.set(0, H * 0.62, 0.02);
      a!.add(stripe);
      // 1: hazard barrier, diagonal slats and a lit top edge.
      for (let k = -1; k <= 1; k++) {
        const s = slat(0.09, H * 0.62, 0.55);
        s.position.set(k * w * 0.3, H * 0.45, 0.03);
        b!.add(s);
      }
      const lip = glowBox(w, 0.07, 0.07);
      lip.position.set(0, H + 0.02, 0.02);
      b!.add(lip);
      // 2: cargo container, vertical ribs and a beacon on top.
      for (let k = 0; k < 4; k++) {
        const rib = glowBox(0.05, H * 0.8, 0.05);
        rib.position.set(-w * 0.375 + (k * w * 0.75) / 3, H / 2, 0.03);
        c!.add(rib);
      }
      const beacon = glowBox(0.3, 0.14, 0.3);
      beacon.position.set(0, H + 0.08, -T.BLOCK_DEPTH / 2);
      c!.add(beacon);
      looks.push([a!, b!, c!]);
      root.add(g);
      return g;
    });
    // The free lane gets the floor marker and the "go here" icon.
    // The free lane: bright chevrons on the floor pointing ahead, "go here" (look.ts).
    const guide = new THREE.Mesh(planeGeo, guideMat);
    guide.rotation.x = -Math.PI / 2;
    guide.position.y = 0.025;
    guide.scale.set(L * 0.8, T.TELEGRAPH_LENGTH * 1.4, 1);
    guide.position.z = -(T.TELEGRAPH_LENGTH * 1.4) / 2 + 1;
    const sprite = makeIcon();
    sprite.position.y = T.ICON_HEIGHT.block;
    root.add(guide, sprite);
    return {
      root,
      icon: sprite,
      configure(spawn, _length, variant, level) {
        const free = ([-1, 0, 1] as const).find((l) => !spawn.lanes.includes(l)) ?? 0;
        walls.forEach((g, i) => (g.visible = spawn.lanes.includes((i - 1) as -1 | 0 | 1)));
        // A skinned wall carries its own cyan bands: no extra lights on it.
        const skin = applySkin(root, 'block', level);
        for (const l of looks) pickLook(l, skin ? -1 : variant);
        guide.position.x = sprite.position.x = laneX(free);
      },
    };
  }

  function buildHurdle(): Parts {
    const root = new THREE.Group();
    const H = T.HURDLE_HEIGHT;
    // Every look keeps the full-width panel at the same height: "jump this".
    const panel = tag(new THREE.Mesh(planeGeo, placeholder.tele), 'tele');
    panel.scale.set(W, H, 1);
    panel.position.y = H / 2;
    root.add(panel);
    const [a, b, c] = looksOf(root);
    // 0: a bar on two posts.
    const bar = glowBox(W, 0.12, 0.12);
    bar.position.y = H;
    const bar2 = glowBox(W, 0.05, 0.05);
    bar2.position.y = H * 0.45;
    a!.add(bar, bar2);
    for (const s of [-1, 1]) {
      const post = neonBox(0.18, H + 0.15, 0.18);
      post.position.set((s * W) / 2, (H + 0.15) / 2, 0);
      a!.add(post);
    }
    // 1: a laser fence, three beams between emitter boxes.
    for (const y of [H * 0.3, H * 0.65, H]) {
      const beam = glowBox(W, 0.045, 0.045);
      beam.position.y = y;
      b!.add(beam);
    }
    for (const s of [-1, 1]) {
      const emitter = neonBox(0.3, H + 0.2, 0.3);
      emitter.position.set((s * (W + 0.3)) / 2, (H + 0.2) / 2, 0);
      b!.add(emitter);
    }
    // 2: a low solid wall with jump chevrons on its face.
    const wall = skinned(neonBox(W, H, 0.35));
    wall.position.set(0, H / 2, -0.175);
    const lip = glowBox(W, 0.07, 0.07);
    lip.position.set(0, H, 0.02);
    c!.add(wall, lip, shadows.make(W, 0.35));
    for (let lane = -1; lane <= 1; lane++)
      for (const s of [-1, 1]) {
        const arm = slat(0.06, 0.3, s * 0.8);
        arm.position.set(laneX(lane) + s * 0.1, H * 0.5, 0.03);
        c!.add(arm);
      }
    const plate = floorPlate();
    plate.scale.set(W, 2.5, 1);
    plate.position.z = 1.25;
    const sprite = makeIcon();
    sprite.position.y = T.ICON_HEIGHT.hurdle;
    root.add(plate, sprite);
    const looks = [a!, b!, c!];
    return {
      root,
      icon: sprite,
      // A skin goes on the low wall (look 2), the look with a solid face.
      configure: (_s, _l, v, level) => {
        const skin = applySkin(root, 'hurdle', level);
        pickLook(looks, skin ? 2 : v);
        // The see-through move-colour sheet is neon: a real hurdle is its solid wall.
        panel.visible = !skin;
      },
    };
  }

  function buildBeam(): Parts {
    const root = new THREE.Group();
    const top = T.BEAM_HEIGHT;
    // Front: a solid piece whose underside is always at BEAM_HEIGHT. A long (held) beam
    // continues as an open frame of rails and ribs, so the camera, which sits above the beam,
    // still sees the runner underneath.
    const [a, b, c] = looksOf(root);
    // 0: a slab.
    const slab = skinned(neonBox(W + 0.6, 0.45, T.BEAM_MIN_DEPTH));
    slab.position.set(0, top + 0.225, -T.BEAM_MIN_DEPTH / 2);
    a!.add(slab);
    // 1: a truss gantry with lamps hanging under it.
    const truss = neonBox(W + 0.6, 0.12, T.BEAM_MIN_DEPTH);
    truss.position.set(0, top + 0.06, -T.BEAM_MIN_DEPTH / 2);
    const trussTop = neonBox(W + 0.6, 0.12, T.BEAM_MIN_DEPTH);
    trussTop.position.set(0, top + 0.58, -T.BEAM_MIN_DEPTH / 2);
    b!.add(truss, trussTop);
    for (let k = 0; k < 6; k++) {
      const strut = slat(0.06, 0.62, k % 2 === 0 ? 0.75 : -0.75);
      strut.position.set(-W / 2 + (k + 0.5) * (W / 6), top + 0.32, 0.03);
      b!.add(strut);
    }
    // 2: a fat pipe with glowing bands.
    const pipe = tag(new THREE.Mesh(pipeGeo, placeholder.body), 'body');
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, top + 0.27, -0.27);
    c!.add(pipe);
    for (let k = -2; k <= 2; k++) {
      const band = tag(new THREE.Mesh(bandGeo, placeholder.glow), 'glow');
      band.rotation.y = Math.PI / 2;
      band.position.set(k * L * 0.6, top + 0.27, -0.27);
      c!.add(band);
    }
    const lip = glowBox(W + 0.6, 0.07, 0.07);
    lip.position.set(0, top, 0.02);
    root.add(lip);
    const looks = [a!, b!, c!];

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
      // A shadow at each post's foot, in the post's own space (it follows the back posts).
      for (const post of [front, back]) {
        const sh = shadows.make(0.2, 0.2, 0, 0.1);
        sh.position.y -= top / 2;
        post.add(sh);
      }
      root.add(front, back);
    }
    const sprite = makeIcon();
    sprite.position.y = T.ICON_HEIGHT.beam;
    root.add(sprite);
    return {
      root,
      icon: sprite,
      configure(_spawn, length, variant, level) {
        // A skin goes on the slab (look 0), the look with a solid face.
        pickLook(looks, applySkin(root, 'beam', level) ? 0 : variant);
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
    type Piece = { obj: THREE.Group; home: THREE.Vector3; vel: THREE.Vector3; spin: THREE.Vector3 };
    // Every look fills the whole track up to CRATE_HEIGHT ("smash this"), in pieces that fly.
    const looks = looksOf(root);
    const lookPieces: Piece[][] = looks.map(() => []);
    const addPiece = (look: number, obj: THREE.Group, col: number, row: number, rows: number) => {
      const home = obj.position.clone();
      looks[look]!.add(obj);
      lookPieces[look]!.push({
        obj,
        home,
        // Out to the sides (the middle column splits left and right), only a little up.
        vel: new THREE.Vector3(
          (col !== 0 ? col * 3.2 : row % 2 === 0 ? -2.4 : 2.4) * LK.SMASH_SIDEWAYS,
          (3.5 + (row / rows) * 5) * LK.SMASH_LIFT,
          -2 - row,
        ),
        spin: new THREE.Vector3(2 + col, 3 - row * 2, col * 2.5 + 1),
      });
    };
    // 0: two rows of three crates with a cross on each.
    const h = crateRow;
    for (let row = 0; row < 2; row++)
      for (let lane = -1; lane <= 1; lane++) {
        const obj = skinned(neonBox(L * 0.92, h - 0.08, 0.8));
        obj.add(tag(new THREE.LineSegments(crossGeo, placeholder.edge), 'edge'));
        obj.position.set(laneX(lane), row * h + h / 2, -0.4);
        addPiece(0, obj, lane, row, 2);
      }
    // 1: a stack of nine smaller cubes.
    const h3 = T.CRATE_HEIGHT / 3;
    for (let row = 0; row < 3; row++)
      for (let lane = -1; lane <= 1; lane++) {
        const obj = neonBox(L * 0.9, h3 - 0.07, 0.7);
        obj.position.set(laneX(lane), row * h3 + h3 / 2, -0.35);
        addPiece(1, obj, lane, row, 3);
      }
    // 2: a wall of glass panes with glowing frames.
    for (let row = 0; row < 2; row++)
      for (let lane = -1; lane <= 1; lane++) {
        const obj = neonBox(L * 0.95, h - 0.05, 0.16);
        const bar = glowBox(L * 0.95, 0.05, 0.05);
        bar.position.set(0, (h - 0.05) / 2, 0.06);
        const mid = slat(0.04, h * 0.8, 0.35);
        mid.position.z = 0.09;
        obj.add(bar, mid);
        obj.position.set(laneX(lane), row * h + h / 2, -0.08);
        addPiece(2, obj, lane, row, 2);
      }
    let pieces = lookPieces[0]!;
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
    // The stack's shadow (real levels: shown by makeView), gone with the stack once it smashes.
    const stackShadow = shadows.make(W, 0.8);
    root.add(plate, stackShadow);
    const sprite = makeIcon();
    sprite.position.y = T.ICON_HEIGHT.crate;
    root.add(sprite);

    let smashT = -1;
    const smash = (): void => {
      if (smashT < 0) smashT = 0;
      sprite.visible = false;
      stackShadow.visible = false;
    };
    return {
      root,
      icon: sprite,
      configure(spawn, length, variant, level) {
        smashT = -1;
        sprite.visible = true;
        // A skin goes on the six crates (look 0), the look made of crate faces.
        const v = applySkin(root, 'crate', level) ? 0 : variant;
        pickLook(looks, v);
        pieces = lookPieces[v]!;
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
        const fly = reduceMotion ? 0 : t; // reduced motion: no flight, no spin
        for (const p of pieces) {
          p.obj.position.set(
            p.home.x + p.vel.x * fly,
            p.home.y + p.vel.y * fly - 4.9 * fly * fly,
            p.home.z + p.vel.z * fly,
          );
          p.obj.rotation.set(p.spin.x * fly, p.spin.y * fly, p.spin.z * fly);
          // Gone in SMASH_SHRINK_SEC: the pieces never sweep across the camera (look.ts).
          p.obj.scale.setScalar(Math.max(0.01, 1 - t / LK.SMASH_SHRINK_SEC));
          p.obj.visible = t < LK.SMASH_SHRINK_SEC;
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
      // Same size and height in every look: a glowing thing to grab.
      const looks = looksOf(float);
      // 0: a faceted orb in a wire shell with a halo.
      const shell = tag(new THREE.LineSegments(orbGeo.shell, placeholder.edge), 'edge');
      const halo = tag(new THREE.Mesh(orbGeo.halo, placeholder.glow), 'glow');
      looks[0]!.add(tag(new THREE.Mesh(orbGeo.core, placeholder.glow), 'glow'), shell, halo);
      // 1: a crystal in two crossed rings.
      const crystalShell = tag(new THREE.LineSegments(crystalGeo.shell, placeholder.edge), 'edge');
      const ringA = tag(new THREE.Mesh(crystalGeo.ring, placeholder.glow), 'glow');
      const ringB = tag(new THREE.Mesh(crystalGeo.ring, placeholder.glow), 'glow');
      ringB.rotation.y = Math.PI / 2;
      const rings = new THREE.Group();
      rings.add(ringA, ringB);
      looks[1]!.add(tag(new THREE.Mesh(crystalGeo.core, placeholder.glow), 'glow'));
      looks[1]!.add(crystalShell, rings);
      // 2: a gem: a bright core in a dodecahedral cage.
      const cage = tag(new THREE.LineSegments(gemGeo.shell, placeholder.edge), 'edge');
      looks[2]!.add(tag(new THREE.Mesh(gemGeo.core, placeholder.glow), 'glow'), cage);
      const spinners = [shell, crystalShell, cage];
      // The level's emblem (look.ts OBSTACLE_SKIN), shown instead of the looks once loaded.
      const emblem = new THREE.Sprite();
      emblem.scale.setScalar(LK.OBSTACLE_SKIN.emblemSize);
      emblem.visible = false;
      float.add(emblem);
      const pillar = tag(new THREE.Mesh(orbGeo.pillar, placeholder.tele), 'tele');
      pillar.scale.y = T.ORB_HEIGHT;
      pillar.position.y = T.ORB_HEIGHT / 2;
      const plate = floorPlate();
      plate.scale.set(L * 0.7, L * 0.7, 1);
      // A small soft shadow under the floating orb (real levels), gone once it is collected.
      const shadow = shadows.make(0.6, 0.6, 0, 0.3);
      g.add(float, pillar, plate, shadow);
      root.add(g);
      return { g, float, looks, spinners, halo, rings, emblem, shadow };
    });
    let collectT = -1;
    let attract: (() => THREE.Vector3) | null = null;
    const local = new THREE.Vector3();
    return {
      root,
      configure(spawn, _length, variant, level) {
        collectT = -1;
        attract = null;
        const emblem = level === undefined ? undefined : emblems.get(level);
        orbs.forEach((o, i) => {
          pickLook(o.looks, emblem ? -1 : variant);
          o.emblem.visible = emblem !== undefined;
          if (emblem) o.emblem.material = emblem;
          o.g.visible = spawn.lanes.includes((i - 1) as -1 | 0 | 1);
          o.float.scale.setScalar(1);
          o.float.position.set(0, T.ORB_HEIGHT, 0);
        });
      },
      engage(attractor) {
        if (collectT >= 0) return;
        collectT = 0;
        attract = attractor ?? null;
        for (const o of orbs) o.shadow.visible = false;
      },
      tick(dt, time) {
        if (collectT >= 0) collectT += dt;
        const k = collectT >= 0 ? Math.min(1, collectT / T.COLLECT_SEC) : 0;
        for (const o of orbs) {
          for (const s of o.spinners) s.rotation.set(time * 0.9, time * 1.3, 0);
          o.halo.rotation.set(Math.PI / 2 + Math.sin(time * 2) * 0.3, 0, time);
          o.rings.rotation.set(time * 1.1, time * 0.7, 0);
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
      unskinned.delete(view);
      view.root.visible = false;
      free[view.kind].push(view);
    },
    setLowGraphics(on) {
      lowGraphics = on;
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
      guideTex.dispose();
      guideMat.dispose();
      crossGeo.dispose();
      for (const g of [
        ...Object.values(orbGeo),
        ...Object.values(crystalGeo),
        ...Object.values(gemGeo),
        pipeGeo,
        bandGeo,
      ])
        g.dispose();
      const allPalettes = [palettes, realPalettes].flatMap((ps) => Object.values(ps));
      for (const p of [...allPalettes, hitPalette, realHitPalette])
        for (const m of Object.values(p)) m.dispose();
      for (const m of skinHits.values()) m.dispose();
      shadows.dispose();
      skinProbe.material.map?.dispose();
      for (const m of iconMats.values()) {
        m.map?.dispose();
        m.dispose();
      }
      ringGeo.dispose();
      disposed = true;
      for (const m of [...skins.values(), ...emblems.values(), skinProbe.material]) m.dispose();
      for (const t of skinTextures) t.dispose();
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
        b.mesh.scale.setScalar(reduceMotion ? 1.6 : 1 + k * 3.2);
        b.mat.opacity = 1 - k;
      }
    },
  };
}

/**
 * The badge texture for one glyph and colour. glyph.ts paints it (the same icon as the 2D
 * fallback); here it is painted at a higher resolution and thickened by stamping it in a small
 * circle, so strokes read bolder from 2 m and the dark disc behind it is more solid.
 */
function drawGlyph(glyph: Glyph, hex: number): THREE.CanvasTexture {
  const size = LK.ICON_TEXTURE;
  const k = size / 128; // glyph.ts draws in a 128-pixel box
  const grow = LK.ICON_STROKE_BOOST * k;
  const base = document.createElement('canvas');
  base.width = base.height = size;
  const r = size / 2 - grow;
  paintGlyph(
    base.getContext('2d')!,
    glyph,
    `#${hex.toString(16).padStart(6, '0')}`,
    size / 2,
    size / 2,
    r,
  );
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.drawImage(base, Math.cos(a) * grow, Math.sin(a) * grow);
  }
  g.drawImage(base, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** White chevrons pointing ahead (up the texture = toward the horizon once laid on the floor). */
function chevronTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 18;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const n = LK.GUIDE_CHEVRONS;
  for (let i = 0; i < n; i++) {
    const y = 40 + (i * (c.height - 80)) / Math.max(1, n - 1);
    // The canvas top lies furthest down the track: the nearest chevron (bottom) is the brightest.
    g.globalAlpha = 1 - ((n - 1 - i) / n) * 0.45;
    g.beginPath();
    g.moveTo(18, y + 34);
    g.lineTo(64, y - 6);
    g.lineTo(110, y + 34);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
