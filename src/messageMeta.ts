/** Sender-label semantics ported from widget.js — pure functions so they
 * stay vitest-able (RN files can't be imported under vitest). */
import type { UiMessage } from './store.js';

/** Run-grouping key: consecutive messages from the same author share one
 * label. Different operators split runs by name (widget.js's 'h:'+name). */
export function authorKey(
  m: Pick<UiMessage, 'direction' | 'author'> | null | undefined,
): string {
  if (!m) return '';
  return m.direction === 'human' ? `h:${m.author?.name ?? ''}` : m.direction;
}

/** A label opens a run — the message whose chronologically-OLDER neighbour
 * was written by someone else (or doesn't exist). */
export function startsAuthorRun(
  m: Pick<UiMessage, 'direction' | 'author'>,
  prev: Pick<UiMessage, 'direction' | 'author'> | null | undefined,
): boolean {
  return authorKey(m) !== authorKey(prev);
}

/** Who to label the message with — operator name/avatar on human replies,
 * the channel's agent name + logo on AI replies, nothing on visitor rows. */
export function authorFor(
  m: Pick<UiMessage, 'direction' | 'author'>,
  agent: { name?: string | null; avatar?: string | null },
): { name: string; avatar?: string | null } | null {
  if (m.direction === 'human') {
    return m.author?.name ? { name: m.author.name, avatar: m.author.avatar } : null;
  }
  if (m.direction === 'out' && agent.name) {
    return { name: agent.name, avatar: agent.avatar };
  }
  return null;
}

/** widget.js fmtTime — "3:42 PM", '' on unparseable input. Manual format
 * (no Intl dependency — Hermes locale coverage varies). */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(+d)) return '';
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
