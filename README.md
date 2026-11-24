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

## Quick start — floating chat bubble

```tsx
import { ChatBubble } from 'janis-mobile/react';

const chat = { token: 'your-webchat-channel-id' }; // from the channel's embed snippet

export function HomeScreen() {
  return (
    <View style={{ flex: 1 }}>
      {/* your app content */}
      <ChatBubble chat={chat} />
    </View>
  );
}
```

`ChatBubble` is the Intercom-style experience: a corner launcher (the
channel's configured accent/icon/position), an unread badge, the proactive
teaser, and an open window with a minimize button — tap the launcher or
the ⌄ header button to collapse back. All console config applies: accent,
logo, launcher (`glyph`/`logo`/custom image), `position`, `display`
(`bubble` card vs `modal` sheet), `open_default`, `theme`
(light/dark/match-OS), `help_url`, `hide_powered_by`, proactive teaser.

Device-adaptive defaults: phones open maximized (a bottom sheet — a
floating card reads badly on small screens); tablets stay collapsed to
the launcher and follow the channel's `display`/`open_default`. Nothing
paints until the channel config lands, so branding never flashes.

```tsx
const ref = useRef<ChatBubbleHandle>(null);
<ChatBubble
  ref={ref}
  chat={chat}
  offset={64}             // clear a tab bar
  presentation="bubble"   // pin the anchored card on every device
  defaultOpen={false}     // pin collapsed everywhere ('auto' is default)
  showLauncher={false}    // your own trigger — drive via ref or `open`
  onOpenChange={(o) => track(o ? 'chat_opened' : 'chat_minimized')}
/>
ref.current.open(); ref.current.minimize(); ref.current.toggle();
```

With `showLauncher={false}` there's no floating icon — the chat starts
open and your own button/link calls `ref.current.open()` (or bind the
controlled `open` prop).

Or a full-screen chat route instead — `ChatView` is the same window
content without the launcher:

```tsx
import { ChatView } from 'janis-mobile/react';
export function SupportScreen() {
  return <ChatView chat={chat} onAttach={pickFile} />;
}
```

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
`endedText`/`newChatLabel` copy. Lower still, `MessageRow`, `MessageText`,
`Composer`, and `TypingDots` are exported individually.

Message text renders the same markdown-ish format as the web Bubble —
`**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[label](url)` and
bare-URL links, `![alt](url)` inline images (gif embeds), `:shortcode:`
emoji, bullet/numbered lists, and `#` headers demoted to bold lines. The
parser (`parseBlocks`/`splitTrail`/`demojize`) is exported from the
`janis-mobile` entry for custom renderers.

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
