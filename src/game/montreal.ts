// The skyline you run past is Montreal.
//
// Why this is geometry and not photographs: the camera moves forward while the
// player moves sideways between lanes, so the scene has to show parallax —
// near buildings sliding past faster than far ones, and the whole skyline
// shifting when you change lane. A photo or a generated video cannot do that
// (a video is one fixed camera path and can't react to the player), so an
// image-based backdrop reads as a painted flat sliding past. Boxes give real
// parallax for a few hundred bytes.
//
// Heights are the real ones in metres, converted by SCALE, so the relative
// profile is honest: Place Ville Marie really does stand over Square
// Victoria, and 1000 de La Gauchetière really is the tallest thing downtown.
//
// Layout is deterministic: every round shows the same city in the same order.

/** Game units per real metre. 205 m (the tallest) lands at ~23 units. */
const SCALE = 0.112;

/** One box in a landmark's silhouette, in metres, relative to the landmark. */
interface Part {
  /** Across the track, from the landmark's own centre. */
  dx: number;
  /** Along the track, from the landmark's own centre. */
  dz: number;
  /** Width across, depth along, height up. */
  w: number;
  d: number;
  h: number;
  /** Lift off the ground — used for the cross arm and the bridge deck. */
  base?: number;
  /** Lean along the track, in radians. The Montréal Tower is the point of this. */
  lean?: number;
  /** Mark the roofline with the second cap colour. */
  alt?: boolean;
  /** No lit roofline at all — for hillsides and bridge piers. */
  bare?: boolean;
}

export interface Landmark {
  name: string;
  /** Distance along the route, in metres from the start. */
  at: number;
  /** Which side of the track. */
  side: -1 | 1;
  /**
   * Distance back from the track edge, in GAME UNITS, not metres.
   *
   * The track is about 3 units wide and the towers are 15+ tall, so the game's
   * proportions are stylized rather than literal — a true 30 m setback would
   * put Place Ville Marie in the player's lane. These are staging distances,
   * chosen so each landmark clears the lanes and reads against the fog.
   */
  setback: number;
  parts: readonly Part[];
}

/**
 * The route: downtown, south to the Old Port, then east to the Olympic park,
 * with the mountain standing over the whole thing. Ordered the way you meet
 * them, not the way they sit on a map — this is a run through the city, not a
 * survey of it.
 */
export const LANDMARKS: readonly Landmark[] = [
  // ── Downtown core ──────────────────────────────────────────────────────
  {
    // Cruciform floor plan: four wings off a centre. Unmistakable from any angle.
    name: "Place Ville Marie",
    at: 120,
    side: -1,
    setback: 17,
    parts: [
      { dx: 0, dz: 0, w: 18, d: 60, h: 188 },
      { dx: 0, dz: 0, w: 60, d: 18, h: 188 },
    ],
  },
  {
    // Tallest in the city, and the sloped copper roof is the giveaway.
    name: "1000 de La Gauchetière",
    at: 190,
    side: 1,
    setback: 21,
    parts: [
      { dx: 0, dz: 0, w: 44, d: 44, h: 170 },
      { dx: 0, dz: 0, w: 30, d: 30, h: 200 },
      { dx: 0, dz: 0, w: 14, d: 14, h: 205, alt: true },
    ],
  },
  {
    // A plain black slab — it reads by proportion, so keep it narrow and tall.
    name: "Tour de la Bourse",
    at: 260,
    side: -1,
    setback: 15,
    parts: [{ dx: 0, dz: 0, w: 42, d: 42, h: 194 }],
  },
  {
    name: "Tour CIBC",
    at: 300,
    side: 1,
    setback: 19,
    parts: [{ dx: 0, dz: 0, w: 34, d: 34, h: 187, alt: true }],
  },
  {
    name: "Complexe Desjardins",
    at: 350,
    side: -1,
    setback: 25,
    parts: [
      { dx: -24, dz: 0, w: 30, d: 30, h: 110 },
      { dx: 16, dz: 10, w: 26, d: 26, h: 130 },
    ],
  },

  // ── The mountain, standing over downtown ───────────────────────────────
  {
    // Stepped slopes rather than one block, so it reads as a hill and not a
    // building. The cross sits on top, lit, the way it is every night.
    // The summit is 233 m and the cross on it is another 31 m. Nothing
    // downtown is allowed to reach either: the city's height bylaw caps
    // buildings below the mountain, which is why 1000 de La Gauchetière
    // stops at 205. The skyline has to honour that or it isn't Montreal.
    name: "Mont Royal",
    at: 430,
    side: -1,
    setback: 52,
    parts: [
      { dx: -70, dz: 0, w: 90, d: 150, h: 130, bare: true },
      { dx: 0, dz: 0, w: 110, d: 170, h: 233, bare: true },
      { dx: 62, dz: 0, w: 80, d: 150, h: 150, bare: true },
      // The cross: upright, then the arm across it.
      { dx: 0, dz: 0, w: 4, d: 4, h: 264, alt: true },
      { dx: 0, dz: 0, w: 18, d: 4, h: 6, base: 243, alt: true },
    ],
  },

  // ── Old Port and the river ─────────────────────────────────────────────
  {
    // Stacked, offset cubes. The offsets are the whole idea of the building.
    name: "Habitat 67",
    at: 540,
    side: 1,
    setback: 9,
    parts: [
      { dx: 0, dz: -16, w: 16, d: 16, h: 16 },
      { dx: 10, dz: 0, w: 16, d: 16, h: 16 },
      { dx: -8, dz: 14, w: 16, d: 16, h: 16 },
      { dx: 4, dz: -4, w: 16, d: 16, h: 32, alt: true },
      { dx: 14, dz: 12, w: 16, d: 16, h: 32 },
      { dx: -4, dz: 2, w: 16, d: 16, h: 48, alt: true },
    ],
  },
  {
    // The grain elevator sign on the waterfront — a wide, low mass with the
    // lit sign sitting on its roof.
    name: "Farine Five Roses",
    at: 600,
    side: -1,
    setback: 9,
    parts: [
      { dx: 0, dz: 0, w: 70, d: 24, h: 40, bare: true },
      { dx: 0, dz: 0, w: 46, d: 3, h: 9, base: 42, alt: true },
    ],
  },
  {
    // Buckminster Fuller's geodesic sphere, approximated as a stack of slabs
    // that narrows toward the top — a dome silhouette without a sphere mesh.
    name: "Biosphère",
    at: 660,
    side: 1,
    setback: 12,
    parts: [
      { dx: 0, dz: 0, w: 62, d: 62, h: 20, bare: true },
      { dx: 0, dz: 0, w: 54, d: 54, h: 38, bare: true },
      { dx: 0, dz: 0, w: 38, d: 38, h: 52, bare: true },
      { dx: 0, dz: 0, w: 18, d: 18, h: 62, alt: true },
    ],
  },
  {
    // Two towers and a deck between them. Lit along the span the way the
    // bridge is now.
    name: "Pont Jacques-Cartier",
    at: 730,
    side: 1,
    setback: 24,
    parts: [
      { dx: -40, dz: 0, w: 10, d: 10, h: 104, bare: true },
      { dx: 40, dz: 0, w: 10, d: 10, h: 104, bare: true },
      { dx: 0, dz: 0, w: 92, d: 6, h: 5, base: 62, alt: true },
    ],
  },

  // ── Olympic park ───────────────────────────────────────────────────────
  {
    // The tallest inclined tower in the world. The lean is the landmark, so
    // it leans — 45 degrees, hanging out over the stadium bowl.
    name: "Tour de Montréal",
    at: 830,
    side: -1,
    setback: 24,
    parts: [
      { dx: 0, dz: 0, w: 104, d: 104, h: 36, bare: true },
      { dx: 0, dz: 0, w: 20, d: 26, h: 165, lean: 0.62, alt: true },
    ],
  },
];

