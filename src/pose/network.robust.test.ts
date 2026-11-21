/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// Optional judge-Q&A check against a local Chrome Network HAR. Only request method and URL
// are read. Never commit the trace: HARs can contain headers, request bodies and responses.
const trace = join(tmpdir(), 'codejam-pose-round.har');
interface Request {
  method: string;
  url: string;
}
interface Entry {
  request: Request;
}
describe.skipIf(!existsSync(trace))('production pose network trace', () => {
  function requests() {
    const { log } = JSON.parse(readFileSync(trace, 'utf8')) as { log: { entries: Entry[] } };
    return log.entries.map(({ request }) => ({
      method: request.method,
      url: new URL(request.url),
    }));
  }
  function inspect() {
    const all = requests();
    const origin = all[0]?.url.origin;
    if (!origin) throw Error('Capture the production page navigation in an empty Network panel.');
    const local = all.filter((r) => r.url.origin === origin);
    const external = all.filter((r) => r.url.protocol !== 'data:' && r.url.origin !== origin);
    return { local, external };
  }
  test('trace includes the local model and WASM; all local traffic uses GET', () => {
    const { local } = inspect();
    expect(local[0]?.url.pathname).toBe('/');
    expect(local.some((r) => r.url.pathname === '/models/pose_landmarker_lite.task')).toBe(true);
    expect(
      local.some(
        (r) => r.url.pathname.startsWith('/mediapipe/wasm/') && r.url.pathname.endsWith('.wasm'),
      ),
    ).toBe(true);
    expect(local.filter((r) => r.method !== 'GET')).toEqual([]);
  });
  test('no additional cross-origin destinations', () => {
    const { external } = inspect();
    expect(
      external.filter(
        (r) =>
          r.url.href !== 'https://odml.pa.googleapis.com/v1/log' ||
          !['OPTIONS', 'POST'].includes(r.method),
      ),
    ).toEqual([]);
  });
  test.fails('Greg: pose round makes only same-origin requests', () => {
    expect(inspect().external.map((r) => r.method + ' ' + r.url.origin + r.url.pathname)).toEqual(
      [],
    );
  });
});
