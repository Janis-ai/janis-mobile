import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { isTabletDevice, resolveDefaultOpen, resolvePresentation, type BubblePresentation } from '../bubbleDefaults.js';
import { absoluteUrl, JanisChat } from '../client.js';
import type { JanisChatOptions } from '../client.js';
import { ChatStore, countUnread, type ChatStoreOptions } from '../store.js';
import { ChatView, type ChatViewProps } from './ChatView.js';
import { defaultTheme, type ChatScheme } from './theme.js';
import { useJanisChat } from './useJanisChat.js';

export interface ChatBubbleHandle {
  open(): void;
  minimize(): void;
  toggle(): void;
  isOpen(): boolean;
}

export interface ChatBubbleProps extends Omit<ChatViewProps, 'style'> {
  /** Controlled open state — pair with onOpenChange. */
  open?: boolean;
  /** Initial open state when uncontrolled. 'auto' (default) opens
   * maximized on phones and stays collapsed to the launcher on tablets,
   * where the channel's open_default applies (once — honoring it forever
   * would fight the visitor's minimize). A boolean pins it everywhere. */
  defaultOpen?: boolean | 'auto';
  onOpenChange?(open: boolean): void;
  /** Corner — default: the channel's configured position. */
  position?: 'left' | 'right';
  /** 'auto' (default) maximizes to a sheet on phones and follows the
   * channel's display setting on tablets. 'bubble' = card anchored over
   * the launcher; 'modal' = bottom sheet on a dimmed backdrop. */
  presentation?: BubblePresentation;
  /** The floating launcher icon. Set false when the host app has its own
   * chat trigger — drive open state via the ref or `open` prop (and it
   * starts open by default, since there's no other way in). Default true. */
  showLauncher?: boolean;
  /** Custom launcher content — replaces the config-resolved icon. */
  launcherIcon?: ReactNode;
  /** Custom minimize-button content — defaults to the ⌄ chevron. */
  minimizeIcon?: ReactNode;
  /** Bottom offset — clear a tab bar or home indicator. Default 24. */
  offset?: number;
  /** Horizontal edge margin for the launcher and anchored window.
   * Default 20. */
  edgeOffset?: number;
  /** Launcher diameter. Default 56. */
  size?: number;
  /** Unread count badge on the launcher. Default true. */
  showUnreadBadge?: boolean;
  /** Proactive teaser for brand-new visitors (config.proactive gates it
   * regardless). Default true. */
  showTeaser?: boolean;
  launcherStyle?: StyleProp<ViewStyle>;
  windowStyle?: StyleProp<ViewStyle>;
  /** Extra content at the right edge of the open window's header. */
  headerRight?: ReactNode;
  /** 'bubble' window height. Default '75%'. */
  windowHeight?: number | `${number}%`;
}

/** The default launcher glyph — a speech bubble with dots, vector-drawn
 * (matches the web widget's 💬 affordance without an emoji font). */
function ChatGlyph({ accent, color }: { accent: string; color: string }) {
  return (
    <View style={glyph.wrap}>
      <View style={[glyph.body, { backgroundColor: color }]}>
        <View style={glyph.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[glyph.dot, { backgroundColor: accent }]} />
          ))}
        </View>
      </View>
      <View style={[glyph.tail, { backgroundColor: color }]} />
    </View>
  );
}

const glyph = StyleSheet.create({
  wrap: { width: 26, height: 22 },
  body: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  dots: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, marginHorizontal: 1.5 },
  tail: {
    position: 'absolute',
    left: 5,
    bottom: -2,
    width: 9,
    height: 9,
    borderBottomLeftRadius: 3,
    transform: [{ rotate: '45deg' }],
  },
});

/** A rotated square's bottom-right corner reads as a clean ⌄ — one
 * crisp stroke with a rounded tip, instead of two bars that look
 * clipped where they almost meet. */
function ChevronDown({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <View style={chev.wrap}>
      <View
        style={{
          width: size * 0.6,
          height: size * 0.6,
          borderRightWidth: 2.2,
          borderBottomWidth: 2.2,
          borderColor: color,
          borderBottomRightRadius: 2,
          transform: [{ rotate: '45deg' }, { translateY: -size * 0.14 }],
        }}
      />
    </View>
  );
}

const chev = StyleSheet.create({
  wrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
});

/**
 * Intercom-style floating launcher + chat window, styled by the channel's
 * console config (accent, logo, launcher, position, display, theme,
 * open_default, proactive teaser, help link, hide_powered_by). Drop it as
 * the last child of a root-level flex container — it overlays absolutely.
 *
 *   <ChatBubble ref={ref} chat={chat} />
 *   ref.current.minimize();
 */
