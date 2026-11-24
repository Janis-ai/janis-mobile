export interface ChatTheme {
  /** Brand accent — user bubbles, send button, option borders. The
   * channel's configured accent is the default. */
  accent: string;
  /** Text on accent-colored surfaces. */
  accentText: string;
  background: string;
  /** Agent/operator bubble (left). */
  agentBubble: string;
  agentText: string;
  /** Visitor bubble (right) — defaults to accent. */
  userBubble: string;
  userText: string;
  border: string;
  /** Timestamps, hints, operator names. */
  muted: string;
  composerBg: string;
  inputBg: string;
  danger: string;
  radius: number;
}

export type ChatScheme = 'light' | 'dark' | 'auto';

const DARK: Omit<ChatTheme, 'accent' | 'accentText' | 'userBubble' | 'userText' | 'radius'> = {
  background: '#17171c',
  agentBubble: '#2a2a32',
  agentText: '#f2f2f5',
  border: '#35353d',
  muted: '#9a9aa3',
  composerBg: '#1e1e24',
  inputBg: '#26262e',
  danger: '#f87171',
};

export function defaultTheme(
  accent?: string | null,
  overrides?: Partial<ChatTheme>,
  scheme: ChatScheme = 'light',
): ChatTheme {
  const darkBase = scheme === 'dark' ? DARK : null;
  const base: ChatTheme = {
    accent: accent || '#4f46e5',
    accentText: '#ffffff',
    background: darkBase?.background ?? '#ffffff',
    agentBubble: darkBase?.agentBubble ?? '#f1f1f4',
    agentText: darkBase?.agentText ?? '#17171c',
    userBubble: accent || '#4f46e5',
    userText: '#ffffff',
    border: darkBase?.border ?? '#e5e5ea',
    muted: darkBase?.muted ?? '#8e8e96',
    composerBg: darkBase?.composerBg ?? '#ffffff',
    inputBg: darkBase?.inputBg ?? '#f4f4f6',
    danger: darkBase?.danger ?? '#dc2626',
    radius: 18,
  };
  const merged = { ...base, ...(overrides ?? {}) };
  // An explicit userBubble wins; otherwise it tracks accent.
  if (!overrides?.userBubble) merged.userBubble = merged.accent;
  if (!overrides?.userText) merged.userText = merged.accentText;
  return merged;
}
