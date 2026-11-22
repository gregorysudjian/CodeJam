import { expect, it } from 'vitest';
import { addFriendMessage, leaderboardFilter } from '@/ui/screens/leaderboardRules';
it('switches legs to full body before requesting a treadmill leaderboard', () => {
  expect(leaderboardFilter('legs', 'treadmill')).toEqual({
    workout: 'fullBody',
    mode: 'treadmill',
  });
});
it('preserves supported workout and mode pairs', () => {
  expect(leaderboardFilter('arms', 'treadmill')).toEqual({ workout: 'arms', mode: 'treadmill' });
  expect(leaderboardFilter('legs', 'floor')).toEqual({ workout: 'legs', mode: 'floor' });
});
it('names the friend as stored when one is added', () => {
  expect(addFriendMessage({ ok: true, displayName: 'MapleMax' }, ' maplemax ')).toEqual({
    text: 'Added MapleMax',
    ok: true,
  });
});
it('gives one message per refusal, with the typed name trimmed when nobody has it', () => {
  const msg = (reason: 'notFound' | 'self' | 'already' | 'limit' | 'offline') =>
    addFriendMessage({ ok: false, reason }, '  Ghost  ');
  expect(msg('notFound')).toEqual({ text: 'No player called Ghost', ok: false });
  expect(msg('self').text).toBe("That's you");
  expect(msg('already').text).toBe('Already your friend');
  expect(msg('limit').text).toBe('50 friends max');
  expect(msg('offline').text).toBe('Friends need the internet');
});
