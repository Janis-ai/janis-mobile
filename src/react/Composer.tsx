import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ChatTheme } from './theme.js';

export interface ComposerProps {
  theme: ChatTheme;
  placeholder?: string;
  /** Called with the trimmed text — clears the input first. */
  onSend(text: string): void;
  /** Typing ping — wire to the store's throttled typing(). */
  onTyping?(): void;
  /** Attach button — shown only when provided. */
  onAttach?(): void;
  autoFocus?: boolean;
}

/** The webchat composer's quick-emoji set (widget.js EMOJIS) — keep in
 * sync. Tap inserts at the end of the draft. */
const EMOJIS = (
  '😀 😄 😁 🙂 😉 😊 😍 🤩 😘 😜 🤪 😎 🤔 😅 😂 🤣 😢 😭 😮 😴' +
  ' 👍 👎 🙏 👏 🙌 🤝 💪 ✌️ 🤞 👋 👀 💬 ❤️ 💚 💙 💜 🖤 🤍 💯 ✅ 🎉 🔥 ⭐ 💡 📎 ❓'
).split(' ');

export function Composer({ theme, placeholder, onSend, onTyping, onAttach }: ComposerProps) {
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const canSend = text.trim().length > 0;
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    setEmojiOpen(false);
    onSend(t);
  };
  const insertEmoji = (e: string) => {
    setText((t) => t + e);
    onTyping?.();
  };
  return (
    <View style={[styles.wrap, { backgroundColor: theme.composerBg, borderTopColor: theme.border }]}>
      {emojiOpen ? (
        <View style={styles.palette}>
          {EMOJIS.map((e) => (
            <Pressable key={e} style={styles.emojiBtn} onPress={() => insertEmoji(e)}>
              <Text style={styles.emoji}>{e}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.row}>
        {onAttach ? (
          <Pressable
            style={[styles.attach, { borderColor: theme.border }]}
            onPress={onAttach}
            testID="janis-attach"
          >
            <Text style={{ color: theme.muted, fontSize: 20, lineHeight: 22 }}>+</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.emojiToggle}
          onPress={() => setEmojiOpen((o) => !o)}
          testID="janis-emoji"
        >
          <Text style={{ fontSize: 20, opacity: emojiOpen ? 1 : 0.6 }}>😊</Text>
        </Pressable>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, color: theme.agentText }]}
          value={text}
          onChangeText={(t) => {
            setText(t);
            onTyping?.();
          }}
          onSubmitEditing={submit}
          placeholder={placeholder ?? 'Message…'}
          placeholderTextColor={theme.muted}
          multiline
          returnKeyType="send"
          testID="janis-input"
        />
        <Pressable
          style={[styles.send, { backgroundColor: canSend ? theme.accent : theme.inputBg }]}
          onPress={submit}
          disabled={!canSend}
          testID="janis-send"
        >
          <Text style={{ color: canSend ? theme.accentText : theme.muted, fontWeight: '700', fontSize: 16 }}>
            ↑
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  emojiBtn: { padding: 5 },
  emoji: { fontSize: 22 },
  emojiToggle: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  attach: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  input: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 15,
    maxHeight: 120,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
