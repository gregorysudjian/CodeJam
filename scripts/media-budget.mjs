// Asset budget for public/media/ (backdrops and obstacle images). Node built-ins only.
//   node scripts/media-budget.mjs [dir]        (default: public/media)
// Lists every file with its size, then PASS or FAIL: at most 2 MB per image, 8 MB per video and
// 45 MB in total. Exit code 1 on FAIL. Run it on every hx-media merge.
// Every visitor on the venue wifi downloads these, and on a 2 s-latency network each extra MB costs
// seconds, so the budget is on the files as served (Vercel compresses text, not images or video).
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const MB = 1024 * 1024;
// Videos raised from 3 MB / 15 MB total for the full-screen 720p level clips (Sun ~2 AM, Greg):
// only the current and next level's clip load at once, about 12 MB before level 2.
const BUDGET = { image: 2 * MB, video: 8 * MB, total: 45 * MB };
const KINDS = {
  image: ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg'],
  video: ['.mp4', '.webm', '.mov', '.m4v'],
};
/** Above this, a PNG or JPEG is worth re-encoding as WebP or AVIF (a hint, never a failure). */
const RECOMPRESS_HINT = 500 * 1024;

const dir = process.argv[2] ?? 'public/media';
if (!existsSync(dir)) {
  console.log(`PASS  ${dir} does not exist yet: nothing to check`);
  process.exit(0);
}

function walk(d) {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
  );
}
const kindOf = (f) =>
  Object.entries(KINDS).find(([, exts]) => exts.includes(extname(f).toLowerCase()))?.[0] ?? 'other';
const fmt = (b) => (b >= MB ? `${(b / MB).toFixed(2)} MB` : `${Math.round(b / 1024)} KB`);

const files = walk(dir)
  .map((f) => ({
    path: relative(dir, f).replace(/\\/g, '/'),
    size: statSync(f).size,
    kind: kindOf(f),
  }))
  .sort((a, b) => b.size - a.size);
const total = files.reduce((s, f) => s + f.size, 0);
const problems = [];
const hints = [];

for (const f of files) {
  const limit = BUDGET[f.kind];
  const over = limit !== undefined && f.size > limit;
  if (over) problems.push(`${f.path} is ${fmt(f.size)}, over the ${fmt(limit)} ${f.kind} budget`);
  if (!over && f.kind === 'image' && /\.(png|jpe?g)$/i.test(f.path) && f.size > RECOMPRESS_HINT)
    hints.push(`${f.path} (${fmt(f.size)}): WebP or AVIF would likely be several times smaller`);
  console.log(
    `${over ? 'FAIL' : '    '}  ${fmt(f.size).padStart(9)}  ${f.kind.padEnd(5)}  ${f.path}`,
  );
}
if (total > BUDGET.total)
  problems.push(`total ${fmt(total)} is over the ${fmt(BUDGET.total)} budget`);
const other = files.filter((f) => f.kind === 'other');
if (other.length)
  hints.push(`${other.length} file(s) are neither image nor video: counted in the total only`);

console.log(`\n${files.length} files, ${fmt(total)} in total (budget ${fmt(BUDGET.total)})`);
for (const h of hints) console.log(`hint  ${h}`);
for (const p of problems) console.log(`FAIL  ${p}`);
console.log(problems.length ? 'FAIL  media budget' : 'PASS  media budget');
process.exit(problems.length ? 1 : 0);
