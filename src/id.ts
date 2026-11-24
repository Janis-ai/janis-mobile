/** URL-safe random ids that satisfy the server's VISITOR_RE
 * (/^[A-Za-z0-9_-]{8,64}$/). crypto.randomUUID isn't guaranteed on older
 * Hermes — build from whatever RNG exists. */
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export function randId(length = 24): string {
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
  if (g.crypto?.getRandomValues) {
    const bytes = g.crypto.getRandomValues(new Uint8Array(length));
    let out = '';
    for (let i = 0; i < length; i++) out += ALPHA[bytes[i] % 64];
    return out;
  }
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHA[Math.floor(Math.random() * 64)];
  return out;
}
