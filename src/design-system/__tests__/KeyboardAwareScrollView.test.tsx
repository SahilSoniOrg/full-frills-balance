import React, { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard, ScrollView, TextInput } from 'react-native';
import { Spacing } from '@/src/constants/design-tokens';
import { KeyboardAwareScrollView } from '../KeyboardAwareScrollView';

describe('KeyboardAwareScrollView', () => {
  let inputY: number;
  let viewportHeight: number;
  let visible: boolean;
  let shown: () => void;
  let input: TextInput;
  let scrollTo: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    inputY = 460;
    viewportHeight = 300;
    visible = true;
    input = {
      measureInWindow: (callback: (x: number, y: number, w: number, h: number) => void) =>
        callback(0, inputY, 200, 40),
    } as TextInput;
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockImplementation(() => input);
    jest.spyOn(Keyboard, 'isVisible').mockImplementation(() => visible);
    jest
      .spyOn(Keyboard, 'metrics')
      .mockReturnValue({ screenX: 0, screenY: 450, width: 400, height: 350 });
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
      if (event === 'keyboardDidShow') shown = () => listener({} as never);
      return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function renderScroll(props: Partial<React.ComponentProps<typeof KeyboardAwareScrollView>> = {}) {
    const ref = createRef<ScrollView>();
    render(
      <KeyboardAwareScrollView ref={ref} testID="scroll" {...props}>
        <TextInput testID="field" />
      </KeyboardAwareScrollView>,
    );
    expect(ref.current).toBeTruthy();
    jest.spyOn(ref.current!, 'getNativeScrollRef').mockReturnValue({
      measureInWindow: (callback: (x: number, y: number, w: number, h: number) => void) =>
        callback(0, 100, 400, viewportHeight),
    } as ReturnType<typeof TextInput.State.currentlyFocusedInput>);
    scrollTo = jest.spyOn(ref.current!, 'scrollTo').mockImplementation(() => {});
    return ref;
  }

  function flush() {
    act(() => {
      jest.runOnlyPendingTimers();
    });
  }
  function focus() {
    fireEvent(screen.getByTestId('field'), 'focus');
  }

  it.each([false, true])(
    'reveals a lower field above the fixed footer (native scroll view: %s)',
    useNativeScrollView => {
      visible = false;
      renderScroll({ useNativeScrollView });
      focus();
      flush();
      expect(scrollTo).not.toHaveBeenCalled();
      visible = true;
      act(() => shown());
      flush();
      expect(scrollTo).toHaveBeenLastCalledWith({ y: 100 + Spacing.md, animated: true });
    },
  );

  it('tracks existing scrolling and preserves caller callbacks', () => {
    const onFocus = jest.fn();
    const onScroll = jest.fn();
    renderScroll({ onFocus, onScroll });
    fireEvent.scroll(screen.getByTestId('scroll'), { nativeEvent: { contentOffset: { y: 600 } } });
    focus();
    flush();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 700 + Spacing.md, animated: true });
    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('remeasures after the viewport shrinks', () => {
    inputY = 350;
    viewportHeight = 600;
    const onLayout = jest.fn();
    renderScroll({ onLayout });
    focus();
    flush();
    expect(scrollTo).not.toHaveBeenCalled();
    viewportHeight = 250;
    fireEvent(screen.getByTestId('scroll'), 'layout');
    flush();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 40 + Spacing.md, animated: true });
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it('keeps visible fields in place and reveals them if growing content moves them below the viewport', () => {
    inputY = 200;
    const onContentSizeChange = jest.fn();
    renderScroll({ onContentSizeChange });
    focus();
    flush();
    expect(scrollTo).not.toHaveBeenCalled();
    inputY = 460;
    fireEvent(screen.getByTestId('scroll'), 'contentSizeChange', 400, 1200);
    flush();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 100 + Spacing.md, animated: true });
    expect(onContentSizeChange).toHaveBeenCalledWith(400, 1200);
  });

  it('ignores keyboard events after focus leaves for another form or modal', () => {
    renderScroll();
    focus();
    fireEvent(screen.getByTestId('field'), 'blur');
    act(() => shown());
    flush();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does not scroll when keyboard awareness is disabled', () => {
    renderScroll({ keyboardAware: false });
    focus();
    flush();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(Keyboard.addListener).not.toHaveBeenCalled();
  });
});
