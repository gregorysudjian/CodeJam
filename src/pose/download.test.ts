import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MODEL_PATH, WASM_PATH } from './tuning';

const LOADER = `${WASM_PATH}/vision_wasm_internal.js`;
const BINARY = `${WASM_PATH}/vision_wasm_internal.wasm`;

const { files } = vi.hoisted(() => ({ files: vi.fn() }));
vi.mock('@mediapipe/tasks-vision', () => ({ FilesetResolver: { forVisionTasks: files } }));

/** A response streamed in two chunks, compressed (no usable length) like the live site's. */
const response = (bytes: number) =>
  new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(bytes / 2).fill(7));
        c.enqueue(new Uint8Array(bytes / 2).fill(7));
        c.close();
      },
    }),
    { headers: { 'content-encoding': 'br' } },
  );

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  files.mockResolvedValue({ wasmLoaderPath: LOADER, wasmBinaryPath: BINARY });
});
afterEach(() => vi.unstubAllGlobals());

test('fetches the model and the WASM together, counts progress and keeps only the model bytes', async () => {
  const fetch = vi.fn((url: string) => Promise.resolve(response(url === MODEL_PATH ? 4e6 : 2e6)));
  vi.stubGlobal('fetch', fetch);
  const { loadPoseFiles, onPoseDownload, downloadMessage } = await import('./download');
  const seen: string[] = [];
  let last = { loaded: 0, total: 0, done: false };
  const stop = onPoseDownload((p) => {
    last = p;
    seen.push(p.done ? 'done' : downloadMessage(p));
  });
  const pending = loadPoseFiles();
  expect(loadPoseFiles()).toBe(pending);
  const { model } = await pending;
  stop();
  expect(fetch.mock.calls.map(([url]) => url).sort()).toEqual([BINARY, LOADER, MODEL_PATH].sort());
  expect(model?.length).toBe(4e6);
  expect(seen.at(-1)).toBe('done');
  // Before the end the total is the known size; after it, the real one (6 MB here).
  expect(seen[0]).toMatch(/^Downloading the body tracker: 0 of 20 MB\. Or press K/);
  expect(last).toEqual({ loaded: 6e6, total: 6e6, done: true });
});

test('a failed download still resolves, and MediaPipe then fetches the model itself', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('nope', { status: 404 }))),
  );
  const { loadPoseFiles } = await import('./download');
  const got = await loadPoseFiles();
  expect(got.model).toBeUndefined();
  expect(got.fileset.wasmBinaryPath).toBe(BINARY);
});
