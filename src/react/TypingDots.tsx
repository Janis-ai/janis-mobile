import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { ChatTheme } from './theme.js';

/** Three-dot "typing" indicator — staggered pulse loops. */
export function TypingDots({ theme }: { theme: ChatTheme }) {
  const dots = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  useEffect(() => {
    const loops = dots.map((v, i) => {
      let anim: { start(): void; stop(): void } | undefined;
      const t = setTimeout(() => {
        anim = Animated.loop(
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration: 350, useNativeDriver: true }),
            Animated.timing(v, { toValue: 0.3, duration: 350, useNativeDriver: true }),
          ]),
        );
        anim.start();
      }, i * 180);
      return () => {
        clearTimeout(t);
        anim?.stop();
      };
    });
    return () => loops.forEach((stop) => stop());
  }, [dots]);

  return (
    <View style={styles.row}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { backgroundColor: theme.muted, opacity: v }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, marginHorizontal: 2 },
});