/** Fractional part, used only to turn a hash into a 0..1 layout value. */
function wrap01(n: number): number {
  return n - Math.floor(n);
}

/** A single box the renderer draws, in game units, ready for an instance matrix. */
export interface SkylineBox {
  x: number;
  /** Position along the route, before the track-length wrap. */
  z: number;
  w: number;
  d: number;
  h: number;
  /** Centre height — already accounts for `base` and lean. */
  cy: number;
  lean: number;
  alt: boolean;
  bare: boolean;
}

/**
 * Flatten the landmarks into boxes in game units.
 *
 * `routeLength` is the distance the skyline wraps over, so the city repeats
 * seamlessly for as long as the round lasts. `trackHalfWidth` keeps every
 * building clear of the lanes.
 */
export function buildSkyline(routeLength: number, trackHalfWidth: number): SkylineBox[] {
  const boxes: SkylineBox[] = [];
  const span = LANDMARKS.reduce((max, l) => Math.max(max, l.at), 0) + 90;

  // City fabric between the landmarks.
  //
  // Eleven landmarks over the loop leaves long empty stretches, and a city is
  // mostly not landmarks — it is the grey-stone low-rise you run past on the
  // way to one. These fill the gaps so the skyline is continuous and the
  // landmarks read as punctuation in it rather than objects in a void.
  // Deterministic, so every round shows the same street.
  const FILL = 68;
  for (let i = 0; i < FILL; i++) {
    const r1 = wrap01(Math.sin(i * 12.9898) * 43758.5453);
    const r2 = wrap01(Math.sin(i * 78.233) * 12345.678);
    const r3 = wrap01(Math.sin(i * 39.425) * 24634.123);
    const side: -1 | 1 = i % 2 === 0 ? -1 : 1;
    // Downtown blocks run taller; the further out, the lower the rooflines,
    // the way the city actually falls away from the core.
    const depth = 11 + r1 * 26;
    const tall = depth < 20 ? 1 : 0.55;
    boxes.push({
      x: side * (trackHalfWidth + depth),
      z: (i / FILL) * routeLength,
      w: 2.2 + r2 * 3.4,
      d: 2.2 + r3 * 3.4,
      h: (4 + r1 * r2 * 20 + r2 * 5) * tall,
      cy: ((4 + r1 * r2 * 20 + r2 * 5) * tall) / 2,
      lean: 0,
      alt: r2 > 0.68,
      bare: r3 > 0.72,
    });
  }

  for (const lm of LANDMARKS) {
    for (const p of lm.parts) {
      const h = p.h * SCALE;
      const base = (p.base ?? 0) * SCALE;
      const lean = p.lean ?? 0;
      // A leaning box pivots about its foot, so its centre swings inward and
      // drops; without this the tower would float off its own base.
      const half = h / 2;
      const cy = base + (lean ? half * Math.cos(lean) : half);
      boxes.push({
        // Setback is already in game units; only the within-landmark offset
        // is a real measurement and needs converting.
        x: lm.side * (trackHalfWidth + lm.setback + p.dx * SCALE),
        z: ((lm.at + p.dz) / span) * routeLength,
        w: Math.max(0.25, p.w * SCALE),
        d: Math.max(0.25, p.d * SCALE),
        h,
        cy,
        lean: lean * lm.side,
        alt: p.alt ?? false,
        bare: p.bare ?? false,
      });
    }
  }
  return boxes;
}
