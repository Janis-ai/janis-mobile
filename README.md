# janis-mobile

In-app [Janis](https://app.janis.ai) chat for React Native & Expo — drop a
support chat into your app that answers with AI and hands off to humans
when needed. One conversation, one transcript, across your app and every
other Janis channel.

```bash
npm install janis-mobile
```

The package has two entry points:

- `janis-mobile` — headless client (`JanisChat`) + state container
  (`ChatStore`). No React dependency.
- `janis-mobile/react` — `useJanisChat` hook + ready-made `ChatView`
  components (bubbles, quick replies, option/card widgets, typing dots,
  composer).

## Quick start — drop-in chat screen

```tsx
import { ChatView } from 'janis-mobile/react';

const chat = { token: 'your-webchat-channel-id' }; // from the channel's embed snippet

export function SupportScreen() {
  return <ChatView chat={chat} onAttach={pickFile} />;
}
```

`ChatView` renders the whole thread — transcript, greeting, typing
indicators, composer — and handles optimistic sends, retries, history
paging, and live polling. Wire your own navigation header around it. The
channel's configured accent colors the bubbles; override with `accent` or
`theme`.

## Keeping the conversation across launches

Visitor ids are what bind a chat to a person. The default storage is
in-memory — pass any KV store to keep one thread across app launches:

```ts
import { JanisChat } from 'janis-mobile';
import AsyncStorage from '@react-native-async-storage/async-storage';

const chat = new JanisChat({
  token: 'your-webchat-channel-id',
  storage: AsyncStorage, // or MMKV, expo-secure-store, …
});
```

Or bind the chat to your own account system with `visitorId` (8–64 chars,
`[A-Za-z0-9_-]`).

## Verified identity

Sign the claim server-side with the channel's `identity_secret`
(HMAC-SHA256 over `id|email|name`) and pass it in — signed-in users get a
verified profile and cross-device history:

```ts
await chat.identify({ id: user.id, name: user.name, email: user.email, sig });
// sign out: chat.identify(null)
```

## Headless usage

```ts
import { JanisChat, ChatStore } from 'janis-mobile';

const chat = new JanisChat({ token: '…', storage: AsyncStorage });
const store = new ChatStore(chat, { pollIntervalMs: 4000 });

const unsubscribe = store.subscribe((state) => {
  // state.messages, state.state, state.agentTyping, state.operatorTyping,
  // state.hasMore, state.config, state.ready
});

await store.send('where is my order?');
await store.selectOption(widget, item);        // options-widget tap
await store.loadMore();                        // older history
await store.endChat();                         // visitor ended the chat
await store.newChat();                         // start a fresh thread
```

`ChatStore` reconciles optimistic sends by `client_id` (server-deduped),
polls with backoff on errors, and upgrades to live SSE pokes when the
runtime ships `EventSource` (RN ≥ 0.73) or you pass one:

```ts
import EventSource from 'react-native-sse';
new ChatStore(chat, { eventSource: EventSource });
```

## Custom UI

`useJanisChat` gives you the full store API; `ChatView` accepts
`renderMessage` per-row overrides, `onAttach` (wire any picker — the
returned `{uri,name,type}` uploads and sends), `emptyState`, theming, and
`endedText`/`newChatLabel` copy. Lower still, `MessageRow`, `Composer`,
and `TypingDots` are exported individually.

## Attachments

```ts
import * as ImagePicker from 'expo-image-picker';

const onAttach = async () => {
  const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
  const a = r.assets?.[0];
  return a ? { uri: a.uri, name: a.fileName ?? 'photo.jpg', type: a.mimeType } : null;
};
```

## Notes

- The channel id **is** the credential — safe to ship in the app binary.
  Visitor ids are transcript keys, not secrets.
- The package ships compiled `dist/` — in a monorepo, rebuild it after
  SDK edits before bundling (`npm run build -w packages/mobile`; the
  demo app's `ios`/`android`/`start` scripts chain this).
- Form / status / receipt / pricing / cart widgets pass through on
  `message.widgets` but aren't rendered by `ChatView` yet — render them
  via `renderMessage`.
- Full contract: https://app.janis.ai/docs
