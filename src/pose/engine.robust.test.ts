import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createPoseEngine } from './engine';
import { getLandmarker } from './landmarker';

vi.mock('./overlay', () => ({ createOverlay: () => ({ update: vi.fn(), hide: vi.fn() }) }));
vi.mock('./landmarker', () => ({ getLandmarker: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function camera() {
  const track = Object.assign(new EventTarget(), {
    readyState: 'live',
    stop: vi.fn(() => {
      track.readyState = 'ended';
    }),
    getSettings: () => ({}),
  });
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track };
}
const getUserMedia = vi.fn<() => Promise<MediaStream>>();
const video = Object.assign(new EventTarget(), {
  style: {},
  srcObject: null,
  play: vi.fn(async () => {}),
  requestVideoFrameCallback: vi.fn(() => 1),
  cancelVideoFrameCallback: vi.fn(),
});
const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  getUserMedia.mockReset();
  video.play.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), { isSecureContext: true, setInterval, clearInterval }),
  );
  vi.stubGlobal('document', { createElement: () => video });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.mocked(getLandmarker)
    .mockReset()
    .mockResolvedValue({ delegate: 'GPU', detect: () => [] });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test('stopping calibration while camera permission is pending settles the caller immediately', async () => {
  const { source } = createPoseEngine();
  const request = deferred<MediaStream>();
  const { track, stream } = camera();
  getUserMedia.mockReturnValue(request.promise);
  const result = source
    .calibrate('floor', () => {})
    .then(
      () => 'done',
      (err: Error) => err.message,
    );
  source.stop();
  try {
    expect(await Promise.race([result, nextTurn().then(() => 'still waiting')])).toBe(
      'The camera was stopped.',
    );
  } finally {
    request.resolve(stream);
    await result;
    expect(track.stop).toHaveBeenCalledOnce();
  }
});

test.each(['NotAllowedError', 'NotReadableError', 'NotFoundError'])(
  'startup %s reaches the caller with its camera cause',
  async (name) => {
    const { source } = createPoseEngine();
    const cause = new DOMException('unavailable', name);
    getUserMedia.mockRejectedValue(cause);
    await expect(source.calibrate('floor', () => {})).rejects.toMatchObject({ cause });
    expect(source.getState().tracking).toBe(false);
    source.stop();
  },
);

test('a model 404 releases the stream and a new start retries successfully', async () => {
  const { source } = createPoseEngine();
  const first = camera();
  const second = camera();
  getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
  const error = new Error('model fetch failed: 404');
  vi.mocked(getLandmarker).mockRejectedValueOnce(error);
  await expect(source.calibrate('floor', () => {})).rejects.toBe(error);
  expect(first.track.stop).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
  await source.start();
  expect(video.srcObject).toBe(second.stream);
  source.stop();
  expect(second.track.stop).toHaveBeenCalledOnce();
});

test.each(['already ended', 'while attaching video', 'while loading model'])(
  'an ended camera rejects startup before calibration waits for frames: %s',
  async (phase) => {
    const { source } = createPoseEngine();
    const first = camera();
    const retry = camera();
    const playing = deferred<void>();
    const loading = deferred<Awaited<ReturnType<typeof getLandmarker>>>();
    getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(retry.stream);
    if (phase === 'already ended') first.track.readyState = 'ended';
    if (phase === 'while attaching video') video.play.mockReturnValueOnce(playing.promise);
    if (phase === 'while loading model')
      vi.mocked(getLandmarker).mockReturnValueOnce(loading.promise);
    const result = source.start().then(
      () => 'started',
      (error: Error) => error.message,
    );
    try {
      await nextTurn();
      if (phase !== 'already ended') {
        first.track.readyState = 'ended';
        first.track.dispatchEvent(new Event('ended'));
      }
      expect(await Promise.race([result, nextTurn().then(() => 'still waiting')])).toMatch(
        /camera stopped/i,
      );
      expect(video.srcObject).toBeNull();
      expect(video.requestVideoFrameCallback).not.toHaveBeenCalled();
      await source.start();
      expect(video.srcObject).toBe(retry.stream);
    } finally {
      playing.resolve();
      loading.resolve({ delegate: 'CPU', detect: () => [] });
      await result;
      source.stop();
    }
  },
);
test('StrictMode stop/start during a pending model load keeps only the current stream and loop', async () => {
  const { source } = createPoseEngine();
  const first = camera();
  const second = camera();
  const loading = deferred<Awaited<ReturnType<typeof getLandmarker>>>();
  vi.mocked(getLandmarker).mockReturnValue(loading.promise);
  getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
  const opening = source.start();
  await nextTurn();
  expect(getLandmarker).toHaveBeenCalledOnce();
  source.stop();
  const reopening = source.start();
  await nextTurn();
  expect(first.track.stop).toHaveBeenCalledOnce();
  expect(second.track.stop).not.toHaveBeenCalled();
  loading.resolve({ delegate: 'CPU', detect: () => [] });
  await Promise.all([opening, reopening]);
  try {
    expect(video.srcObject).toBe(second.stream);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledOnce();
  } finally {
    source.stop();
  }
  expect(video.cancelVideoFrameCallback).toHaveBeenCalledOnce();
  expect(second.track.stop).toHaveBeenCalledOnce();
});

test('a five-second model load starts one frame loop and permits a clean stop', async () => {
  vi.useFakeTimers();
  const { source } = createPoseEngine();
  const { stream, track } = camera();
  getUserMedia.mockResolvedValue(stream);
  vi.mocked(getLandmarker).mockImplementation(
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ delegate: 'CPU', detect: () => [] }), 5000);
      }),
  );
  try {
    const starting = source.start();
    expect(source.start()).toBe(starting);
    await vi.advanceTimersByTimeAsync(4999);
    expect(video.requestVideoFrameCallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await starting;
    expect(video.requestVideoFrameCallback).toHaveBeenCalledOnce();
  } finally {
    source.stop();
    vi.useRealTimers();
  }
  expect(track.stop).toHaveBeenCalledOnce();
});

test('stop releases a pending startup and its track listener while the shared model is still loading', async () => {
  const { source } = createPoseEngine();
  const { stream, track } = camera();
  const add = vi.spyOn(track, 'addEventListener');
  const remove = vi.spyOn(track, 'removeEventListener');
  getUserMedia.mockResolvedValue(stream);
  const loading = deferred<Awaited<ReturnType<typeof getLandmarker>>>();
  vi.mocked(getLandmarker).mockReturnValue(loading.promise);
  const opening = source.start();
  await nextTurn();
  expect(getLandmarker).toHaveBeenCalledOnce();
  source.stop();
  try {
    expect(
      await Promise.race([opening.then(() => 'stopped'), nextTurn().then(() => 'waiting')]),
    ).toBe('stopped');
    expect(remove).toHaveBeenCalledWith('ended', add.mock.calls[0][1]);
    expect(track.readyState).toBe('ended');
    expect(video.srcObject).toBeNull();
  } finally {
    loading.resolve({ delegate: 'CPU', detect: () => [] });
    await opening;
  }
  expect(video.requestVideoFrameCallback).not.toHaveBeenCalled();
});
