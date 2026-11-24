import { describe, expect, it } from 'vitest';
import { countUnread } from './store.js';
import type { UiMessage } from './store.js';

const m = (id: string, over: Partial<UiMessage> = {}): UiMessage => ({
  id,
  direction: 'out',
  text: 't',
  created_at: `2026-01-01T00:00:${id.padStart(2, '0')}Z`,
  ...over,
});

describe('countUnread', () => {
  it('counts agent-side messages after seenAt', () => {
    const msgs = [m('01'), m('05'), m('09')];
    expect(countUnread(msgs, '2026-01-01T00:00:05Z')).toBe(1);
    expect(countUnread(msgs, null)).toBe(3);
    expect(countUnread(msgs, '2026-01-01T00:00:09Z')).toBe(0);
  });

  it('ignores inbound, pending, failed, and greeting rows', () => {
    const msgs = [
      m('01'),
      m('02', { direction: 'in' }),
      m('03', { pending: true }),
      m('04', { failed: true }),
      m('05', { greeting: true }),
      m('06', { direction: 'human' }),
    ];
    expect(countUnread(msgs, null)).toBe(2); // '01' and the human '06'
  });
});
