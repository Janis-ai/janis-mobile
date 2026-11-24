import { describe, expect, it } from 'vitest';
import { authorFor, authorKey, formatTime, startsAuthorRun } from './messageMeta.js';

const out = { direction: 'out' as const };
const human = (name: string, avatar: string | null = null) => ({
  direction: 'human' as const,
  author: { name, avatar },
});

describe('authorKey / startsAuthorRun', () => {
  it('groups consecutive same-author bubbles into one run', () => {
    const msgs = [human('Amy'), human('Amy'), out, human('Ben'), human('Ben')];
    const show = msgs.map((m, i) => startsAuthorRun(m, msgs[i - 1]));
    expect(show).toEqual([true, false, true, true, false]);
  });

  it('distinguishes operator runs by name — different operator, new label', () => {
    expect(startsAuthorRun(human('Ben'), human('Amy'))).toBe(true);
    expect(startsAuthorRun(human('Amy'), human('Amy'))).toBe(false);
  });

  it('treats AI and operator bubbles as different authors', () => {
    expect(authorKey(out)).not.toBe(authorKey(human('Amy')));
    expect(authorKey({ direction: 'in' })).toBe('in');
  });
});

describe('authorFor', () => {
  it('labels human replies with the operator', () => {
    expect(authorFor(human('Amy', '/uploads/a.png'), {})).toEqual({
      name: 'Amy',
      avatar: '/uploads/a.png',
    });
  });

  it('labels AI replies with the channel agent name + logo', () => {
    expect(authorFor(out, { name: 'Spock', avatar: '/uploads/logo.png' })).toEqual({
      name: 'Spock',
      avatar: '/uploads/logo.png',
    });
  });

  it('leaves visitor messages and unnamed senders unlabeled', () => {
    expect(authorFor({ direction: 'in' }, { name: 'Spock' })).toBeNull();
    expect(authorFor({ direction: 'human' }, { name: 'Spock' })).toBeNull();
    expect(authorFor(out, {})).toBeNull();
  });
});

describe('formatTime', () => {
  it('renders h:mm AM/PM', () => {
    expect(formatTime('2026-11-24T15:42:00')).toMatch(/^\d{1,2}:42 (AM|PM)$/);
    expect(formatTime('2026-11-24T00:05:00')).toMatch(/^12:05 AM$/);
    expect(formatTime('2026-11-24T12:30:00')).toMatch(/^12:30 PM$/);
  });

  it('returns empty for missing or junk input', () => {
    expect(formatTime(null)).toBe('');
    expect(formatTime('not-a-date')).toBe('');
  });
});
