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

export function Composer({ theme, placeholder, onSend, onTyping, onAttach }: ComposerProps) {
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0;
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    onSend(t);
  };
  return (
    <View style={[styles.row, { backgroundColor: theme.composerBg, borderTopColor: theme.border }]}>
      {onAttach ? (
        <Pressable
          style={[styles.attach, { borderColor: theme.border }]}
          onPress={onAttach}
          testID="janis-attach"
        >
          <Text style={{ color: theme.muted, fontSize: 20, lineHeight: 22 }}>+</Text>
        </Pressable>
      ) : null}
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
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
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
