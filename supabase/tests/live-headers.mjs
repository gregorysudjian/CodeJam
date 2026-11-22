// Checks the live site's caching headers (docs/LIVE.md, "Caching"). Node built-ins only.
//   node supabase/tests/live-headers.mjs [siteUrl]
// PASS when hashed /assets are immutable for a year, the pose model and WASM are cached a day
// with stale-while-revalidate, and the page itself is never cached (so a deploy shows at once).
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SITE = (process.argv[2] ?? 'https://codejam-jet.vercel.app').replace(/\/$/, '');

const html = await (await fetch(SITE + '/')).text();
const asset = html.match(/\/assets\/index-[^"]+\.js/)?.[0];
const checks = [
  ['/', (cc) => /max-age=0/.test(cc) && /must-revalidate/.test(cc), 'max-age=0, must-revalidate'],
  [
    asset,
    (cc) => /max-age=31536000/.test(cc) && /immutable/.test(cc),
    'max-age=31536000, immutable',
  ],
  [
    '/models/pose_landmarker_lite.task',
    (cc) => /max-age=86400/.test(cc) && /stale-while-revalidate/.test(cc),
    'max-age=86400, stale-while-revalidate',
  ],
  [
    '/mediapipe/wasm/vision_wasm_internal.wasm',
    (cc) => /max-age=86400/.test(cc) && /stale-while-revalidate/.test(cc),
    'max-age=86400, stale-while-revalidate',
  ],
];
// Backdrops and obstacle images (hx-media): checked once a file exists in public/media/ here.
// An explicit walk: readdirSync's `recursive` option is ignored by older Node versions, which
// would make this check skip itself without a word.
const mediaDir = fileURLToPath(new URL('../../public/media/', import.meta.url));
const walk = (rel) =>
  readdirSync(mediaDir + rel, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${rel}${e.name}/`) : [`${rel}${e.name}`],
  );
const firstMedia = existsSync(mediaDir) ? walk('').sort()[0] : undefined;
if (firstMedia)
  checks.push([
    '/media/' + firstMedia.split('/').map(encodeURIComponent).join('/'),
    (cc) => /max-age=86400/.test(cc) && /stale-while-revalidate/.test(cc),
    'max-age=86400, stale-while-revalidate',
    { skipIfMissing: true },
  ]);

let failed = !asset;
if (!asset) console.log('FAIL  no /assets/index-*.js in the page');
for (const [path, ok, want, opts] of checks) {
  if (!path) continue;
  // HEAD keeps the 9 MB of model and WASM off the wire.
  const res = await fetch(SITE + path, { method: 'HEAD' });
  const cc = res.headers.get('cache-control') ?? '';
  if (res.status === 404 && opts?.skipIfMissing) {
    console.log(`SKIP  ${path}: 404, not deployed yet`);
    continue;
  }
  const pass = res.status === 200 && ok(cc);
  if (!pass) failed = true;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${path}: ${res.status} "${cc}" (want ${want})`);
}
console.log(failed ? 'FAIL  caching headers' : 'PASS  caching headers');
process.exit(failed ? 1 : 0);
