/**
 * Wire types for the Janis visitor chat API — the contract behind the
 * webchat Bubble (mounted at /chat on the API). Defined here so the
 * published package is self-contained; keep in sync with
 * apps/api/src/routes/webchat.ts.
 */

export type ConversationState = 'active' | 'needs_human' | 'human' | 'archived';

/** 'new' = no conversation exists for this visitor yet. */
export type ChatStatus = ConversationState | 'new';

export type MessageDirection = 'in' | 'out' | 'human';

export interface Attachment {
  name: string;
  /** Absolute URL (the API returns /uploads/…; the client resolves it). */
  url: string;
  type: string;
  size: number;
}

/** A tappable option under an agent message — string chips, or a
 * contact-field ask the SDK renders as an inline input. */
export type QuickReply = string | { type: 'email' | 'phone' };

/** Interactive components on an agent message. Only the kinds the SDK
 * renders are typed; unknown kinds pass through untouched. */
export type ChatWidget =
  | {
      type: 'options';
      title?: string;
      items: { label: string; description?: string; send?: string }[];
      collect?: string;
      [key: string]: unknown;
    }
  | {
      type: 'cards';
      items: {
        title: string;
        subtitle?: string;
        image?: string;
        price?: string;
        stock?: string;
        options?: string;
        compare_at?: string;
        link?: string;
        link_label?: string;
        select_label?: string;
        select_button?: string;
        [key: string]: unknown;
      }[];
      total?: number;
      collect?: string;
      [key: string]: unknown;
    }
  | ({ type: string } & Record<string, unknown>);

export interface ChatMessage {
  id: string;
  direction: MessageDirection;
  text: string | null;
  created_at: string;
  /** The sender's idempotency key — lets the SDK reconcile optimistic
   * sends after a lost response. */
  client_id?: string;
  /** The channel greeting, stored as a real transcript row. */
  greeting?: boolean;
  attachments?: Attachment[];
  quick_replies?: QuickReply[];
  widgets?: ChatWidget[];
  /** Operator identity on human replies (respects their show_identity opt-out). */
  author?: { name: string; avatar: string | null };
}

/** Widget bootstrap — display config; never credentials. */
export interface ChatConfig {
  name: string;
  agent_name: string;
  title: string;
  subtitle: string | null;
  greeting: string | null;
  accent: string | null;
  position: 'left' | 'right';
  display: 'bubble' | 'modal';
  logo_url: string | null;
  radius: number | null;
  quick_replies: QuickReply[];
  help_url: string | null;
  show_help_link: boolean;
  help_suggestions: { title: string; url: string }[];
  theme: string;
  hide_powered_by: boolean;
  dictation: boolean;
  dictation_engine: 'llm' | 'browser';
  font_family: string | null;
  font_scale: number | null;
  greeting_widgets: ChatWidget[];
  [key: string]: unknown;
}

/** GET /chat/:token/messages response. */
export interface PollResult {
  messages: ChatMessage[];
  state: ChatStatus;
  participant?: string;
  conversation_id?: string;
  /** An operator is composing a reply in the console. */
  operator_typing: boolean;
  /** A message was dispatched to the agent and no reply has landed. */
  agent_typing: boolean;
  /** Present on full loads: older history exists (page with ?before=). */
  has_more?: boolean;
}

/** Host-asserted identity — `sig` is HMAC-SHA256(identity_secret,
 * `${id}|${email}|${name}`) minted by the host's server (or Janis for its
 * own users). Unsigned claims are stored but flagged unverified. */
export interface ChatUser {
  id?: string;
  name?: string;
  email?: string;
  sig?: string;
  avatar_url?: string;
  /** Host-provided context for the agent (plan, company, …). Unsigned —
   * treated as self-reported context. */
  traits?: Record<string, unknown>;
}

/** Tap metadata mirroring the widget's sendText(tap) — a pick from a
 * component, not typed intent. */
export interface TapMeta {
  /** The component/question the pick came from. */
  of?: string;
  /** 'options' marks an answer pick (collected data, not just a click). */
  kind?: string;
  /** Bound-component name — routes the tap to its submit binding. */
  collect?: string;
  /** The picked item's props (bound-picker submits). */
  item?: Record<string, unknown>;
  /** Structured collect-form submit {name, values}. */
  form?: { name: string; values: Record<string, string> };
}

export interface SendOptions {
  /** Display name for anonymous visitors (stored on the profile). */
  name?: string;
  attachments?: Attachment[];
  /** Idempotency key — the SDK mints one per send; pass your own to make
   * retries from your own outbox dedupe server-side. */
  clientId?: string;
  /** Component-tap metadata — a picked option/card, not typed intent. */
  tap?: TapMeta;
  /** Storefront cart snapshot (one-line summary). */
  cart?: string;
  market?: string;
  marketCurrency?: string;
}

/** A file to upload — React Native pickers hand back {uri,name,type};
 * blobs/Files also work where they exist. */
export type UploadFile =
  | { uri: string; name?: string; type?: string }
  | { name?: string; type?: string; [key: string]: unknown };

/** Visitor-id persistence — AsyncStorage, MMKV, expo-secure-store, or the
 * default in-memory store. */
export interface VisitorStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}

/** Minimal EventSource contract — RN ≥0.73 ships a global EventSource;
 * pass a polyfill (`react-native-sse`, `expo`) on older versions. Events
 * carry no content — they only tell the client to poll now. */
export interface EventSourceLike {
  close(): void;
  onmessage: ((ev: { data?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}
export type EventSourceCtor = new (url: string) => EventSourceLike;
