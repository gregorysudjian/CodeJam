import { describe, expect, it } from 'vitest';
import {
  MAX_NAME_LENGTH,
  optionalNumbers,
  profileName,
  randomGuestName,
  validateName,
  validateRange,
} from '@/ui/screens/profileRules';

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

describe('sign-up fields', () => {
  it('requires a username (spaces alone are not one)', () => {
    expect(validateName('')).not.toBeNull();
    expect(validateName('   ')).not.toBeNull();
    expect(validateName('Sam')).toBeNull();
  });
  it('accepts an empty optional number and each range edge', () => {
    expect(validateRange('age', '')).toBeNull();
    expect(validateRange('age', '10')).toBeNull();
    expect(validateRange('age', '100')).toBeNull();
    expect(validateRange('weightKg', '30')).toBeNull();
    expect(validateRange('weightKg', '250')).toBeNull();
    expect(validateRange('heightCm', '100')).toBeNull();
    expect(validateRange('heightCm', '250')).toBeNull();
  });
  it('rejects values outside the ranges and non-numbers', () => {
    expect(validateRange('age', '9')).toMatch(/between 10 and 100 years/);
    expect(validateRange('age', '101')).not.toBeNull();
    expect(validateRange('weightKg', '29.9')).toMatch(/between 30 and 250 kg/);
    expect(validateRange('heightCm', '251')).toMatch(/between 100 and 250 cm/);
    expect(validateRange('heightCm', 'abc')).not.toBeNull();
  });
  it('saves only the filled, valid numbers, with a whole-number age', () => {
    expect(optionalNumbers({ age: '', weightKg: '', heightCm: '' })).toEqual({});
    expect(optionalNumbers({ age: '25.4', weightKg: '70.5', heightCm: '300' })).toEqual({
      age: 25,
      weightKg: 70.5,
    });
  });
});
