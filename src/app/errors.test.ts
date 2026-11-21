import { describe, expect, it } from 'vitest';
import { classifyCameraError } from './errors';

const dom = (name: string) => Object.assign(new Error(name), { name });

describe('classifyCameraError', () => {
  it('recognises a blocked camera', () => {
    expect(classifyCameraError(dom('NotAllowedError')).kind).toBe('denied');
    expect(classifyCameraError(dom('SecurityError')).kind).toBe('denied');
  });

  it('recognises a missing camera', () => {
    expect(classifyCameraError(dom('NotFoundError')).kind).toBe('missing');
    expect(classifyCameraError(dom('OverconstrainedError')).kind).toBe('missing');
  });

  it('recognises a camera used by another app', () => {
    expect(classifyCameraError(dom('NotReadableError')).kind).toBe('busy');
  });

  it('falls back to a generic message for anything else, including non-errors', () => {
    expect(classifyCameraError(new Error('Pose tracking is not implemented yet')).kind).toBe(
      'other',
    );
    expect(classifyCameraError('boom').kind).toBe('other');
    expect(classifyCameraError(undefined).kind).toBe('other');
  });

  it('always tells the player about the keyboard', () => {
    for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'Whatever']) {
      expect(classifyCameraError(dom(name)).body).toMatch(/keyboard/);
    }
  });
});
