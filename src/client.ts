import { randId } from './id.js';
import type {
  Attachment,
  ChatConfig,
  ChatUser,
  EventSourceCtor,
  PollResult,
  SendOptions,
  UploadFile,
  VisitorStorage,
} from './types.js';

export class JanisApiError extends Error {
  status: number;
  retryAfter?: number;
  constructor(status: number, detail: string, retryAfter?: number) {
    super(`Janis chat failed: HTTP ${status}${detail ? ` ${detail}` : ''}`);
    this.name = 'JanisApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export interface JanisChatOptions {
  /** Webchat channel id — the public token from the channel's embed snippet. */
  token: string;
  /** Janis API origin. Default https://app.janis.ai */
  baseUrl?: string;
  /** Stable end-user id for this install. Persisted via `storage` when
   * omitted — pass your own to bind the chat to your account system. */
  visitorId?: string;
  /** Visitor-id persistence — AsyncStorage, MMKV, expo-secure-store.
   * Default: in-memory (a fresh chat each app launch). */
  storage?: VisitorStorage;
  /** Host-asserted identity — `sig` minted server-side with the channel's
   * identity_secret. Update later with identify(). */
  user?: ChatUser;
  /** Copilot thread key (t<rand>) — only meaningful for signed-in Janis
   * session users; anonymous visitors ignore it. */
  thread?: string;
  /** fetch override (tests, alternate runtimes). */
  fetch?: typeof fetch;
  /** Extra headers on every request. */
  headers?: Record<string, string>;
}

const STORAGE_KEY = 'janis.visitorId';
const TYPING_THROTTLE_MS = 3000;

/** Resolve a config/upload asset URL — `/uploads/…` paths are API-relative,
 * `//cdn…` lifts to https (widget.js's imgSrc rule). */
export function absoluteUrl(baseUrl: string, url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('//')) return `https:${url}`;
  return url.startsWith('/') ? `${baseUrl}${url}` : url;
}

const memoryStorage: VisitorStorage = (() => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
})();

/**
 * Visitor-side Janis chat client — the transport behind ChatStore.
 * Wraps the public /chat API the webchat Bubble uses: the channel id is
 * the credential, the visitor id is the transcript key.
 */
export class JanisChat {
  readonly token: string;
  readonly baseUrl: string;
  readonly thread?: string;
  /** Resolves once the visitor id is loaded (or minted). */
  readonly ready: Promise<void>;

  private fetchImpl: typeof fetch;
  private headers: Record<string, string>;
  private storage: VisitorStorage;
  private user?: ChatUser;
  private visitorId!: string;
  private lastTypingAt = 0;