export const ChatBubble = forwardRef<ChatBubbleHandle, ChatBubbleProps>(function ChatBubble(
  props,
  ref,
) {
  const {
    chat: source,
    storeOptions,
    open: controlledOpen,
    defaultOpen,
    onOpenChange,
    position: positionProp,
    presentation: presentationProp,
    launcherIcon,
    minimizeIcon,
    offset = 24,
    edgeOffset = 20,
    size = 56,
    showLauncher = true,
    showUnreadBadge = true,
    showTeaser = true,
    launcherStyle,
    windowStyle,
    headerRight,
    windowHeight = '75%',
    ...chatViewProps
  } = props;

  const j = useJanisChat(source, storeOptions);
  const cfg = j.config;
  const baseUrl = j.chat.baseUrl;

  const os = useColorScheme();
  const cfgScheme = (props.scheme ?? cfg?.theme) as ChatScheme | undefined;
  const scheme = cfgScheme === 'auto' ? (os === 'dark' ? 'dark' : 'light') : (cfgScheme ?? 'light');
  const theme = defaultTheme(props.accent ?? (cfg?.accent as string | null), props.theme, scheme);

  const position = positionProp ?? cfg?.position ?? 'right';
  const { width: winW, height: winH } = useWindowDimensions();
  const isTablet = isTabletDevice(
    Platform.OS === 'ios' && Platform.isPad === true,
    Math.min(winW, winH),
  );
  const presentation = resolvePresentation(presentationProp, isTablet, cfg?.display);

  const [internalOpen, setInternalOpen] = useState(() =>
    resolveDefaultOpen(defaultOpen, showLauncher, isTablet),
  );
  const isOpen = controlledOpen ?? internalOpen;
  const openedOnce = useRef(isOpen);
  const autoOpened = useRef(false);
  const setOpen = (v: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(v);
    if (v) openedOnce.current = true;
    onOpenChange?.(v);
  };

  // The channel's open_default fires once, after config lands — not on
  // every render, or the visitor could never keep it minimized.
  useEffect(() => {
    if (
      controlledOpen === undefined &&
      (defaultOpen === undefined || defaultOpen === 'auto') &&
      cfg?.open_default === true &&
      !autoOpened.current
    ) {
      autoOpened.current = true;
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.open_default]);

  useImperativeHandle(
    ref,
    () => ({
      open: () => setOpen(true),
      minimize: () => setOpen(false),
      toggle: () => setOpen(!isOpen),
      isOpen: () => isOpen,
    }),
    [isOpen, controlledOpen],
  );

  // Open/close animation — the window stays mounted through the close
  // tween. Sheets slide up from below, the anchored card lifts + fades.
  // Starting open (auto default) paints immediately — no entry motion.
  const [mounted, setMounted] = useState(isOpen);
  const anim = useRef(new Animated.Value(isOpen ? 1 : 0)).current;
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 26,
        stiffness: 260,
        mass: 0.9,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }).start(({ finished }) => {
        // A reopen mid-close stops this tween — only unmount on completion.
        if (finished) setMounted(false);
      });
    }
  }, [isOpen, anim]);

  // Unread tracking — while open, the newest confirmed message is "seen";
  // while closed, later agent-side messages count toward the badge.
  const [seenAt, setSeenAt] = useState<string | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const newest = [...j.messages].reverse().find((m) => !m.pending && !m.failed);
    if (newest && (seenAt == null || newest.created_at > seenAt)) {
      setSeenAt(newest.created_at);
    }
  }, [isOpen, j.messages, seenAt]);
  const unread = isOpen ? 0 : countUnread(j.messages, seenAt);

  // Proactive teaser — brand-new threads only, after the configured delay.
  const [teaserDue, setTeaserDue] = useState(false);
  const [teaserDismissed, setTeaserDismissed] = useState(false);
  const delay = Math.max(0, cfg?.proactive_delay ?? 20);
  useEffect(() => {
    const t = setTimeout(() => setTeaserDue(true), delay * 1000);
    return () => clearTimeout(t);
  }, [delay]);
  const teaser =
    showTeaser &&
    teaserDue &&
    !teaserDismissed &&
    !isOpen &&
    !openedOnce.current &&
    j.messages.length === 0 &&
    cfg?.proactive !== false &&
    !!cfg?.teaser_text;

  // Launcher icon — config.launcher: 'glyph'/'' → vector glyph, 'logo' →
  // the header logo, else a custom image URL (widget.js's rules).
  const logoSrc = absoluteUrl(baseUrl, cfg?.logo_url);
  const launcherSrc =
    cfg?.launcher === 'logo' ? logoSrc : absoluteUrl(baseUrl, cfg?.launcher || null);
  const useGlyph = !launcherSrc || cfg?.launcher === 'glyph' || cfg?.launcher === '';
  const title = cfg?.title || cfg?.agent_name || 'Support';
  const stateLine =
    j.state === 'human'
      ? 'Talking to a human'
      : j.state === 'needs_human'
        ? 'Waiting for a human'
        : j.state === 'archived'
          ? 'Chat ended'
          : cfg?.subtitle || 'AI answers, humans when needed';
  const helpUrl = cfg?.help_url && cfg?.show_help_link !== false ? cfg.help_url : null;

  // Branding gates first paint — render nothing until the channel config
  // lands so the launcher never flashes default colors/icon. The store
  // keeps polling (and retrying the config fetch) while we're hidden.
  if (!cfg) return null;

  const header = (
    <View
      style={[
        styles.header,
        { borderBottomColor: theme.border, backgroundColor: theme.composerBg },
      ]}
    >
      {logoSrc ? (
        <View
          style={[
            styles.logoTile,
            {
              borderRadius: cfg?.logo_radius ?? 8,
              borderWidth: cfg?.logo_border_width ?? 0,
              borderColor: cfg?.logo_border_color ?? 'rgba(0,0,0,.2)',
              backgroundColor: (cfg?.logo_padding ?? 2) > 0 ? 'transparent' : '#fff',
              padding: cfg?.logo_padding ?? 2,
            },
          ]}
        >
          <Image source={{ uri: logoSrc }} style={styles.logoImg} resizeMode="contain" />
        </View>
      ) : null}
      <View style={styles.headerText}>
        <Text style={[styles.headerTitle, { color: theme.agentText }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.headerSub, { color: theme.muted }]} numberOfLines={1}>
          {stateLine}
        </Text>
      </View>
      {helpUrl ? (
        <Pressable
          style={styles.headerBtn}
          onPress={() => void Linking.openURL(helpUrl).catch(() => {})}
          testID="janis-help"
        >
          <Text style={{ color: theme.muted, fontSize: 17 }}>?</Text>
        </Pressable>
      ) : null}
      {headerRight}
      <Pressable
        style={styles.headerBtn}
        onPress={() => setOpen(false)}
        testID="janis-minimize"
      >
        {minimizeIcon ?? <ChevronDown color={theme.muted} />}
      </Pressable>
    </View>
  );

  const side = position === 'left' ? 'left' : 'right';
  const sideProp = { [side]: edgeOffset } as ViewStyle;
  const launcher = (
    <View style={[styles.launcherWrap, { bottom: offset }, sideProp]} pointerEvents="box-none">
      {teaser ? (
        <View
          style={[
            styles.teaser,
            { backgroundColor: theme.composerBg, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.teaserText, { color: theme.agentText }]}>
            {cfg?.teaser_text}
          </Text>
          <Pressable onPress={() => setTeaserDismissed(true)} style={styles.teaserX}>
            <Text style={{ color: theme.muted, fontSize: 16, lineHeight: 18 }}>×</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        onPress={() => setOpen(!isOpen)}
        style={[
          styles.launcher,
          { backgroundColor: theme.accent, width: size, height: size, borderRadius: size / 2 },
          launcherStyle,
        ]}
        testID="janis-launcher"
      >
        {launcherIcon !== undefined ? (
          launcherIcon
        ) : useGlyph ? (
          <ChatGlyph accent={theme.accent} color={theme.accentText} />
        ) : (
          <Image source={{ uri: launcherSrc! }} style={styles.launcherImg} resizeMode="cover" />
        )}
        {showUnreadBadge && unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );

  const window = mounted ? (
    presentation === 'modal' ? (
      <>
        <Animated.View style={[styles.backdrop, { opacity: anim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: theme.background, borderColor: theme.border },
            {
              transform: [
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [winH, 0] }) },
              ],
            },
            windowStyle,
          ]}
        >
          {header}
          <ChatView {...chatViewProps} chat={j.store} theme={props.theme} accent={props.accent} scheme={scheme} />
        </Animated.View>
      </>
    ) : (
      <Animated.View
        style={[
          styles.window,
          {
            bottom: offset + (showLauncher ? size + 10 : 0),
            height: windowHeight,
            backgroundColor: theme.background,
            borderColor: theme.border,
            opacity: anim,
            transform: [
              { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) },
              { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
            ],
          },
          side === 'left' ? { left: edgeOffset } : { right: edgeOffset },
          windowStyle,
        ]}
      >
        {header}
        <ChatView {...chatViewProps} chat={j.store} theme={props.theme} accent={props.accent} scheme={scheme} />
      </Animated.View>
    )
  ) : null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {window}
      {showLauncher && (presentation === 'bubble' || !isOpen) ? launcher : null}
    </View>
  );
});

const styles = StyleSheet.create({
  launcherWrap: {
    position: 'absolute',
    alignItems: 'flex-end',
    maxWidth: '80%',
  },
  launcher: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  launcherImg: { width: '88%', height: '88%', borderRadius: 999 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  teaser: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 10,
    marginBottom: 10,
    maxWidth: 280,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  teaserText: { flex: 1, fontSize: 14, lineHeight: 19 },
  teaserX: { padding: 8 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    top: '7%',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    // The overlay ignores the host's safe-area padding — keep the
    // composer + powered-by clear of the home-gesture zone.
    paddingBottom: 28,
  },
  window: {
    position: 'absolute',
    width: '88%',
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logoTile: {
    width: 32,
    height: 32,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%' },
  headerText: { flex: 1, marginRight: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSub: { fontSize: 11, marginTop: 1 },
  headerBtn: { padding: 8 },
});
