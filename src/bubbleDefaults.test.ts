import { describe, expect, it } from 'vitest';
import { isTabletDevice, resolveDefaultOpen, resolvePresentation } from './bubbleDefaults.js';

describe('isTabletDevice', () => {
  it('honors Platform.isPad and the 600pt shortest-side rule', () => {
    expect(isTabletDevice(true, 390)).toBe(true);
    expect(isTabletDevice(false, 390)).toBe(false);
    expect(isTabletDevice(false, 600)).toBe(true);
    expect(isTabletDevice(false, 834)).toBe(true);
  });
});

describe('resolvePresentation', () => {
  it('defaults phones to a maximized sheet regardless of channel config', () => {
    expect(resolvePresentation(undefined, false, 'bubble')).toBe('modal');
    expect(resolvePresentation('auto', false, 'bubble')).toBe('modal');
    expect(resolvePresentation(undefined, false, 'modal')).toBe('modal');
  });
  it('lets tablets follow the channel display config', () => {
    expect(resolvePresentation(undefined, true, 'bubble')).toBe('bubble');
    expect(resolvePresentation(undefined, true, 'modal')).toBe('modal');
    expect(resolvePresentation(undefined, true, undefined)).toBe('bubble');
  });
  it('explicit values pin it on every device', () => {
    expect(resolvePresentation('bubble', false, 'modal')).toBe('bubble');
    expect(resolvePresentation('modal', true, 'bubble')).toBe('modal');
  });
});

describe('resolveDefaultOpen', () => {
  it('opens on phones, stays collapsed on tablets', () => {
    expect(resolveDefaultOpen(undefined, true, false)).toBe(true);
    expect(resolveDefaultOpen('auto', true, false)).toBe(true);
    expect(resolveDefaultOpen(undefined, true, true)).toBe(false);
  });
  it('always opens when the launcher is hidden', () => {
    expect(resolveDefaultOpen(undefined, false, true)).toBe(true);
    expect(resolveDefaultOpen('auto', false, false)).toBe(true);
  });
  it('explicit booleans pin it', () => {
    expect(resolveDefaultOpen(false, true, false)).toBe(false);
    expect(resolveDefaultOpen(true, true, true)).toBe(true);
  });
});
