// Turns a failed camera start into something a player can act on. Pure; tested in errors.test.ts.

export type CameraProblem = 'denied' | 'missing' | 'busy' | 'other';

export interface CameraErrorInfo {
  kind: CameraProblem;
  title: string;
  body: string;
}

/** DOMException names from getUserMedia (and their older Chrome aliases). */
const BY_NAME: Record<string, CameraProblem> = {
  NotAllowedError: 'denied',
  PermissionDeniedError: 'denied',
  SecurityError: 'denied',
  NotFoundError: 'missing',
  DevicesNotFoundError: 'missing',
  OverconstrainedError: 'missing',
  NotReadableError: 'busy',
  TrackStartError: 'busy',
  AbortError: 'busy',
};

const COPY: Record<CameraProblem, Omit<CameraErrorInfo, 'kind'>> = {
  denied: {
    title: 'Camera blocked',
    body: 'Chrome is not allowing the camera. Click the camera icon in the address bar, choose Allow, then try again. Or play with the keyboard.',
  },
  missing: {
    title: 'No camera found',
    body: 'This computer has no camera we can use. Plug one in and try again, or play with the keyboard.',
  },
  busy: {
    title: 'Camera in use',
    body: 'Another app or tab is using the camera. Close it (Zoom, Teams, another tab) and try again, or play with the keyboard.',
  },
  other: {
    title: 'Camera did not start',
    body: 'Something stopped the camera from starting. Try again, or play with the keyboard.',
  },
};

const nameOf = (err: unknown): string =>
  typeof err === 'object' && err !== null && 'name' in err
    ? String((err as { name: unknown }).name)
    : '';

export function classifyCameraError(err: unknown): CameraErrorInfo {
  // The pose module rethrows the getUserMedia error with a readable message and the original as
  // `cause` (docs/QA.md Q2), so look through one level of wrapping.
  const cause =
    typeof err === 'object' && err !== null ? (err as { cause?: unknown }).cause : undefined;
  const kind = BY_NAME[nameOf(err)] ?? BY_NAME[nameOf(cause)] ?? 'other';
  return { kind, ...COPY[kind] };
}
