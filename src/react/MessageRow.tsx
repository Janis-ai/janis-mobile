import { useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { UiMessage } from '../store.js';
import type { Attachment, ChatWidget, QuickReply } from '../types.js';
import { MessageText } from './MessageText.js';
import type { ChatTheme } from './theme.js';

type OptionsWidget = Extract<ChatWidget, { type: 'options' }>;
type CardsWidget = Extract<ChatWidget, { type: 'cards' }>;

export interface MessageRowProps {
  message: UiMessage;
  theme: ChatTheme;
  onRetry(clientId: string): void;
  /** A string chip tap — sent as a component tap. */
  onQuickReply(text: string): void;
  /** A free-text submit from an email/phone contact ask. */
  onContactSubmit(value: string): void;
  onSelectOption(widget: OptionsWidget, item: OptionsWidget['items'][number]): void;
  onSelectCard(widget: CardsWidget, item: CardsWidget['items'][number]): void;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentView({ a, theme }: { a: Attachment; theme: ChatTheme }) {
  if (a.type.startsWith('image/')) {
    return (
      <Image
        source={{ uri: a.url }}
        style={[styles.image, { borderRadius: theme.radius - 6 }]}
        resizeMode="cover"
      />
    );
  }
  return (
    <Pressable
      style={[styles.file, { borderColor: theme.border }]}
      onPress={() => void Linking.openURL(a.url).catch(() => {})}
    >
      <Text style={[styles.fileName, { color: theme.agentText }]} numberOfLines={1}>
        {a.name}
      </Text>
      <Text style={[styles.fileSize, { color: theme.muted }]}>{humanSize(a.size)}</Text>
    </Pressable>
  );
}

/** {type:'email'|'phone'} quick reply — an inline field that sends the value. */
function ContactAsk({
  kind,
  theme,
  onSubmit,
}: {
  kind: 'email' | 'phone';
  theme: ChatTheme;
  onSubmit(value: string): void;
}) {
  const [value, setValue] = useState('');
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    if (kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return;
    onSubmit(v);
  };
  return (
    <View style={[styles.askRow, { borderColor: theme.accent }]}>
      <TextInput
        style={[styles.askInput, { color: theme.agentText, backgroundColor: theme.inputBg }]}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder={kind === 'email' ? 'you@example.com' : 'Your phone number'}
        placeholderTextColor={theme.muted}
        keyboardType={kind === 'email' ? 'email-address' : 'phone-pad'}
        autoCapitalize="none"
      />
      <Pressable
        style={[styles.askSend, { backgroundColor: theme.accent }]}
        onPress={submit}
      >
        <Text style={{ color: theme.accentText, fontWeight: '600' }}>Send</Text>
      </Pressable>
    </View>
  );
}

function QuickReplies({
  replies,
  theme,
  onPick,
  onContactSubmit,
}: {
  replies: QuickReply[];
  theme: ChatTheme;
  onPick(text: string): void;
  onContactSubmit(value: string): void;
}) {
  return (
    <View style={styles.chips}>
      {replies.map((q, i) =>
        typeof q === 'object' && (q.type === 'email' || q.type === 'phone') ? (
          <ContactAsk key={i} kind={q.type} theme={theme} onSubmit={onContactSubmit} />
        ) : (
          <Pressable
            key={i}
            style={[styles.chip, { borderColor: theme.accent }]}
            onPress={() => onPick(typeof q === 'string' ? q : '')}
          >
            <Text style={{ color: theme.accent }}>{typeof q === 'string' ? q : ''}</Text>
          </Pressable>
        ),
      )}
    </View>
  );
}

function OptionsWidgetView({
  widget,
  theme,
  onSelect,
}: {
  widget: OptionsWidget;
  theme: ChatTheme;
  onSelect: MessageRowProps['onSelectOption'];
}) {
  return (
    <View style={styles.options}>
      {widget.title ? (
        <Text style={[styles.optionTitle, { color: theme.muted }]}>{widget.title}</Text>
      ) : null}
      {widget.items.map((item, i) => (
        <Pressable
          key={i}
          style={[styles.option, { borderColor: theme.accent }]}
          onPress={() => onSelect(widget, item)}
        >
          <Text style={{ color: theme.accent, fontWeight: '500' }}>{item.label}</Text>
          {item.description ? (
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
              {item.description}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

function CardsWidgetView({
  widget,
  theme,
  onSelect,
}: {
  widget: CardsWidget;
  theme: ChatTheme;
  onSelect: MessageRowProps['onSelectCard'];
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.cards}
      keyboardShouldPersistTaps="handled"
    >
      {widget.items.map((item, i) => (
        <View key={i} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.background }]}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.cardImage} resizeMode="cover" />
          ) : null}
          <View style={styles.cardBody}>
            <Text style={{ color: theme.agentText, fontWeight: '600' }} numberOfLines={2}>
              {item.title}
            </Text>
            {item.subtitle ? (
              <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={2}>
                {item.subtitle}
              </Text>
            ) : null}
            <View style={styles.cardPriceRow}>
              {item.price ? (
                <Text style={{ color: theme.agentText, fontWeight: '600' }}>{item.price}</Text>
              ) : null}
              {item.compare_at ? (
                <Text style={[styles.compareAt, { color: theme.muted }]}>{item.compare_at}</Text>
              ) : null}
              {item.stock ? (
                <Text style={{ color: theme.muted, fontSize: 11 }}>{item.stock}</Text>
              ) : null}
            </View>
            {item.options ? (
              <Text style={{ color: theme.muted, fontSize: 11 }} numberOfLines={1}>
                {item.options}
              </Text>
            ) : null}
            <View style={styles.cardActions}>
              {item.link ? (
                <Pressable onPress={() => void Linking.openURL(item.link!).catch(() => {})}>
                  <Text style={{ color: theme.accent, fontWeight: '500' }}>
                    {item.link_label ?? 'View'}
                  </Text>
                </Pressable>
              ) : null}
              {item.select_label ? (
                <Pressable
                  style={[styles.selectBtn, { borderColor: theme.accent }]}
                  onPress={() => onSelect(widget, item)}
                >
                  <Text style={{ color: theme.accent, fontWeight: '500' }}>
                    {item.select_button ?? item.select_label}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ))}
      {widget.total != null && widget.total > widget.items.length ? (
        <View style={styles.cardTotal}>
          <Text style={{ color: theme.muted, fontSize: 12 }}>
            {widget.items.length} of {widget.total}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

export function MessageRow({
  message: m,
  theme,
  onRetry,
  onQuickReply,
  onContactSubmit,
  onSelectOption,
  onSelectCard,
}: MessageRowProps) {
  const isUser = m.direction === 'in';
  const widgets = (m.widgets ?? []) as ChatWidget[];
  const bubble = (
    <View
      style={[
        styles.bubble,
        {
          borderRadius: theme.radius,
          backgroundColor: isUser ? theme.userBubble : theme.agentBubble,
        },
        isUser ? styles.bubbleUser : styles.bubbleAgent,
        m.pending ? { opacity: 0.6 } : null,
      ]}
    >
      {m.text ? (
        <MessageText
          text={m.text}
          color={isUser ? theme.userText : theme.agentText}
          linkColor={isUser ? theme.userText : theme.accent}
          theme={theme}
        />
      ) : null}
      {(m.attachments ?? []).map((a, i) => (
        <AttachmentView key={i} a={a} theme={theme} />
      ))}
      {m.failed ? (
        <Pressable onPress={() => m.client_id && onRetry(m.client_id)}>
          <Text style={{ color: theme.danger, fontSize: 12, marginTop: 6, fontWeight: '600' }}>
            Couldn't send — tap to retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAgent]}>
      {m.direction === 'human' && m.author?.name ? (
        <Text style={[styles.author, { color: theme.muted }]}>{m.author.name}</Text>
      ) : null}
      {m.text || (m.attachments?.length ?? 0) > 0 || m.failed ? bubble : null}
      {widgets.map((w, i) => {
        if (w.type === 'options' && Array.isArray(w.items))
          return (
            <OptionsWidgetView
              key={i}
              widget={w as OptionsWidget}
              theme={theme}
              onSelect={onSelectOption}
            />
          );
        if (w.type === 'cards' && Array.isArray(w.items))
          return (
            <CardsWidgetView
              key={i}
              widget={w as CardsWidget}
              theme={theme}
              onSelect={onSelectCard}
            />
          );
        return null;
      })}
      {m.quick_replies?.length ? (
        <QuickReplies
          replies={m.quick_replies}
          theme={theme}
          onPick={onQuickReply}
          onContactSubmit={onContactSubmit}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginVertical: 3, paddingHorizontal: 12 },
  rowUser: { alignItems: 'flex-end' },
  rowAgent: { alignItems: 'flex-start' },
  author: { fontSize: 11, marginBottom: 2, marginLeft: 6 },
  bubble: { maxWidth: '82%', paddingHorizontal: 13, paddingVertical: 9 },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAgent: { borderBottomLeftRadius: 4 },
  image: { width: 200, height: 140, marginTop: 6 },
  file: { marginTop: 6, padding: 10, borderWidth: 1, borderRadius: 10 },
  fileName: { fontWeight: '500' },
  fileSize: { fontSize: 11, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, maxWidth: '82%' },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 6,
    marginTop: 6,
  },
  askRow: { flexDirection: 'row', marginTop: 6, alignItems: 'center' },
  askInput: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 160,
    fontSize: 14,
  },
  askSend: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, marginLeft: 6 },
  options: { marginTop: 6, maxWidth: '82%', alignSelf: 'stretch' },
  optionTitle: { fontSize: 12, marginBottom: 4 },
  option: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 6,
  },
  cards: { marginTop: 6 },
  card: { width: 220, borderWidth: 1, borderRadius: 12, marginRight: 8, overflow: 'hidden' },
  cardImage: { width: '100%', height: 110 },
  cardBody: { padding: 10 },
  cardPriceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  compareAt: { textDecorationLine: 'line-through', fontSize: 12, marginLeft: 6 },
  cardActions: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  selectBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 12 },
  cardTotal: { justifyContent: 'center', paddingHorizontal: 8 },
});
