/** Device-adaptive ChatBubble defaults — pure so they're unit-testable
 * without a react-native runtime. */

/** Tablet heuristic: iPads report Platform.isPad; for Android and
 * resized windows the 600pt shortest-side rule is the standard break. */
export function isTabletDevice(isPad: boolean, shortestSide: number): boolean {
  return isPad || shortestSide >= 600;
}

export type BubblePresentation = 'auto' | 'bubble' | 'modal';

/** 'auto' (the default): phones get a maximized sheet — a floating card
 * looks lost on a small screen — while tablets follow the channel's
 * configured display ('bubble' card or 'modal' sheet). Explicit values
 * pin the presentation on every device. */
export function resolvePresentation(
  prop: BubblePresentation | undefined,
  isTablet: boolean,
  channelDisplay: 'bubble' | 'modal' | undefined,
): 'bubble' | 'modal' {
  if (prop && prop !== 'auto') return prop;
  if (!isTablet) return 'modal';
  return channelDisplay === 'modal' ? 'modal' : 'bubble';
}

/** 'auto' (the default): phones start maximized; tablets stay collapsed
 * to the launcher so the channel's open_default can apply. With no
 * launcher at all there's no other way in, so it always starts open —
 * the host drives visibility via the ref/`open` prop. */
export function resolveDefaultOpen(
  prop: boolean | 'auto' | undefined,
  showLauncher: boolean,
  isTablet: boolean,
): boolean {
  if (prop !== undefined && prop !== 'auto') return prop;
  if (!showLauncher) return true;
  return !isTablet;
}
