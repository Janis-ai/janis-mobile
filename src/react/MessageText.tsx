import { useState, type ReactNode } from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { parseBlocks, type Block, type InlineRun } from '../markdown.js';
import type { ChatTheme } from './theme.js';

export interface MessageTextProps {
  text: string;
  /** Base text color (bubble-dependent). */
  color: string;
  /** Link color — accent on agent bubbles, bubble text color on user. */
  linkColor: string;
  theme: ChatTheme;
  fontSize?: number;
}

const open = (href: string) => void Linking.openURL(href).catch(() => {});
const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

function Runs({
  runs,
  color,
  linkColor,
  theme,
}: {
  runs: InlineRun[];
  color: string;
  linkColor: string;
  theme: ChatTheme;
}): ReactNode {
  return runs.map((r, i) => {
    switch (r.type) {
      case 'text':
        return r.text;
      case 'bold':
        return (
          <Text key={i} style={styles.bold}>
            <Runs runs={r.children} color={color} linkColor={linkColor} theme={theme} />
          </Text>
        );
      case 'italic':
        return (
          <Text key={i} style={styles.italic}>
            <Runs runs={r.children} color={color} linkColor={linkColor} theme={theme} />
          </Text>
        );
      case 'strike':
        return (
          <Text key={i} style={styles.strike}>
            <Runs runs={r.children} color={color} linkColor={linkColor} theme={theme} />
          </Text>
        );
      case 'code':
        return (
          <Text key={i} style={[styles.code, { backgroundColor: theme.inputBg, fontFamily: mono }]}>
            <Runs runs={r.children} color={color} linkColor={linkColor} theme={theme} />
          </Text>
        );
      case 'link':
        return (
          <Text
            key={i}
            style={[styles.link, { color: linkColor }]}
            onPress={() => open(r.href)}
            suppressHighlighting={false}
          >
            {r.label}
          </Text>
        );
      case 'image':
        // Images render block-level — nested images in <Text> are
        // iOS-only. The para splitter hoists them out before Runs runs.
        return null;
    }
  });
}

const MAX_IMG_W = 240;
const MAX_IMG_H = 320;

/** Inline image (gif embeds land here) — sizes to the source aspect
 * ratio once it loads; a dead URL falls back to a tappable link, same
 * as the widget's img.onerror swap. */
function RichImage({ src, alt, linkColor, radius }: { src: string; alt: string; linkColor: string; radius: number }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [dead, setDead] = useState(false);
  if (dead) {
    return (
      <Text style={[styles.link, { color: linkColor }]} onPress={() => open(src)}>
        {alt || src}
      </Text>
    );
  }
  const dims = size ?? { w: MAX_IMG_W, h: 140 };
  return (
    <Pressable onPress={() => open(src)} style={styles.imgWrap}>
      <Image
        source={{ uri: src }}
        style={{ width: dims.w, height: dims.h, borderRadius: radius }}
        resizeMode="contain"
        onLoad={(e) => {
          const { width, height } = e.nativeEvent.source;
          if (!width || !height) return;
          const scale = Math.min(MAX_IMG_W / width, MAX_IMG_H / height, 1);
          setSize({ w: Math.round(width * scale), h: Math.round(height * scale) });
        }}
        onError={() => setDead(true)}
      />
    </Pressable>
  );
}

function Para({
  runs,
  color,
  linkColor,
  theme,
  fontSize,
}: {
  runs: InlineRun[];
  color: string;
  linkColor: string;
  theme: ChatTheme;
  fontSize: number;
}) {
  // Split on image runs — images render as block elements between the
  // text segments of the same paragraph.
  const segments: ReactNode[] = [];
  let inline: InlineRun[] = [];
  let key = 0;
  const flush = () => {
    if (inline.length) {
      segments.push(
        <Text key={key++} style={{ color, fontSize, lineHeight: fontSize * 1.4 }}>
          <Runs runs={inline} color={color} linkColor={linkColor} theme={theme} />
        </Text>,
      );
      inline = [];
    }
  };
  for (const r of runs) {
    if (r.type === 'image') {
      flush();
      segments.push(
        <RichImage key={key++} src={r.src} alt={r.alt} linkColor={linkColor} radius={theme.radius - 6} />,
      );
    } else {
      inline.push(r);
    }
  }
  flush();
  return <View>{segments}</View>;
}

export function MessageText({ text, color, linkColor, theme, fontSize = 15 }: MessageTextProps) {
  const blocks = parseBlocks(text);
  return (
    <View>
      {blocks.map((b, i) => {
        if (b.type === 'gap') return <View key={i} style={styles.gap} />;
        if (b.type === 'list') {
          return (
            <View key={i} style={i > 0 ? styles.block : undefined}>
              {b.items.map((item, j) => (
                <View key={j} style={styles.li}>
                  <Text style={{ color, fontSize, lineHeight: fontSize * 1.4 }}>
                    {b.ordered ? `${j + 1}. ` : '• '}
                  </Text>
                  <Text style={[styles.liText, { color, fontSize, lineHeight: fontSize * 1.4 }]}>
                    <Runs runs={item} color={color} linkColor={linkColor} theme={theme} />
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <View key={i} style={i > 0 ? styles.block : undefined}>
            <Para runs={b.children} color={color} linkColor={linkColor} theme={theme} fontSize={fontSize} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  code: { borderRadius: 4, paddingHorizontal: 3 },
  link: { textDecorationLine: 'underline' },
  gap: { height: 8 },
  block: { marginTop: 4 },
  li: { flexDirection: 'row', marginTop: 2 },
  liText: { flex: 1 },
  imgWrap: { marginTop: 6 },
});
