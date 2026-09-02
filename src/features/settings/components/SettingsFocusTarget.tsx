import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useEffect,
  type ReactNode,
  type RefObject,
} from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import type { ScrollView } from 'react-native-gesture-handler';
import { useTheme } from '@/src/hooks/use-theme';

type SettingsFocusContextValue = {
  registerTarget: (targetId: string, targetNode: View) => void;
  isHighlighted: (targetId: string) => boolean;
};

type MeasurableScrollView = {
  measureInWindow: (
    onSuccess: (x: number, y: number, width: number, height: number) => void,
    onFailure?: () => void,
  ) => void;
  scrollTo: (options: { y: number; animated: boolean }) => void;
};

const SettingsFocusContext = createContext<SettingsFocusContextValue | null>(null);

export function SettingsFocusProvider({
  targetId,
  scrollViewRef,
  scrollOffsetRef,
  children,
}: {
  targetId?: string;
  scrollViewRef: RefObject<ScrollView | null>;
  scrollOffsetRef: RefObject<number>;
  children: ReactNode;
}) {
  const hasFocused = useRef(false);
  const isFocusing = useRef(false);
  const [highlightedTargetId, setHighlightedTargetId] = useState<string>();
  const registerTarget = useCallback(
    (registeredTargetId: string, targetNode: View) => {
      if (
        !targetId ||
        hasFocused.current ||
        isFocusing.current ||
        registeredTargetId !== targetId
      ) {
        return;
      }
      isFocusing.current = true;

      const attemptScroll = (attempt: number) => {
        const scrollViewNode = scrollViewRef.current as unknown as MeasurableScrollView | null;
        if (!scrollViewNode) {
          if (attempt < 3) requestAnimationFrame(() => attemptScroll(attempt + 1));
          else isFocusing.current = false;
          return;
        }

        targetNode.measureInWindow((_targetX, targetY) => {
          scrollViewNode.measureInWindow(
            (_scrollX, scrollY) => {
              const contentY = targetY - scrollY + scrollOffsetRef.current;
              scrollViewNode.scrollTo({ y: Math.max(0, contentY - 16), animated: true });
              hasFocused.current = true;
              isFocusing.current = false;
              setHighlightedTargetId(targetId);
            },
            () => {
              if (attempt < 3) requestAnimationFrame(() => attemptScroll(attempt + 1));
              else isFocusing.current = false;
            },
          );
        });
      };

      requestAnimationFrame(() => attemptScroll(0));
    },
    [scrollOffsetRef, scrollViewRef, targetId],
  );

  useEffect(() => {
    hasFocused.current = false;
    isFocusing.current = false;
  }, [targetId]);

  return (
    <SettingsFocusContext.Provider
      value={{
        registerTarget,
        isHighlighted: registeredTargetId =>
          registeredTargetId === highlightedTargetId && registeredTargetId === targetId,
      }}
    >
      {children}
    </SettingsFocusContext.Provider>
  );
}

export function SettingsFocusTarget({
  targetId,
  children,
}: {
  targetId: string;
  children: ReactNode;
}) {
  const context = useContext(SettingsFocusContext);
  const targetRef = useRef<View>(null);
  const [highlightOpacity] = useState(() => new Animated.Value(0));
  const { theme } = useTheme();
  const isHighlighted = context?.isHighlighted(targetId) ?? false;

  useEffect(() => {
    if (!isHighlighted) return;
    highlightOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(highlightOpacity, { toValue: 1, duration: 160, useNativeDriver: false }),
      Animated.timing(highlightOpacity, { toValue: 0, duration: 160, useNativeDriver: false }),
      Animated.timing(highlightOpacity, { toValue: 1, duration: 160, useNativeDriver: false }),
      Animated.timing(highlightOpacity, { toValue: 0, duration: 420, useNativeDriver: false }),
    ]).start();
  }, [highlightOpacity, isHighlighted]);
  const onLayout = useCallback(() => {
    if (targetRef.current) {
      context?.registerTarget(targetId, targetRef.current);
    }
  }, [context, targetId]);

  const borderColor = highlightOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', theme.primary],
  });

  return (
    <View ref={targetRef} onLayout={onLayout} style={styles.target}>
      {children}
      <Animated.View pointerEvents="none" style={[styles.highlight, { borderColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  target: {
    position: 'relative',
    overflow: 'visible',
  },
  highlight: {
    position: 'absolute',
    top: -2,
    right: -2,
    bottom: -2,
    left: -2,
    borderWidth: 2,
    borderRadius: 14,
  },
});
