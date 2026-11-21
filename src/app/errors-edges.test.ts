// Edge cases for classifyCameraError beyond errors.test.ts (added by QA, docs/QA.md Q2).
import { describe, expect, it } from 'vitest';
import { classifyCameraError } from './errors';

describe('classifyCameraError: edge cases', () => {
  it('reads a real DOMException, as getUserMedia throws it', () => {
    expect(classifyCameraError(new DOMException('denied', 'NotAllowedError')).kind).toBe('denied');
    expect(classifyCameraError(new DOMException('none', 'NotFoundError')).kind).toBe('missing');
    expect(classifyCameraError(new DOMException('busy', 'NotReadableError')).kind).toBe('busy');
  });

  it('knows the older Chrome names and AbortError', () => {
    expect(classifyCameraError({ name: 'PermissionDeniedError' }).kind).toBe('denied');
    expect(classifyCameraError({ name: 'DevicesNotFoundError' }).kind).toBe('missing');
    expect(classifyCameraError({ name: 'TrackStartError' }).kind).toBe('busy');
    expect(classifyCameraError({ name: 'AbortError' }).kind).toBe('busy');
  });

  it('accepts a plain object with a name, and ignores names in other shapes', () => {
    expect(classifyCameraError({ name: 'NotAllowedError' }).kind).toBe('denied');
    expect(classifyCameraError('NotAllowedError').kind).toBe('other');
    expect(classifyCameraError(null).kind).toBe('other');
    expect(classifyCameraError(42).kind).toBe('other');
    expect(classifyCameraError({}).kind).toBe('other');
  });

  it('is case-sensitive, like DOMException names', () => {
    expect(classifyCameraError({ name: 'notallowederror' }).kind).toBe('other');
  });

  it('gives every kind a title and a body', () => {
    for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'X']) {
      const info = classifyCameraError({ name });
      expect(info.title.length).toBeGreaterThan(0);
      expect(info.body.length).toBeGreaterThan(0);
    }
  });

  // BUG (docs/QA.md Q2): src/pose/engine.ts rethrows the camera error as
  // `new Error(readableMessage, { cause: domException })`, so the app only ever sees name 'Error'
  // and every camera failure shows the generic "Camera did not start". Seen in Chrome with no
  // camera (NotFoundError). Fix in src/app/errors.ts: also read `err.cause`'s name. Unskip then.
  it.skip('looks through a wrapped error to its cause (as the pose module throws it)', () => {
    const wrap = (name: string) =>
      new Error('readable message', { cause: new DOMException('raw', name) });
    expect(classifyCameraError(wrap('NotAllowedError')).kind).toBe('denied');
    expect(classifyCameraError(wrap('NotFoundError')).kind).toBe('missing');
    expect(classifyCameraError(wrap('NotReadableError')).kind).toBe('busy');
  });
});
