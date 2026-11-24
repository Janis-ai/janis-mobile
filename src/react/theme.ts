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

export function defaultTheme(accent?: string | null, overrides?: Partial<ChatTheme>): ChatTheme {
  const base: ChatTheme = {
    accent: accent || '#4f46e5',
    accentText: '#ffffff',
    background: '#ffffff',
    agentBubble: '#f1f1f4',
    agentText: '#17171c',
    userBubble: accent || '#4f46e5',
    userText: '#ffffff',
    border: '#e5e5ea',
    muted: '#8e8e96',
    composerBg: '#ffffff',
    inputBg: '#f4f4f6',
    danger: '#dc2626',
    radius: 18,
  };
  const merged = { ...base, ...(overrides ?? {}) };
  // An explicit userBubble wins; otherwise it tracks accent.
  if (!overrides?.userBubble) merged.userBubble = merged.accent;
  if (!overrides?.userText) merged.userText = merged.accentText;
  return merged;
}
