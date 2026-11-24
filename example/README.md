# janis-mobile-demo

Expo demo app embedding the `janis-mobile` SDK's `ChatView` — a working
Janis support chat on iOS/Android.

## Run it

```bash
cp .env.example .env    # fill in EXPO_PUBLIC_JANIS_CHANNEL_TOKEN
npm install
npm run ios             # iOS simulator
npm run android
# or: npx expo start    (then press i / a, or scan with Expo Go)
```

The token is a **webchat channel id** — Janis console → your agent →
Channels → open the "Bubble" channel → **Install** tab → it's the
`data-janis-token="…"` value in the embed snippet. It's the public widget
credential, so it's safe in the binary. `.env.example` shows the same
snippet annotated.

Default API is prod (`https://app.janis.ai`) — sends and replies are
real. For local dev:

```bash
# run your local janis-api on :8787 first
EXPO_PUBLIC_JANIS_BASE_URL=http://localhost:8787 npm run ios
```

Android emulator needs `http://10.0.2.2:8787`; a physical device needs
your LAN IP. The local `janis_dev` DB needs an agent with a webchat
channel — copy its id from the console's channel settings.

## What it demonstrates

- `ChatBubble` — the floating launcher + open window over "host app"
  content, styled by the channel's console config (accent, launcher,
  position, display, theme, proactive teaser); unread badge while closed
- minimize via the ⌄ header button, launcher tap, or the imperative ref
  (`ref.current.open()/.minimize()` — the home screen's "Open chat"
  button uses it)
- visitor-id persistence via `AsyncStorage` — the same chat survives
  cold starts
- `onAttach` wired to `expo-image-picker` — uploads land as attachments

Verified identity (`identify` with a host-signed claim) isn't wired into
the demo UI — see `packages/mobile/README.md`.

## Simulator keyboard quirk

In a dev build / Expo Go, single letters typed into the composer can
trigger the dev client's key commands instead of entering text — `r`
reloads, `h` returns to the launcher home (the app "hides"). This is a
known upstream bug (expo/expo#19911) that only affects hardware-keyboard
input in dev builds — release builds are unaffected. Workaround:
simulator → **I/O → Keyboard → uncheck "Connect Hardware Keyboard"**,
then type with the on-screen keyboard (⌘K toggles it).
