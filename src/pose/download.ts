// Owner: A. Fetches the pose files (the MediaPipe WASM and the model) before the camera starts,
// counting bytes. On a slow link a first-time camera player otherwise waits up to a minute on
// "Starting the camera…" with no sign of progress (docs/LIVE.md "Camera path"). The app starts
// this on the profile and select screens; landmarker.ts waits for it, so nothing is fetched twice:
// the model bytes go straight to MediaPipe, and the WASM comes back from the HTTP cache.
import type { FilesetResolver } from '@mediapipe/tasks-vision';
import { MODEL_BYTES, MODEL_PATH, WASM_BYTES, WASM_PATH } from './tuning';

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
export interface PoseFiles {
  fileset: Fileset;
  /** Absent if the download failed: MediaPipe then fetches the model from MODEL_PATH itself. */
  model?: Uint8Array;
}
export interface PoseDownload {
  loaded: number;
  total: number;
  done: boolean;
}

const state: PoseDownload = { loaded: 0, total: WASM_BYTES + MODEL_BYTES, done: false };
const listeners = new Set<(p: PoseDownload) => void>();
const report = () => {
  for (const cb of listeners) cb({ ...state });
};

/** Reads one file, adding its bytes to the progress. Returns the bytes when `keep` is set. */
async function read(url: string, expected: number, keep: boolean): Promise<Uint8Array | undefined> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  // The live site sends these compressed with no length; the dev server sends the real length.
  const length = res.headers.get('content-encoding')
    ? 0
    : Number(res.headers.get('content-length'));
  if (length > 0) {
    state.total += length - expected;
    expected = length;
  }
  const chunks: Uint8Array[] = [];
  let got = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (keep) chunks.push(value);
    got += value.length;
    state.loaded += value.length;
    report();
  }
  state.total += got - expected; // a file that changed size since tuning.ts was written
  if (!keep) return undefined;
  const bytes = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return bytes;
}

let files: Promise<PoseFiles> | null = null;

/** The files FilesetResolver picks on Chrome (WASM SIMD), the only ones in public/. */
const WASM_LOADER = `${WASM_PATH}/vision_wasm_internal.js`;
const WASM_BINARY = `${WASM_PATH}/vision_wasm_internal.wasm`;

/** Starts the download once per page (later calls share it) and resolves when it ends. */
export function loadPoseFiles(): Promise<PoseFiles> {
  if (!files) {
    Object.assign(state, { loaded: 0, total: WASM_BYTES + MODEL_BYTES, done: false });
    // All three at once, and before the MediaPipe JS arrives: on a slow link each chained request
    // costs seconds, and the model no longer waits for the WASM.
    const download = Promise.all([
      read(MODEL_PATH, MODEL_BYTES, true),
      read(WASM_BINARY, WASM_BYTES, false),
      fetch(WASM_LOADER).then((r) => r.blob()),
    ]);
    download.catch(() => {}); // reported below
    files = (async () => {
      try {
        const { FilesetResolver } = await import('@mediapipe/tasks-vision');
        const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
        try {
          const [model] = await download;
          return { fileset, model };
        } catch (err) {
          console.warn('[pose] Pose file download failed; MediaPipe will fetch them itself', err);
          return { fileset };
        }
      } finally {
        state.done = true;
        report();
      }
    })();
    files.catch(() => {
      files = null; // the MediaPipe JS failed to load: let the next call retry
    });
  }
  return files;
}

/**
 * For the profile and select screens: starts the download early if this device has a camera.
 * Listing devices needs no permission and shows no prompt.
 */
export function preloadPoseFiles(): void {
  if (files) return;
  navigator.mediaDevices
    ?.enumerateDevices?.()
    .then((devices) => {
      if (devices.some((d) => d.kind === 'videoinput')) void loadPoseFiles().catch(() => {});
    })
    .catch(() => {});
}

/** Calls `cb` now and on every change until the returned function is called. */
export function onPoseDownload(cb: (p: PoseDownload) => void): () => void {
  listeners.add(cb);
  cb({ ...state });
  return () => {
    listeners.delete(cb);
  };
}

/** Whole megabytes, so the calibration message changes about once a second on a slow link. */
export function downloadMessage(p: PoseDownload): string {
  const mb = (b: number) => Math.round(b / 1e6);
  return `Downloading the body tracker: ${mb(Math.min(p.loaded, p.total))} of ${mb(p.total)} MB. Or press K for the keyboard.`;
}
