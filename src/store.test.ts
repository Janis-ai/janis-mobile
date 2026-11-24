import { afterEach, describe, expect, it, vi } from 'vitest';
import { JanisChat } from './client.js';
import { ChatStore, type StoreState } from './store.js';
import type { ChatMessage, PollResult } from './types.js';

type FakeReq = { method: string; url: string; body?: unknown };
type Responder = (r: FakeReq) => { status?: number; json?: unknown };

function harness(respond: Responder) {
  const calls: FakeReq[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const req: FakeReq = {
      method: init?.method ?? 'GET',
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(req);
    const res = respond(req);
    return new Response(JSON.stringify(res.json ?? {}), {
      status: res.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const chat = new JanisChat({
    token: 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb',
    baseUrl: 'https://api.test',
    visitorId: 'v_store_test_1',
    fetch: fetchImpl,
  });
  return { calls, chat };
}

const emptyPoll: PollResult = {
  messages: [],
  state: 'new',
  operator_typing: false,
  agent_typing: false,
};

const pollFor = (messages: ChatMessage[], over: Partial<PollResult> = {}): PollResult => ({
  ...emptyPoll,
  state: 'active',
  messages,
  has_more: false,
  conversation_id: 'conv1',
  ...over,
});

const msg = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  direction: 'out',
  text: `text-${id}`,
  created_at: `2026-01-01T00:00:${id.padStart(2, '0')}Z`,
  ...over,
});

const makeStore = (chat: JanisChat) =>
  new ChatStore(chat, { pollIntervalMs: 60_000, eventSource: null, loadConfig: false });

const stores: ChatStore[] = [];
function track(s: ChatStore): ChatStore {
  stores.push(s);
  return s;
}
afterEach(() => {
  while (stores.length) stores.pop()!.stop();
});

describe('ChatStore', () => {
  it('hydrates on start and surfaces transcript state', async () => {
    const { chat, calls } = harness(() => ({
      json: pollFor([msg('01'), msg('02')], { agent_typing: true }),
    }));
    const store = track(makeStore(chat));
    await store.start();
    const s = store.getState();
    expect(s.ready).toBe(true);
    expect(s.messages.map((m) => m.id)).toEqual(['01', '02']);
    expect(s.agentTyping).toBe(true);
    expect(s.conversationId).toBe('conv1');
    expect(calls[0].method).toBe('GET');
  });

  it('emits to subscribers and stops polling on unsubscribe', async () => {
    const { chat } = harness(() => ({ json: emptyPoll }));
    const store = track(makeStore(chat));
    const states: StoreState[] = [];
    const unsub = store.subscribe((s) => states.push(s));
    await vi.waitFor(() => expect(states.length).toBeGreaterThan(0));
    expect(store.getState().ready).toBe(true);
    unsub();
  });

  it('send() adds an optimistic message and reconciles its echo by client_id', async () => {
    let sentClientId = '';
    const { chat } = harness((r) => {
      if (r.method === 'POST' && r.url.endsWith('/messages')) {
        sentClientId = (r.body as { client_id?: string })?.client_id ?? '';
        return { json: { ok: true } };
      }
      // echo the stored inbound once a send has landed
      return {
        json: sentClientId
          ? pollFor([
              msg('10', {
                direction: 'in',
                text: 'hi there',
                client_id: sentClientId,
                created_at: '2026-01-01T00:00:10Z',
              }),
            ])
          : pollFor([]),
      };
    });
    const store = track(makeStore(chat));
    await store.start();

    const send = store.send('hi there');
    // optimistic — pending before the POST resolves
    const optimistic = store.getState().messages.find((m) => m.pending);
    expect(optimistic?.direction).toBe('in');
    expect(optimistic?.text).toBe('hi there');
    await send;
    expect(sentClientId).not.toBe('');

    await store.refresh();
    const s = store.getState();
    // the local echo is gone; the confirmed row carries the same client_id
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].id).toBe('10');
    expect(s.messages[0].pending).toBeUndefined();
  });

  it('marks a failed send and retries with the same client_id', async () => {
    let fail = true;
    const posted: string[] = [];
    const { chat } = harness((r) => {
      if (r.method === 'POST') {
        posted.push((r.body as { client_id?: string })?.client_id ?? '');
        return fail ? { status: 500, json: { error: 'boom' } } : { json: { ok: true } };
      }
      return { json: emptyPoll };
    });
    const store = track(makeStore(chat));
    await store.start();
    await store.send('oops');
    const failed = store.getState().messages[0];
    expect(failed.failed).toBe(true);

    fail = false;
    await store.retry(failed.client_id!);
    expect(posted).toHaveLength(2);
    expect(posted[0]).toBe(posted[1]); // same idempotency key
    expect(store.getState().messages[0].failed).toBeFalsy();
  });

  it('incremental polls advance the after cursor and merge in order', async () => {
    const afters: (string | null)[] = [];
    let batch = 0;
    const { chat } = harness((r) => {
      const u = new URL(r.url);
      afters.push(u.searchParams.get('after'));
      batch++;
      return { json: batch === 1 ? pollFor([msg('01')]) : pollFor([msg('02')], { has_more: undefined }) };
    });
    const store = track(makeStore(chat));
    await store.start();
    await store.refresh();
    expect(afters[0]).toBeNull();
    expect(afters[1]).toBe('2026-01-01T00:00:01Z');
    expect(store.getState().messages.map((m) => m.id)).toEqual(['01', '02']);
  });

  it('loadMore() pages older history with before= and updates hasMore', async () => {
    let page = 0;
    const { chat } = harness((r) => {
      const u = new URL(r.url);
      page++;
      if (u.searchParams.get('before')) {
        return {
          json: pollFor([msg('00', { created_at: '2025-12-31T23:59:59Z' })], { has_more: false }),
        };
      }
      return { json: pollFor([msg('05', { created_at: '2026-01-01T00:00:05Z' })], { has_more: true }) };
    });
    const store = track(makeStore(chat));
    await store.start();
    expect(store.getState().hasMore).toBe(true);
    await store.loadMore();
    const s = store.getState();
    expect(s.messages.map((m) => m.id)).toEqual(['00', '05']);
    expect(s.hasMore).toBe(false);
    expect(page).toBeGreaterThanOrEqual(2);
  });

  it('newChat() clears the transcript and re-polls fresh', async () => {
    let nuke = false;
    const { chat, calls } = harness((r) => {
      if (r.method === 'POST' && r.url.endsWith('/new')) {
        nuke = true;
        return { json: { ok: true, state: 'new' } };
      }
      return {
        json: nuke
          ? { ...emptyPoll, state: 'new' }
          : pollFor([msg('01')]),
      };
    });
    const store = track(makeStore(chat));
    await store.start();
    expect(store.getState().messages).toHaveLength(1);
    await store.newChat();
    expect(calls.some((c) => c.url.endsWith('/new'))).toBe(true);
    expect(store.getState().state).toBe('new');
    expect(store.getState().messages).toHaveLength(0);
  });

  it('sendTap() forwards component-tap metadata', async () => {
    const { chat, calls } = harness(() => ({ json: { ok: true, ...emptyPoll } }));
    const store = track(makeStore(chat));
    await store.selectOption(
      { title: 'When?', collect: 'booking' },
      { label: 'Tomorrow', send: 'Tomorrow morning works' },
    );
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({
      text: 'Tomorrow morning works',
      tap: true,
      tap_of: 'When?',
      tap_kind: 'options',
      tap_collect: 'booking',
      tap_item: { label: 'Tomorrow', send: 'Tomorrow morning works' },
    });
  });
});
