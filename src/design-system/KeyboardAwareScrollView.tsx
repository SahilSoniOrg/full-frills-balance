import { Spacing } from '@/src/constants/design-tokens';
import { forwardRef, useCallback, useEffect, useRef } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView as NativeScrollView,
  TextInput,
  type ScrollViewProps,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

type Props = ScrollViewProps & { keyboardAware?: boolean; useNativeScrollView?: boolean };

/** Scroll within the resized viewport, including space reserved for fixed form footers. */
export const KeyboardAwareScrollView = forwardRef<NativeScrollView, Props>(
  function KeyboardAwareScrollView(
    {
      keyboardAware = true,
      useNativeScrollView = false,
      onFocus,
      onBlur,
      onLayout,
      onScroll,
      onContentSizeChange,
      ...props
    },
    forwardedRef,
  ) {
    const scrollRef = useRef<NativeScrollView | null>(null);
    const focusedInputRef = useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput> | null>(
      null,
    );
    const offsetRef = useRef(0);
    const frameRef = useRef<number | null>(null);

    const revealInput = useCallback(() => {
      if (!keyboardAware || Platform.OS === 'web') return;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const input = focusedInputRef.current;
        const scroll = scrollRef.current;
        if (!input || !scroll || !Keyboard.isVisible()) return;
        scroll.getNativeScrollRef()?.measureInWindow((_x, top, _width, height) => {
          input.measureInWindow((_inputX, inputY, _inputWidth, inputHeight) => {
            if (
              focusedInputRef.current !== input ||
              TextInput.State.currentlyFocusedInput?.() !== input
            )
              return;
            const bottom = Math.min(top + height, Keyboard.metrics()?.screenY ?? Infinity);
            const availableHeight = bottom - top - Spacing.md * 2;
            if (availableHeight <= 0) return;
            const overflow = inputY + Math.min(inputHeight, availableHeight) + Spacing.md - bottom;
            const adjustment = overflow > 0 ? overflow : Math.min(0, inputY - Spacing.md - top);
            if (adjustment !== 0)
              scroll.scrollTo({ y: Math.max(0, offsetRef.current + adjustment), animated: true });
          });
        });
      });
    }, [keyboardAware]);

    useEffect(() => {
      if (!keyboardAware || Platform.OS === 'web') return;
      const shown = Keyboard.addListener('keyboardDidShow', revealInput);
      const changed = Keyboard.addListener('keyboardDidChangeFrame', revealInput);
      return () => {
        shown?.remove();
        changed?.remove();
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      };
    }, [keyboardAware, revealInput]);

    const Scroller = useNativeScrollView ? NativeScrollView : ScrollView;

    return (
      <Scroller
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        scrollsChildToFocus={!keyboardAware}
        {...props}
        ref={scroll => {
          scrollRef.current = scroll;
          if (typeof forwardedRef === 'function') forwardedRef(scroll);
          else if (forwardedRef) forwardedRef.current = scroll;
        }}
        onFocus={event => {
          focusedInputRef.current = TextInput.State.currentlyFocusedInput?.() ?? null;
          revealInput();
          onFocus?.(event);
        }}
        onBlur={event => {
          focusedInputRef.current = null;
          onBlur?.(event);
        }}
        onLayout={event => {
          revealInput();
          onLayout?.(event);
        }}
        onScroll={event => {
          offsetRef.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
        onContentSizeChange={(width, height) => {
          revealInput();
          onContentSizeChange?.(width, height);
        }}
      />
    );
  },
);
