import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatStore, JanisChat } from 'janis-mobile';
import type { UploadFile } from 'janis-mobile';
import { ChatBubble, useJanisChat, type ChatBubbleHandle } from 'janis-mobile/react';

/**
 * Configure via env (Expo inlines EXPO_PUBLIC_* at bundle time):
 *   EXPO_PUBLIC_JANIS_CHANNEL_TOKEN — a webchat channel id (agent →
 *     Channels → Bubble → embed snippet). The channel id IS the public
 *     credential — safe to ship in the binary.
 *   EXPO_PUBLIC_JANIS_BASE_URL — API origin (default https://app.janis.ai).
 *     Local API: http://localhost:8787 (iOS sim) or
 *     http://10.0.2.2:8787 (Android emulator).
 */
const TOKEN = process.env.EXPO_PUBLIC_JANIS_CHANNEL_TOKEN ?? '';
const BASE_URL = process.env.EXPO_PUBLIC_JANIS_BASE_URL;

const chat = TOKEN
  ? new JanisChat({
      token: TOKEN,
      baseUrl: BASE_URL,
      // AsyncStorage keeps the visitor id (and so the conversation) across
      // launches. Without it every cold start is a new chat.
      storage: AsyncStorage,
    })
  : null;
const store = chat ? new ChatStore(chat) : null;

async function pickImage(): Promise<UploadFile | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  const asset = res.assets?.[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    name: asset.fileName ?? 'photo.jpg',
    type: asset.mimeType ?? 'image/jpeg',
  };
}

/**
 * The demo is a "host app" screen — the Janis ChatBubble floats over it,
 * styled by the channel's console config (accent, launcher, position,
 * display, theme, greeting). Tap to open; the ⌄ header button (or the
 * launcher, or the ref API below) minimizes back to the bubble.
 */
function DemoScreen({ store }: { store: ChatStore }) {
  const bubble = useRef<ChatBubbleHandle>(null);
  const j = useJanisChat(store);
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.appBar}>
        <Text style={styles.appBarTitle}>Your app</Text>
      </View>
      <View style={styles.home}>
        <Text style={styles.homeTitle}>This is your app's content.</Text>
        <Text style={styles.homeBody}>
          The Janis bubble floats over it — branded by the channel's console
          config (accent, launcher icon, position, theme). Tap it to open;
          the ⌄ button or a launcher tap minimizes it back. Unread replies
          badge the launcher while it's closed.
        </Text>
        <Pressable style={styles.openBtn} onPress={() => bubble.current?.open()}>
          <Text style={styles.openBtnText}>
            {j.state === 'archived' ? 'Open chat' : `Open chat${j.config?.agent_name ? ` — ${j.config.agent_name}` : ''}`}
          </Text>
        </Pressable>
      </View>
      <ChatBubble
        ref={bubble}
        chat={store}
        onAttach={pickImage}
        placeholder="Message…"
      />
    </SafeAreaView>
  );
}

function SetupScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.setup}>
        <Text style={styles.setupTitle}>Janis chat demo</Text>
        <Text style={styles.setupBody}>
          Set a channel token to connect:{'\n\n'}
          <Text style={styles.mono}>EXPO_PUBLIC_JANIS_CHANNEL_TOKEN=…</Text>
          {'\n\n'}
          Find it on the agent's Channels page (Bubble → embed snippet — the
          channel id is the token).{'\n\n'}
          Point at a local API with{' '}
          <Text style={styles.mono}>EXPO_PUBLIC_JANIS_BASE_URL</Text> —
          localhost:8787 on the iOS simulator, 10.0.2.2:8787 on the Android
          emulator.
        </Text>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {store ? <DemoScreen store={store} /> : <SetupScreen />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f9' },
  appBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5ea',
  },
  appBarTitle: { fontSize: 17, fontWeight: '700', color: '#17171c' },
  home: { flex: 1, padding: 24 },
  homeTitle: { fontSize: 22, fontWeight: '700', color: '#17171c', marginBottom: 10 },
  homeBody: { fontSize: 15, lineHeight: 23, color: '#44444c' },
  openBtn: {
    marginTop: 20,
    alignSelf: 'flex-start',
    backgroundColor: '#17171c',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  openBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  setup: { flex: 1, justifyContent: 'center', padding: 32 },
  setupTitle: { fontSize: 22, fontWeight: '700', color: '#17171c', marginBottom: 16 },
  setupBody: { fontSize: 15, lineHeight: 23, color: '#44444c' },
  mono: { fontFamily: 'Courier', fontSize: 13, color: '#17171c' },
});
