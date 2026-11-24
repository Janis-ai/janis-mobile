import { JanisChat } from './client.js';
import { randId } from './id.js';
import type {
  ChatConfig,
  ChatMessage,
  ChatStatus,
  ChatUser,
  EventSourceCtor,
  EventSourceLike,
  PollResult,
  SendOptions,
  TapMeta,
  UploadFile,
} from './types.js';

export interface UiMessage extends ChatMessage {
  /** Local echo: POST in flight (pending) or awaiting the transcript echo. */
  pending?: boolean;
  /** POST failed — renders a retry affordance; retry(client_id) resends
   * with the same idempotency key. */
  failed?: boolean;
}

export interface StoreState {
  /** Ascending by created_at; unconfirmed locals sort last. */
  messages: UiMessage[];
  state: ChatStatus;
  /** An operator is composing in the console. */
  operatorTyping: boolean;
  /** The agent received the last message and hasn't replied yet. */
  agentTyping: boolean;
  /** Older history exists — loadMore() pages back. */
  hasMore: boolean;
  conversationId?: string;
  /** Bootstrap config — loaded once on start(). */
  config?: ChatConfig;
  /** The first transcript poll has completed. */
  ready: boolean;
  lastError?: string;
}

export interface ChatStoreOptions {
  /** Base poll interval (ms). Default 4000 — doubles on errors, capped 30s. */
  pollIntervalMs?: number;
  /** EventSource implementation for live pokes (events carry no content —
   * they just trigger an immediate poll). Default: globalThis.EventSource.
   * Pass null to force polling only. */
  eventSource?: EventSourceCtor | null;
  /** Load the bootstrap config on start (greeting, branding). Default true. */
  loadConfig?: boolean;
}

type Listener = (state: StoreState) => void;

/** Agent-side messages the visitor hasn't seen — pending/failed locals,
 * inbound echoes, and stored greeting rows don't count. `seenAt` is the
 * created_at of the newest message rendered while the chat was open. */