  constructor(options: JanisChatOptions) {
    if (!options.token) throw new Error('JanisChat: token is required');
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? 'https://app.janis.ai').replace(/\/+$/, '');
    this.thread = options.thread;
    this.fetchImpl = options.fetch ?? fetch;
    this.headers = { ...(options.headers ?? {}) };
    this.storage = options.storage ?? memoryStorage;
    this.user = options.user;
    this.ready = this.initVisitor(options.visitorId);
  }

  private async initVisitor(explicit?: string) {
    let id = explicit ?? null;
    if (!id) {
      try {
        id = await this.storage.getItem(STORAGE_KEY);
      } catch {
        id = null;
      }
    }
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = `m${randId(28)}`;
      try {
        await this.storage.setItem(STORAGE_KEY, id);
      } catch {
        /* persistence is best-effort — a fresh id next launch just forks the thread */
      }
    }
    this.visitorId = id;
  }

  /** The resolved visitor id (awaits ready). */
  async getVisitorId(): Promise<string> {
    await this.ready;
    return this.visitorId;
  }

  private url(path: string): string {
    return `${this.baseUrl}/chat/${encodeURIComponent(this.token)}${path}`;
  }

  private identityQuery(): string {
    if (!this.user) return '';
    const p = new URLSearchParams();
    if (this.user.id) p.set('u_id', this.user.id);
    if (this.user.name) p.set('u_name', this.user.name);
    if (this.user.email) p.set('u_email', this.user.email);
    if (this.user.sig) p.set('u_sig', this.user.sig);
    const s = p.toString();
    return s ? `&${s}` : '';
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    await this.ready;
    const res = await this.fetchImpl(this.url(path), {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...this.headers,
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const retry = Number(res.headers.get('retry-after'));
      const text = (await res.text().catch(() => '')).slice(0, 300);
      throw new JanisApiError(res.status, text, Number.isFinite(retry) && retry > 0 ? retry : undefined);
    }
    return (await res.json()) as T;
  }

  /** Widget bootstrap — branding, greeting, quick replies, help links. */
  config(): Promise<ChatConfig> {
    return this.request('GET', '');
  }

  /** Host-asserted identity — call before the first message, or after
   * login/logout on the host app to re-bind the conversation. */
  async identify(user: ChatUser | null): Promise<void> {
    this.user = user ?? undefined;
    if (!user) return;
    await this.request('POST', '/identify', {
      visitor_id: this.visitorId,
      user,
      ...(this.thread ? { thread: this.thread } : {}),
    });
  }

  /** Send a visitor message. Resolves when the API has accepted it — the
   * agent's reply arrives on the next poll, not in this response. */
  send(text: string, opts: SendOptions = {}): Promise<{ ok: boolean; deduped?: boolean }> {
    const t = opts.tap;
    return this.request('POST', '/messages', {
      visitor_id: this.visitorId,
      text,
      ...(opts.name ? { name: opts.name } : {}),
      ...(this.user ? { user: this.user } : {}),
      ...(this.thread ? { thread: this.thread } : {}),
      ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
      ...(opts.clientId ? { client_id: opts.clientId } : {}),
      ...(t
        ? {
            tap: true,
            ...(t.of ? { tap_of: t.of } : {}),
            ...(t.kind ? { tap_kind: t.kind } : {}),
            ...(t.collect ? { tap_collect: t.collect } : {}),
            ...(t.item ? { tap_item: t.item } : {}),
            ...(t.form ? { form: t.form } : {}),
          }
        : {}),
      ...(opts.cart ? { cart: opts.cart } : {}),
      ...(opts.market ? { market: opts.market } : {}),
      ...(opts.marketCurrency ? { market_currency: opts.marketCurrency } : {}),
    });
  }

  /** Poll the transcript. `after` = incremental cursor (ISO timestamp);
   * `before` = older-page cursor. */
  async messages(opts: { after?: string; before?: string } = {}): Promise<PollResult> {
    const p = new URLSearchParams();
    p.set('visitor_id', this.visitorId);
    if (opts.after) p.set('after', opts.after);
    if (opts.before) p.set('before', opts.before);
    if (this.thread) p.set('thread', this.thread);
    const result = await this.request<PollResult>('GET', `/messages?${p}${this.identityQuery()}`);
    for (const m of result.messages) {
      if (m.attachments) {
        m.attachments = m.attachments.map((a) => ({
          ...a,
          url: a.url.startsWith('/') ? `${this.baseUrl}${a.url}` : a.url,
        }));
      }
    }
    return result;
  }

  /** SSE poke stream — events carry no content, they just mean "poll now".
   * 404s until a conversation exists; the caller decides when to (re)open. */
  eventsUrl(): string {
    const p = new URLSearchParams();
    p.set('visitor_id', this.visitorId);
    if (this.thread) p.set('thread', this.thread);
    return this.url(`/events?${p}${this.identityQuery()}`);
  }

  /** Visitor-is-typing ping — ephemeral, throttled client-side. */
  typing(): Promise<void> {
    const now = Date.now();
    if (now - this.lastTypingAt < TYPING_THROTTLE_MS) return Promise.resolve();
    this.lastTypingAt = now;
    return this.request('POST', '/typing', {
      visitor_id: this.visitorId,
      ...(this.thread ? { thread: this.thread } : {}),
      ...(this.user ? { user: this.user } : {}),
    }).then(() => undefined);
  }

  /** Customer-initiated "End chat" — archives the thread (CSAT prompt +
   * resolved webhook fire server-side). */
  end(): Promise<{ ok: boolean; state: string }> {
    return this.request('POST', '/end', {
      visitor_id: this.visitorId,
      ...(this.thread ? { thread: this.thread } : {}),
      ...(this.user ? { user: this.user } : {}),
    });
  }

  /** "Start a new chat" — archives the live thread and moves the visitor's
   * binding to a fresh conversation. */
  newChat(): Promise<{ ok: boolean; state: string }> {
    return this.request('POST', '/new', {
      visitor_id: this.visitorId,
      ...(this.thread ? { thread: this.thread } : {}),
      ...(this.user ? { user: this.user } : {}),
    });
  }

  /** Upload a file for a message attachment. Accepts an RN picker result
   * ({uri,name,type}) or a Blob/File. Returns the attachment to pass to
   * send(). */
  async upload(file: UploadFile): Promise<Attachment> {
    await this.ready;
    const fd = new FormData();
    fd.append('visitor_id', this.visitorId);
    const f = file as { uri?: string; name?: string; type?: string };
    if (typeof f.uri === 'string') {
      fd.append('file', {
        uri: f.uri,
        name: f.name ?? 'upload',
        type: f.type ?? 'application/octet-stream',
      } as unknown as Blob);
    } else {
      // RN's FormData type only declares 2-arg append; runtimes accept
      // (name, blob, filename) like the web.
      (fd.append as (n: string, v: unknown, filename?: string) => void)(
        'file',
        file,
        f.name ?? 'upload',
      );
    }
    const res = await this.fetchImpl(this.url('/uploads'), {
      method: 'POST',
      headers: { ...this.headers },
      body: fd,
    });
    if (!res.ok) {
      const retry = Number(res.headers.get('retry-after'));
      const text = (await res.text().catch(() => '')).slice(0, 300);
      throw new JanisApiError(res.status, text, Number.isFinite(retry) && retry > 0 ? retry : undefined);
    }
    const ref = (await res.json()) as Attachment;
    return { ...ref, url: ref.url.startsWith('/') ? `${this.baseUrl}${ref.url}` : ref.url };
  }

  /** Server-side dictation — requires the channel's dictation flag. */
  async transcribe(audio: UploadFile): Promise<string> {
    await this.ready;
    const fd = new FormData();
    fd.append('audio', audio as unknown as Blob);
    const res = await this.fetchImpl(this.url('/transcribe'), {
      method: 'POST',
      headers: { ...this.headers },
      body: fd,
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 300);
      throw new JanisApiError(res.status, text);
    }
    return ((await res.json()) as { text: string }).text;
  }

  /** Default SSE constructor — the global EventSource where the runtime
   * ships one (RN ≥0.73, web). Override via ChatStore options. */
  static defaultEventSource(): EventSourceCtor | undefined {
    return (globalThis as unknown as { EventSource?: EventSourceCtor }).EventSource;
  }
}

export default JanisChat;
