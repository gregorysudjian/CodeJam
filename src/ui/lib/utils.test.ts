import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('keeps the colour next to text-outline (HUD MISS)', () => {
    expect(cn('text-danger', 'text-outline')).toBe('text-danger text-outline');
  });
  it('keeps a type-scale size next to a colour', () => {
    expect(cn('text-display-sm', 'text-lime')).toBe('text-display-sm text-lime');
  });
});
