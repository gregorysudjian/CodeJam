import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createUsernameChecker,
  MAX_NAME_LENGTH,
  USERNAME_CHECK_DELAY_MS,
  usernameToCheck,
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
    expect(optionalNumbers({ age: '', weightKg: '', heightCm: '175.46' })).toEqual({
      heightCm: 175.5,
    });
  });
});

describe('username check', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const settle = async (ms = USERNAME_CHECK_DELAY_MS) => {
    await vi.advanceTimersByTimeAsync(ms);
  };

  it('asks about the name that would be saved, not an empty field or your own name', () => {
    expect(usernameToCheck('  Sam ')).toBe('Sam');
    expect(usernameToCheck('x'.repeat(30))).toHaveLength(MAX_NAME_LENGTH);
    expect(usernameToCheck('   ')).toBe('');
    expect(usernameToCheck('abdo', 'Abdo')).toBe('');
    expect(usernameToCheck('Abdo2', 'Abdo')).toBe('Abdo2');
  });

  it('waits for a pause in typing and asks once, about the last name', async () => {
    const check = vi.fn(async (_n: string) => true);
    const onAnswer = vi.fn();
    const c = createUsernameChecker(check, onAnswer);
    c.update('S');
    await settle(USERNAME_CHECK_DELAY_MS - 1);
    c.update('Sa');
    c.update('Sam');
    await settle(USERNAME_CHECK_DELAY_MS - 1);
    expect(check).not.toHaveBeenCalled();
    await settle(1);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith('Sam');
    expect(onAnswer).toHaveBeenCalledWith('Sam', true);
  });

  it('drops an answer that arrives after the name changed', async () => {
    let resolveFirst: (v: boolean) => void = () => {};
    const check = vi
      .fn<(n: string) => Promise<boolean | null>>()
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce(false);
    const onAnswer = vi.fn();
    const c = createUsernameChecker(check, onAnswer);
    c.update('Sam');
    await settle();
    c.update('Samuel');
    resolveFirst(true); // "Sam" is taken, but the player has moved on
    await settle();
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith('Samuel', false);
  });

  it('treats a failing check as unknown and never throws', async () => {
    const onAnswer = vi.fn();
    createUsernameChecker(() => Promise.reject(new Error('offline')), onAnswer).update('Sam');
    await settle();
    createUsernameChecker(() => {
      throw new Error('boom');
    }, onAnswer).update('Kim');
    await settle();
    expect(onAnswer.mock.calls).toEqual([
      ['Sam', null],
      ['Kim', null],
    ]);
  });

  it('asks nothing for an empty name, and nothing after dispose', async () => {
    const check = vi.fn(async () => true);
    const onAnswer = vi.fn();
    const c = createUsernameChecker(check, onAnswer);
    c.update('');
    c.update('Sam');
    c.dispose();
    await settle();
    expect(check).not.toHaveBeenCalled();
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
