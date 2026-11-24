import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JanisApiError, JanisChat } from './client.js';

/** Node's FormData is winter-style like expo/fetch's — {uri} upload
 * files take the XHR→Blob path, so tests stub a one-shot XHR. */
class FakeXHR {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  responseType = '';
  response = new Blob(['img'], { type: 'image/png', lastModified: 0 });
  open() {}
  send() {
    this.onload?.();
  }
}
beforeEach(() => vi.stubGlobal('XMLHttpRequest', FakeXHR));
afterEach(() => vi.unstubAllGlobals());

type FakeReq = { method: string; url: string; body?: unknown; headers: Headers };

function fakeFetch(handler: (r: FakeReq) => { status?: number; json?: unknown; text?: string }) {
  const calls: FakeReq[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    let body: unknown;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    } else {
      body = init?.body;
    }
    const req: FakeReq = { method, url, body, headers: new Headers(init?.headers) };
    calls.push(req);
    const res = handler(req);
    if (res.text !== undefined) {
      return new Response(res.text, { status: res.status ?? 200 });
    }
    return new Response(JSON.stringify(res.json ?? {}), {
      status: res.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const TOKEN = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';
const chatOpts = {
  token: TOKEN,
  baseUrl: 'https://api.test',
  visitorId: 'v_test_visitor_123',
};

describe('JanisChat', () => {
  it('mints and persists a visitor id via storage', async () => {
    const store = new Map<string, string>();
    const { fetchImpl } = fakeFetch(() => ({ json: {} }));
    const chat = new JanisChat({
      token: TOKEN,
      baseUrl: 'https://api.test',
      fetch: fetchImpl,
      storage: {
        getItem: async (k) => store.get(k) ?? null,
        setItem: async (k, v) => void store.set(k, v),
      },
    });
    const id = await chat.getVisitorId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(store.get('janis.visitorId')).toBe(id);
  });

  it('reuses a stored visitor id', async () => {
    const { fetchImpl } = fakeFetch(() => ({ json: {} }));
    const chat = new JanisChat({
      token: TOKEN,
      fetch: fetchImpl,
      storage: { getItem: async () => 'stored_visitor_42', setItem: async () => {} },
    });
    expect(await chat.getVisitorId()).toBe('stored_visitor_42');
  });

  it('config() GETs /chat/:token', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ json: { name: 'Support', agent_name: 'A' } }));
    const chat = new JanisChat({ ...chatOpts, fetch: fetchImpl });
    const cfg = await chat.config();
    expect(cfg.agent_name).toBe('A');
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe(`https://api.test/chat/${TOKEN}`);
  });

  it('send() posts visitor, client_id, claim and tap fields', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ json: { ok: true } }));
    const chat = new JanisChat({
      ...chatOpts,
      fetch: fetchImpl,
      user: { id: 'u1', name: 'Jane', email: 'j@x.com', sig: 'abc' },
    });
    await chat.send('hello', {
      clientId: 'c1',
      tap: { of: 'Pick one', kind: 'options', collect: 'form1', item: { label: 'A' } },
    });
    const req = calls[0];
    expect(req.method).toBe('POST');
    expect(req.url).toBe(`https://api.test/chat/${TOKEN}/messages`);
    expect(req.body).toMatchObject({
      visitor_id: 'v_test_visitor_123',
      text: 'hello',
      client_id: 'c1',
      tap: true,
      tap_of: 'Pick one',
      tap_kind: 'options',
      tap_collect: 'form1',
      tap_item: { label: 'A' },
      user: { id: 'u1', name: 'Jane', email: 'j@x.com', sig: 'abc' },
    });
  });

  it('messages() passes identity claim as u_* query params and normalizes attachment urls', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({
      json: {
        messages: [
          {
            id: 'm1',
            direction: 'out',
            text: 'hi',
            created_at: '2026-01-01T00:00:00Z',
            attachments: [{ name: 'a.png', url: '/uploads/a.png', type: 'image/png', size: 10 }],
          },
        ],
        state: 'active',
        operator_typing: false,
        agent_typing: true,
        has_more: false,
      },
    }));
    const chat = new JanisChat({
      ...chatOpts,
      fetch: fetchImpl,
      user: { id: 'u1', name: 'Jane', email: 'j@x.com', sig: 'sig1' },
    });
    const res = await chat.messages({ after: '2025-12-31T00:00:00Z' });
    const url = new URL(calls[0].url);
    expect(url.searchParams.get('visitor_id')).toBe('v_test_visitor_123');
    expect(url.searchParams.get('after')).toBe('2025-12-31T00:00:00Z');
    expect(url.searchParams.get('u_id')).toBe('u1');
    expect(url.searchParams.get('u_sig')).toBe('sig1');
    expect(res.messages[0].attachments![0].url).toBe('https://api.test/uploads/a.png');
    expect(res.agent_typing).toBe(true);
  });

  it('identify() posts the claim and swaps poll identity', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ json: { ok: true, messages: [], state: 'new' } }));
    const chat = new JanisChat({ ...chatOpts, fetch: fetchImpl });
    await chat.identify({ id: 'u9', email: 'n@x.com', sig: 's9' });
    expect(calls[0].url).toBe(`https://api.test/chat/${TOKEN}/identify`);
    expect(calls[0].body).toMatchObject({ visitor_id: 'v_test_visitor_123' });
    await chat.messages();
    const url = new URL(calls[1].url);
    expect(url.searchParams.get('u_id')).toBe('u9');
  });

  it('throws JanisApiError with status and retryAfter on failure', async () => {
    const fetchImpl = (async () =>
      new Response('slow down', { status: 429, headers: { 'retry-after': '30' } })) as typeof fetch;
    const chat = new JanisChat({ ...chatOpts, fetch: fetchImpl });
    await expect(chat.send('x')).rejects.toMatchObject({
      name: 'JanisApiError',
      status: 429,
      retryAfter: 30,
    });
  });

  it('typing() throttles to one post per window', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ json: { ok: true } }));
    const chat = new JanisChat({ ...chatOpts, fetch: fetchImpl });
    await chat.typing();
    await chat.typing();
    await chat.typing();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://api.test/chat/${TOKEN}/typing`);
  });

  it('upload() posts multipart and absolutizes the ref url', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({
      status: 201,
      json: { name: 'pic.png', url: '/uploads/pic.png', type: 'image/png', size: 3 },
    }));
    const chat = new JanisChat({ ...chatOpts, fetch: fetchImpl });
    const ref = await chat.upload({ uri: 'file:///tmp/pic.png', name: 'pic.png', type: 'image/png' });
    // The ref stays relative — POST /messages' attachment schema
    // requires a /^\/uploads\// path; display code absolutizes.
    expect(ref.url).toBe('/uploads/pic.png');
    expect(calls[0].method).toBe('POST');
    const fd = calls[0].body as unknown as { get(k: string): unknown };
    expect(fd.get('visitor_id')).toBe('v_test_visitor_123');
    const part = fd.get('file') as { name?: string };
    expect(part?.name).toBe('pic.png');
  });

  it('upload() blobs a {uri} file when the runtime FormData is winter-style', async () => {
    // expo/fetch's FormData (entries()) rejects {uri} parts — the SDK
    // reads the file via XHR into a Blob instead.
    const { fetchImpl, calls } = fakeFetch(() => ({
      status: 201,
      json: { name: 'pic.png', url: '/uploads/pic.png', type: 'image/png', size: 3 },
    }));
    const chat = new JanisChat({ ...chatOpts, fetch: fetchImpl });
    await chat.upload({ uri: 'file:///tmp/pic.png', name: 'pic.png', type: 'image/png' });
    const fd = calls[0].body as unknown as { get(k: string): unknown };
    const part = fd.get('file') as Blob & { name?: string };
    expect(part).toBeInstanceOf(Blob);
    expect(part.type).toBe('image/png');
    expect(part.name).toBe('pic.png');
  });

  it('eventsUrl() carries visitor + identity params', async () => {
    const chat = new JanisChat({
      ...chatOpts,
      user: { id: 'u1', sig: 's' },
    });
    await chat.ready;
    const url = new URL(chat.eventsUrl());
    expect(url.pathname).toBe(`/chat/${TOKEN}/events`);
    expect(url.searchParams.get('visitor_id')).toBe('v_test_visitor_123');
    expect(url.searchParams.get('u_id')).toBe('u1');
  });
});
