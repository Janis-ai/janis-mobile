import { useEffect, useRef, useState } from 'react';
import { JanisChat, type JanisChatOptions } from '../client.js';
import { ChatStore, type ChatStoreOptions, type StoreState, type UiMessage } from '../store.js';
import type { ChatUser, QuickReply, SendOptions, TapMeta, UploadFile } from '../types.js';

export interface UseJanisChatResult extends StoreState {
  send(text: string, opts?: SendOptions): Promise<UiMessage>;
  sendTap(text: string, tap: TapMeta): Promise<UiMessage>;
  /** A string quick-reply chip — sent as a component tap, not typed text. */
  sendQuickReply(reply: string): Promise<UiMessage>;
  selectOption: ChatStore['selectOption'];
  selectCard: ChatStore['selectCard'];
  /** Resend a failed message (same idempotency key). */
  retry(clientId: string): Promise<void>;
  sendAttachment(file: UploadFile, text?: string): Promise<UiMessage>;
  loadMore(): Promise<void>;
  endChat(): Promise<void>;
  newChat(): Promise<void>;
  identify(user: ChatUser | null): Promise<void>;
  /** Visitor-is-typing ping — call from the composer's onChangeText. */
  typing(): void;
  refresh(): Promise<void>;
}

export type { QuickReply };

/**
 * React adapter over ChatStore — subscribe on mount, unsubscribe (and stop
 * polling) on unmount. `source` is a JanisChat instance or its options;
 * options are read ONCE (memoized on first render) — pass a configured
 * JanisChat if you need to rebuild it later.
 */
export function useJanisChat(
  source: JanisChat | JanisChatOptions | ChatStore,
  storeOptions?: ChatStoreOptions,
): UseJanisChatResult {
  const ref = useRef<{ store: ChatStore } | undefined>(undefined);
  if (!ref.current) {
    const store =
      source instanceof ChatStore
        ? source
        : new ChatStore(source instanceof JanisChat ? source : new JanisChat(source), storeOptions);
    ref.current = { store };
  }
  const store = ref.current.store;
  const [state, setState] = useState<StoreState>(store.getState());

  useEffect(() => store.subscribe(setState), [store]);

  return {
    ...state,
    send: (text, opts) => store.send(text, opts),
    sendTap: (text, tap) => store.sendTap(text, tap),
    sendQuickReply: (reply) => store.sendTap(reply, {}),
    selectOption: (w, i) => store.selectOption(w, i),
    selectCard: (w, i) => store.selectCard(w, i),
    retry: (clientId) => store.retry(clientId),
    sendAttachment: (file, text) => store.sendAttachment(file, text),
    loadMore: () => store.loadMore(),
    endChat: () => store.endChat(),
    newChat: () => store.newChat(),
    identify: (user) => store.identify(user),
    typing: () => store.typing(),
    refresh: () => store.refresh(),
  };
}
