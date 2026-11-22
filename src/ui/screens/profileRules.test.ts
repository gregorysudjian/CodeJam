import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH, profileName, randomGuestName } from '@/ui/screens/profileRules';

describe('profile name', () => {
  it('keeps what the player typed, trimmed and cut to the board length', () => {
    expect(profileName('  Sam ', 'Guest-4821')).toBe('Sam');
    expect(profileName('x'.repeat(30), 'Guest-4821')).toHaveLength(MAX_NAME_LENGTH);
  });
  it('uses the fallback when the field is cleared, never a fixed placeholder', () => {
    expect(profileName('', 'Guest-4821')).toBe('Guest-4821');
    expect(profileName('   ', 'Guest-4821')).toBe('Guest-4821');
  });
  it('draws a four-digit guest name', () => {
    expect(randomGuestName(() => 0)).toBe('Guest-1000');
    expect(randomGuestName(() => 0.9999)).toBe('Guest-9999');
    expect(randomGuestName()).toMatch(/^Guest-\d{4}$/);
  });
});
