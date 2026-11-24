/**
 * Minimal `react-native` declarations — just the API surface the UI
 * components use. The monorepo has no react-native install (it isn't an RN
 * app); apps that consume this package have the real, far richer types and
 * never read this file (Metro strips types; d.ts isn't shipped for
 * typecheck downstream).
 */
declare module 'react-native' {
  import type { ComponentType, ReactNode } from 'react';

  export type ColorValue = string;
  type StyleFalsy = null | undefined | false;
  export type RecursiveArray<T> = (T | RecursiveArray<T>)[];
  export type StyleProp<T> = T | RecursiveArray<T | StyleFalsy> | StyleFalsy;
  export interface ViewStyle {
    [key: string]: unknown;
  }
  export interface TextStyle {
    [key: string]: unknown;
  }
  export interface ImageStyle {
    [key: string]: unknown;
  }
  export type ListRenderItem<T> = (info: { item: T; index: number }) => ReactNode;

  export const Platform: { OS: 'ios' | 'android' | string; select<T>(s: Record<string, T>): T };
  export const Linking: { openURL(url: string): Promise<unknown> };
  export const Keyboard: { dismiss(): void };

  export const StyleSheet: {
    create<T extends Record<string, ViewStyle | TextStyle | ImageStyle>>(styles: T): T;
    flatten(style: StyleProp<ViewStyle>): ViewStyle | undefined;
    hairlineWidth: number;
  };

  export const View: ComponentType<{
    style?: StyleProp<ViewStyle>;
    children?: ReactNode;
    testID?: string;
    [key: string]: unknown;
  }>;
  export const Text: ComponentType<{
    style?: StyleProp<TextStyle>;
    children?: ReactNode;
    numberOfLines?: number;
    testID?: string;
    [key: string]: unknown;
  }>;
  export const Image: ComponentType<{
    source: { uri: string };
    style?: StyleProp<ImageStyle>;
    resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
    testID?: string;
    [key: string]: unknown;
  }>;
  export const Pressable: ComponentType<{
    style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
    onPress?: () => void;
    disabled?: boolean;
    children?: ReactNode;
    testID?: string;
    [key: string]: unknown;
  }>;
  export const TextInput: ComponentType<{
    style?: StyleProp<TextStyle>;
    value?: string;
    onChangeText?: (text: string) => void;
    onSubmitEditing?: () => void;
    placeholder?: string;
    placeholderTextColor?: ColorValue;
    multiline?: boolean;
    keyboardType?: 'default' | 'email-address' | 'phone-pad';
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
    returnKeyType?: string;
    editable?: boolean;
    testID?: string;
    [key: string]: unknown;
  }>;
  export const ActivityIndicator: ComponentType<{
    size?: 'small' | 'large';
    color?: ColorValue;
    style?: StyleProp<ViewStyle>;
    [key: string]: unknown;
  }>;
  export const ScrollView: ComponentType<{
    style?: StyleProp<ViewStyle>;
    contentContainerStyle?: StyleProp<ViewStyle>;
    horizontal?: boolean;
    showsHorizontalScrollIndicator?: boolean;
    keyboardShouldPersistTaps?: string;
    children?: ReactNode;
    [key: string]: unknown;
  }>;
  export interface FlatListProps<T> {
    data: readonly T[];
    renderItem: ListRenderItem<T>;
    keyExtractor: (item: T, index: number) => string;
    inverted?: boolean;
    style?: StyleProp<ViewStyle>;
    contentContainerStyle?: StyleProp<ViewStyle>;
    ListHeaderComponent?: ComponentType | ReactNode;
    ListFooterComponent?: ComponentType | ReactNode;
    ListEmptyComponent?: ComponentType | ReactNode;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    keyboardShouldPersistTaps?: string;
    [key: string]: unknown;
  }
  export const FlatList: <T>(props: FlatListProps<T>) => ReactNode;
  export const KeyboardAvoidingView: ComponentType<{
    behavior?: 'height' | 'position' | 'padding';
    keyboardVerticalOffset?: number;
    style?: StyleProp<ViewStyle>;
    children?: ReactNode;
    [key: string]: unknown;
  }>;

  export namespace Animated {
    class Value {
      constructor(value: number);
      setValue(value: number): void;
    }
    function timing(value: Value, config: { toValue: number; duration?: number; useNativeDriver?: boolean }): { start(cb?: (r: { finished: boolean }) => void): void };
    function loop(animation: { start(cb?: (r: { finished: boolean }) => void): void }): { start(): void; stop(): void };
    function sequence(animations: { start(cb?: (r: { finished: boolean }) => void): void }[]): { start(cb?: (r: { finished: boolean }) => void): void };
    function stagger(time: number, animations: { start(cb?: (r: { finished: boolean }) => void): void }[]): { start(cb?: (r: { finished: boolean }) => void): void };
    const View: ComponentType<{
      style?: StyleProp<ViewStyle> | { opacity?: Value; [key: string]: unknown };
      children?: ReactNode;
      [key: string]: unknown;
    }>;
  }
}
