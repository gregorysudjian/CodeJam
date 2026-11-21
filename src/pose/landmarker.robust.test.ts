import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MODEL_PATH, WASM_PATH } from './tuning';

const { files, make } = vi.hoisted(() => ({ files: vi.fn(), make: vi.fn() }));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: files },
  PoseLandmarker: { createFromOptions: make },
}));
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubGlobal('document', { createElement: () => new EventTarget() });
});
afterEach(() => vi.unstubAllGlobals());

test('a rejected GPU delegate falls back to CPU and shares that model across inputs', async () => {
  const { getLandmarker } = await import('./landmarker');
  files.mockResolvedValue({});
  make
    .mockRejectedValueOnce(new Error('GPU unavailable'))
    .mockResolvedValueOnce({ detectForVideo: () => ({ landmarks: [] }) });
  const [first, second] = await Promise.all([getLandmarker(), getLandmarker()]);
  expect(files).toHaveBeenCalledExactlyOnceWith(WASM_PATH);
  expect(make.mock.calls.map(([, opts]) => opts.baseOptions)).toEqual([
    { delegate: 'GPU', modelAssetPath: MODEL_PATH },
    { delegate: 'CPU', modelAssetPath: MODEL_PATH },
  ]);
  expect(first.delegate).toBe('CPU');
  expect(second).toBe(first);
  expect(first.detect({} as HTMLVideoElement)).toEqual([]);
});

test.each(['WASM', 'model'])(
  '%s 404 rejects shared callers and a later attempt reloads',
  async (asset) => {
    const { getLandmarker } = await import('./landmarker');
    const failure = new Error(asset + ' 404');
    files.mockResolvedValue({});
    make.mockResolvedValue({});
    if (asset === 'WASM') files.mockRejectedValueOnce(failure);
    else make.mockRejectedValueOnce(failure).mockRejectedValueOnce(failure);
    const pending = getLandmarker();
    expect(getLandmarker()).toBe(pending);
    await expect(pending).rejects.toBe(failure);
    expect((await getLandmarker()).delegate).toBe('GPU');
    expect(files).toHaveBeenCalledTimes(2);
  },
);

test('a camera retry after WebGL context loss shares one fresh model', async () => {
  const { getLandmarker } = await import('./landmarker');
  const canvas = new EventTarget();
  // The first camera loses its GL context. A second camera receives a fresh canvas.
  const createElement = vi.fn().mockReturnValueOnce(canvas).mockReturnValue(new EventTarget());
  vi.stubGlobal('document', { createElement });
  const lost = { close: vi.fn(), detectForVideo: vi.fn(() => ({ landmarks: [[]] })) };
  const fresh = { close: vi.fn(), detectForVideo: vi.fn(() => ({ landmarks: [[]] })) };
  files.mockResolvedValue({});
  make.mockResolvedValueOnce(lost).mockResolvedValueOnce(fresh);
  const first = await getLandmarker();
  const video = {} as HTMLVideoElement;
  expect(first.detect(video)).toEqual([[]]);
  canvas.dispatchEvent(new Event('webglcontextlost'));
  const [retry, concurrent] = await Promise.all([getLandmarker(), getLandmarker()]);
  expect(retry).not.toBe(first);
  expect(concurrent).toBe(retry);
  expect(retry.detect(video)).toEqual([[]]);
  expect(first.detect(video)).toEqual([]);
  expect(lost.close).toHaveBeenCalledOnce();
  expect(lost.detectForVideo).toHaveBeenCalledOnce();
  expect(make).toHaveBeenCalledTimes(2);
});
