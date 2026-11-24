import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { JanisChatOptions } from '../client.js';
import { JanisChat } from '../client.js';
import { ChatStore, type ChatStoreOptions, type UiMessage } from '../store.js';
import type { UploadFile } from '../types.js';
import { Composer } from './Composer.js';
import { MessageRow } from './MessageRow.js';
import { TypingDots } from './TypingDots.js';
import { defaultTheme, type ChatScheme, type ChatTheme } from './theme.js';
import { useJanisChat } from './useJanisChat.js';
import type { ReactNode } from 'react';

export interface ChatViewProps {
  /** A configured JanisChat, its options, or a prebuilt ChatStore. */
  chat: JanisChat | JanisChatOptions | ChatStore;
  storeOptions?: ChatStoreOptions;
  /** Theme overrides — merged over defaults derived from the channel accent. */
  theme?: Partial<ChatTheme>;
  /** Accent override — wins over the channel's configured accent. */
  accent?: string;
  /** 'light' | 'dark' | 'auto' (match OS). Default: the channel's theme. */
  scheme?: ChatScheme;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Distance the view's bottom edge already sits above the bottom of
   * the screen — the composer lifts by keyboard height minus this.
   * ChatBubble sets it (sheet padding / launcher offset); standalone
   * hosts with a bottom tab bar can pass its height. Default 0. */
  bottomInset?: number;
  /** Extra lift added on top of the keyboard height (same direction
   * as RN's KeyboardAvoidingView prop — for a header above the view). */
  keyboardVerticalOffset?: number;
  /** Attach button handler — return a picked file to upload+send, or
   * null/undefined when the picker was cancelled. Wire your picker here
   * (expo-image-picker, react-native-document-picker, …). */
  onAttach?(): Promise<UploadFile | null | undefined> | UploadFile | null | undefined;
  /** Full per-row render escape hatch. */
  renderMessage?(message: UiMessage): ReactNode;
  /** Rendered when the thread is ready, empty, and has no greeting. */
  emptyState?: ReactNode;
  endedText?: string;
  newChatLabel?: string;
  /** "Powered by Janis" footer — follows the channel's hide_powered_by
   * unless forced off here. */
  showPoweredBy?: boolean;
}

/**
 * Drop-in chat screen — transcript (bubbles, attachments, options/cards,
 * quick replies), typing indicators, composer, ended/new-chat bar. Wire
 * your own navigation header around it.
 */
export function ChatView(props: ChatViewProps) {
  const j = useJanisChat(props.chat, props.storeOptions);
  const os = useColorScheme();
  const cfgScheme = (props.scheme ?? j.config?.theme) as ChatScheme | undefined;
  const scheme = cfgScheme === 'auto' ? (os === 'dark' ? 'dark' : 'light') : cfgScheme;
  const theme = defaultTheme(
    props.accent ?? (j.config?.accent as string | null),
    props.theme,
    scheme ?? 'light',
  );

  const messages = useMemo(() => {
    const msgs = [...j.messages];
    // Synthetic greeting on an empty thread — the stored via:'greeting'
    // row renders it once a real transcript exists.
    if (msgs.length === 0 && j.config?.greeting) {
      msgs.unshift({
        id: '__greeting__',
        direction: 'out',
        text: j.config.greeting,
        created_at: new Date(0).toISOString(),
        greeting: true,
        quick_replies: j.config.quick_replies?.length ? j.config.quick_replies : undefined,
        widgets: j.config.greeting_widgets?.length ? j.config.greeting_widgets : undefined,
      });
    }
    return msgs;
  }, [j.messages, j.config]);

  const data = useMemo(() => [...messages].reverse(), [messages]);
  const typing = j.agentTyping || j.operatorTyping;
  const ended = j.state === 'archived';

  const handleAttach = () => {
    void Promise.resolve(props.onAttach?.())
      .then((picked) => {
        if (picked) void j.sendAttachment(picked);
      })
      .catch(() => {});
  };

  // Keyboard lift driven by the event's own height — KeyboardAvoidingView
  // measures the view's screen frame, which under-reports inside the
  // absolutely-positioned ChatBubble overlay (composer ends up half
  // under the keyboard). bottomInset = space the view bottom already
  // clears (sheet padding, launcher offset); Android resizes the window
  // itself, so no lift there.
  const kbPad = useRef(new Animated.Value(0)).current;
  const liftInset = (props.bottomInset ?? 0) - (props.keyboardVerticalOffset ?? 0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const lift = (toValue: number, duration = 250) =>
      Animated.timing(kbPad, {
        toValue,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    const show = Keyboard.addListener('keyboardWillShow', (e) =>
      lift(Math.max(e.endCoordinates.height - liftInset, 0), e.duration),
    );
    const hide = Keyboard.addListener('keyboardWillHide', (e) => lift(0, e.duration));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [kbPad, liftInset]);

  return (
    <Animated.View
      style={[
        styles.root,
        { backgroundColor: theme.background, paddingBottom: kbPad },
        props.style,
      ]}
    >
      <FlatList
        inverted
        data={data}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) =>
          props.renderMessage ? (
            props.renderMessage(item)
          ) : (
            <MessageRow
              message={item}
              theme={theme}
              onRetry={(id) => void j.retry(id)}
              onQuickReply={(t) => void j.sendQuickReply(t)}
              onContactSubmit={(v) => void j.send(v)}
              onSelectOption={(w, i) => void j.selectOption(w, i)}
              onSelectCard={(w, i) => void j.selectCard(w, i)}
            />
          )
        }
        contentContainerStyle={[styles.content, props.contentContainerStyle]}
        ListHeaderComponent={
          typing ? (
            <View style={styles.typing}>
              <TypingDots theme={theme} />
            </View>
          ) : undefined
        }
        ListFooterComponent={
          j.hasMore ? <ActivityIndicator style={styles.more} color={theme.muted} /> : undefined
        }
        ListEmptyComponent={
          j.ready && !j.config?.greeting ? <>{props.emptyState ?? null}</> : undefined
        }
        onEndReached={() => {
          if (j.hasMore) void j.loadMore();
        }}
        onEndReachedThreshold={0.3}
        keyboardShouldPersistTaps="handled"
      />
      {ended ? (
        <View style={[styles.ended, { backgroundColor: theme.composerBg, borderTopColor: theme.border }]}>
          <Text style={{ color: theme.muted }}>{props.endedText ?? 'This chat has ended.'}</Text>
          <Pressable
            style={[styles.newChat, { borderColor: theme.accent }]}
            onPress={() => void j.newChat()}
          >
            <Text style={{ color: theme.accent, fontWeight: '600' }}>
              {props.newChatLabel ?? 'Start a new chat'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Composer
          theme={theme}
          placeholder={props.placeholder}
          onSend={(t) => void j.send(t)}
          onTyping={() => j.typing()}
          onAttach={props.onAttach ? handleAttach : undefined}
        />
      )}
      {props.showPoweredBy !== false && !j.config?.hide_powered_by ? (
        <Text style={[styles.powered, { color: theme.muted, backgroundColor: theme.composerBg }]}>
          Powered by Janis
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingVertical: 8 },
  typing: { alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 2 },
  more: { marginVertical: 10 },
  ended: {
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  newChat: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 8,
  },
  powered: { textAlign: 'center', fontSize: 10, paddingBottom: 6 },
});
