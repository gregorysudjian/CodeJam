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

export function classifyCameraError(err: unknown): CameraErrorInfo {
  const name =
    err instanceof Error || (typeof err === 'object' && err !== null && 'name' in err)
      ? String((err as { name: unknown }).name)
      : '';
  const kind = BY_NAME[name] ?? 'other';
  return { kind, ...COPY[kind] };
}