export function countUnread(messages: UiMessage[], seenAt: string | null): number {
  let n = 0;
  for (const m of messages) {
    if (m.direction === 'in' || m.pending || m.failed || m.greeting) continue;
    if (seenAt == null || m.created_at > seenAt) n++;
  }
  return n;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * Framework-free chat state — the transport-agnostic half of the SDK.
 * Owns the transcript (merge/dedupe by client_id), optimistic sends,
 * polling with backoff, and the optional SSE poke stream. useJanisChat
 * is a thin adapter over this; non-React consumers can drive it directly.
 */
export class ChatStore {
  readonly chat: JanisChat;
  private intervalMs: number;
  private eventSourceCtor?: EventSourceCtor;
  private loadConfigFlag: boolean;

  private confirmed = new Map<string, UiMessage>();
  private unconfirmed = new Map<string, UiMessage>(); // by client_id
  private lastTs?: string;
  private state: ChatStatus = 'new';
  private operatorTyping = false;
  private agentTyping = false;
  private hasMore = false;
  private conversationId?: string;
  private config?: ChatConfig;
  private ready = false;
  private lastError?: string;

  private listeners = new Set<Listener>();
  private snapshot: StoreState;
  private timer?: ReturnType<typeof setTimeout>;
  private stream?: EventSourceLike;
  private running = false;
  private refreshing = false;
  private refreshQueued = false;
  private backoffMs = 0;

  constructor(chat: JanisChat, opts: ChatStoreOptions = {}) {
    this.chat = chat;
    this.intervalMs = opts.pollIntervalMs ?? 4000;
    this.eventSourceCtor =
      opts.eventSource === null ? undefined : (opts.eventSource ?? JanisChat.defaultEventSource());
    this.loadConfigFlag = opts.loadConfig !== false;
    this.snapshot = this.buildSnapshot();
  }

  getState(): StoreState {
    return this.snapshot;
  }

  /** Subscribe to state changes. The first subscriber starts polling;
   * the last unsubscribe stops it. */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    if (!this.running) void this.start();
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.stop();
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    if (this.loadConfigFlag && !this.config) {
      try {
        this.config = await this.chat.config();
      } catch {
        /* branding is cosmetic — don't block the transcript on it */
      }
    }
    await this.refresh();
    this.scheduleNext(this.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.closeStream();
  }

  private scheduleNext(ms: number) {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.refresh().finally(() => this.scheduleNext(this.backoffMs || this.intervalMs));
    }, ms);
  }

  /** Poll now. Coalesced — a refresh already in flight queues one more. */
  async refresh(): Promise<void> {
    if (this.refreshing) {
      this.refreshQueued = true;
      return;
    }
    this.refreshing = true;
    try {
      do {
        this.refreshQueued = false;
        const result = await this.chat.messages(this.lastTs ? { after: this.lastTs } : {});
        this.backoffMs = 0;
        this.apply(result);
        this.ready = true;
        this.lastError = undefined;
        this.emit();
      } while (this.refreshQueued);
    } catch (e) {
      this.backoffMs = this.backoffMs ? Math.min(this.backoffMs * 2, MAX_BACKOFF_MS) : this.intervalMs * 2;
      this.lastError = e instanceof Error ? e.message : String(e);
      this.emit();
    } finally {
      this.refreshing = false;
      this.ensureStream();
    }
  }

  private apply(result: PollResult) {
    for (const m of result.messages) {
      if (m.client_id) this.unconfirmed.delete(m.client_id);
      this.confirmed.set(m.id, m);
      if (!this.lastTs || m.created_at > this.lastTs) this.lastTs = m.created_at;
    }
    this.state = result.state;
    if (result.conversation_id) this.conversationId = result.conversation_id;
    this.operatorTyping = result.operator_typing;
    this.agentTyping = result.agent_typing;
    if (result.has_more !== undefined) this.hasMore = result.has_more;
  }

  private buildSnapshot(): StoreState {
    const msgs = [...this.confirmed.values()].sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
    );
    msgs.push(
      ...[...this.unconfirmed.values()].sort((a, b) =>
        a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
      ),
    );
    return {
      messages: msgs,
      state: this.state,
      operatorTyping: this.operatorTyping,
      agentTyping: this.agentTyping,
      hasMore: this.hasMore,
      conversationId: this.conversationId,
      config: this.config,
      ready: this.ready,
      lastError: this.lastError,
    };
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    for (const fn of this.listeners) fn(this.snapshot);
  }

  /** Optimistic send — the local echo renders immediately and reconciles
   * when the transcript echo lands (same client_id). Doesn't throw: a
   * failed POST flags the message for retry instead. */
  async send(text: string, opts: SendOptions = {}): Promise<UiMessage> {
    const clientId = opts.clientId ?? randId(40);
    const local: UiMessage = {
      id: `local_${clientId}`,
      direction: 'in',
      text,
      created_at: new Date().toISOString(),
      client_id: clientId,
      pending: true,
      ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
    };
    this.unconfirmed.set(clientId, local);
    this.state = this.state === 'new' ? 'active' : this.state;
    this.emit();
    try {
      await this.chat.send(text, { ...opts, clientId });
      local.pending = false;
      this.emit();
      // The reply may take a beat — grab the transcript soon rather than
      // waiting out the full interval. (SSE pokes also shortcut this.)
      setTimeout(() => void this.refresh(), 700);
    } catch (e) {
      local.pending = false;
      local.failed = true;
      this.lastError = e instanceof Error ? e.message : String(e);
      this.emit();
    }
    return local;
  }

  /** Resend a failed optimistic message with the same idempotency key —
   * the server dedupes if the original actually landed. */
  async retry(clientId: string): Promise<void> {
    const local = this.unconfirmed.get(clientId);
    if (!local?.failed) return;
    local.pending = true;
    local.failed = false;
    this.emit();
    try {
      await this.chat.send(local.text ?? '', { clientId });
      local.pending = false;
      this.emit();
      setTimeout(() => void this.refresh(), 700);
    } catch {
      local.pending = false;
      local.failed = true;
      this.emit();
    }
  }

  /** A tap on an options/card component — sends the pick with tap
   * metadata so the server routes it through the bound submit (and the
   * transcript reads as a pick, not typed intent). */
  sendTap(text: string, tap: TapMeta): Promise<UiMessage> {
    return this.send(text, { tap });
  }

  /** Convenience for an 'options' widget pick. */
  selectOption(
    widget: { title?: string; collect?: string },
    item: { label: string; send?: string } & Record<string, unknown>,
  ): Promise<UiMessage> {
    return this.sendTap(item.send ?? item.label, {
      of: widget.title,
      kind: 'options',
      collect: widget.collect,
      item,
    });
  }

  /** Convenience for a 'cards' widget select button. */
  selectCard(
    widget: { collect?: string },
    item: { title: string; select_label?: string } & Record<string, unknown>,
  ): Promise<UiMessage> {
    return this.sendTap(item.select_label ?? item.title, {
      of: item.title,
      collect: widget.collect,
      item,
    });
  }

  /** Page older history in — before the earliest confirmed message. */
  async loadMore(): Promise<void> {
    if (!this.hasMore || this.refreshing) return;
    const oldest = [...this.confirmed.values()].sort((a, b) =>
      a.created_at < b.created_at ? -1 : 1,
    )[0];
    if (!oldest) return;
    try {
      const result = await this.chat.messages({ before: oldest.created_at });
      for (const m of result.messages) this.confirmed.set(m.id, m);
      if (result.has_more !== undefined) this.hasMore = result.has_more;
      this.emit();
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.emit();
    }
  }

  /** Visitor-is-typing ping (throttled client-side). */
  typing(): void {
    void this.chat.typing().catch(() => {});
  }

  /** Host-asserted identity — binds the conversation to a verified user. */
  async identify(user: ChatUser | null): Promise<void> {
    await this.chat.identify(user);
    await this.refresh();
  }

  /** Upload then send — for attach flows wired to the app's picker. */
  async sendAttachment(file: UploadFile, text = ''): Promise<UiMessage> {
    const attachment = await this.chat.upload(file);
    return this.send(text, { attachments: [attachment] });
  }

  /** Customer-initiated end — archives the thread server-side. */
  async endChat(): Promise<void> {
    try {
      const r = await this.chat.end();
      this.state = (r.state as ChatStatus) ?? 'archived';
      this.emit();
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.emit();
    }
    await this.refresh();
  }

  /** Start a new chat — archives the live thread, binds a fresh
   * conversation, clears the local transcript before the next poll. */
  async newChat(): Promise<void> {
    try {
      await this.chat.newChat();
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.emit();
      return;
    }
    this.confirmed.clear();
    this.unconfirmed.clear();
    this.lastTs = undefined;
    this.hasMore = false;
    this.state = 'new';
    this.ready = false;
    this.closeStream();
    this.emit();
    await this.refresh();
  }

  private ensureStream() {
    if (this.stream || !this.eventSourceCtor || !this.conversationId || !this.running) return;
    try {
      const es = new this.eventSourceCtor(this.chat.eventsUrl());
      es.onmessage = () => void this.refresh();
      es.onerror = () => {
        es.close();
        if (this.stream === es) this.stream = undefined;
      };
      this.stream = es;
    } catch {
      this.stream = undefined;
    }
  }

  private closeStream() {
    try {
      this.stream?.close();
    } catch {
      /* closing a dead stream */
    }
    this.stream = undefined;
  }
}
