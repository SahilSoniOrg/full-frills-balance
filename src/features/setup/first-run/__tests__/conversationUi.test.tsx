import { CollectStep, ConversationStep } from '../conversationUi';
import { Spacing } from '@/src/constants/design-tokens';
import { act, fireEvent, render, screen } from '@/src/utils/test-utils';
import { Keyboard, ScrollView, StyleSheet, TextInput } from 'react-native';
import { usePageKeyboard } from '@/src/design-system';

jest.mock('@/src/components/core', () => {
  const { Text: NativeText, TouchableOpacity } = jest.requireActual(
    'react-native',
  ) as typeof import('react-native');
  const passthroughText = ({ children, ...props }: { children?: React.ReactNode }) => (
    <NativeText {...props}>{children}</NativeText>
  );
  return {
    AppButton: ({ children, ...props }: { children?: React.ReactNode }) => (
      <TouchableOpacity {...props}>{children}</TouchableOpacity>
    ),
    AppCard: passthroughText,
    AppIcon: passthroughText,
    AppText: passthroughText,
    FilterChipButton: passthroughText,
    SwipeToRemove: passthroughText,
  };
});

jest.mock('@/src/components/filters/DateTimePickerModal', () => ({
  DateTimePickerModal: () => null,
}));

jest.mock('@/src/components/filters/SelectionPickerSheet', () => ({
  SelectionPickerSheet: () => null,
}));

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { cubic: {}, out: () => ({}) },
    LinearTransition: { duration: () => ({ easing: () => ({}) }) },
  };
});

jest.mock('@/src/design-system', () => {
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const passthrough = ({ children, ...props }: { children?: React.ReactNode }) => (
    <View {...props}>{children}</View>
  );
  return {
    Box: passthrough,
    FadeIn: passthrough,
    Inline: passthrough,
    Stack: passthrough,
    usePageKeyboard: jest.fn(),
  };
});

const mockedUsePageKeyboard = jest.mocked(usePageKeyboard);

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: { text: '#000', textSecondary: '#666', border: '#ddd', background: '#fff' },
    tokens: { input: { placeholder: '#999' } },
    fonts: { regular: 'System', medium: 'System', semibold: 'System', bold: 'System' },
  }),
}));

describe('ConversationStep keyboard behavior', () => {
  beforeEach(() => {
    jest.spyOn(Keyboard, 'addListener').mockReturnValue({ remove: jest.fn() } as never);
    mockedUsePageKeyboard.mockReturnValue({ isKeyboardVisible: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('configures its scroll view to reveal focused inputs', () => {
    render(
      <ConversationStep onBack={jest.fn()}>
        <TextInput testID="collector-input" />
      </ConversationStep>,
    );

    const scrollView = screen.UNSAFE_getByType(ScrollView);
    expect(scrollView.props.scrollsChildToFocus).toBe(false);
    expect(scrollView.props.onFocus).toEqual(expect.any(Function));
  });

  it('re-reveals the focused input when the keyboard opens, but not after it blurs', () => {
    jest.useFakeTimers();
    let showKeyboard: (() => void) | undefined;
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
      if (event === 'keyboardDidShow') showKeyboard = () => listener({} as never);
      return { remove: jest.fn() } as never;
    });
    const keyboardVisible = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
    jest.spyOn(Keyboard, 'metrics').mockReturnValue({
      screenX: 0,
      screenY: 450,
      width: 400,
      height: 350,
    });
    const focusedInput = {
      measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) =>
        callback(0, 460, 200, 40),
    } as ReturnType<typeof TextInput.State.currentlyFocusedInput>;
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(focusedInput);
    const step = () => (
      <ConversationStep onBack={jest.fn()}>
        <TextInput testID="collector-input" />
      </ConversationStep>
    );
    const { rerender } = render(step());
    const scroll = screen.UNSAFE_getByType(ScrollView).instance as ScrollView;
    jest.spyOn(scroll, 'getNativeScrollRef').mockReturnValue({
      measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) =>
        callback(0, 100, 400, 300),
    } as ReturnType<typeof TextInput.State.currentlyFocusedInput>);
    const scrollTo = jest.spyOn(scroll, 'scrollTo').mockImplementation(() => {});

    fireEvent(screen.getByTestId('collector-input'), 'focus');
    act(() => jest.runOnlyPendingTimers());
    expect(scrollTo).not.toHaveBeenCalled();

    keyboardVisible.mockReturnValue(true);
    mockedUsePageKeyboard.mockReturnValue({ isKeyboardVisible: true });
    rerender(step());
    expect(showKeyboard).toEqual(expect.any(Function));
    act(() => showKeyboard?.());
    act(() => jest.runOnlyPendingTimers());
    expect(scrollTo).toHaveBeenCalledWith({ y: 100 + Spacing.md, animated: true });

    fireEvent(screen.getByTestId('collector-input'), 'blur');
    act(() => showKeyboard?.());
    act(() => jest.runOnlyPendingTimers());
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('removes the footer from the layout while the keyboard is visible', () => {
    mockedUsePageKeyboard.mockReturnValue({ isKeyboardVisible: true });

    render(
      <ConversationStep primaryLabel="Continue" onPrimary={jest.fn()} onBack={jest.fn()}>
        <TextInput testID="collector-input" />
      </ConversationStep>,
    );

    expect(screen.queryByTestId('onboarding-continue-button')).toBeNull();
    const scrollView = screen.UNSAFE_getByType(ScrollView);
    expect(scrollView.props.contentContainerStyle[1].paddingBottom).toBe(Spacing.lg);
  });

  it('keeps onboarding amount inputs in the same layout flow as their currency symbol', () => {
    render(
      <CollectStep
        title="Cards"
        chipLabel="Add a card"
        chips={[]}
        onAddChip={jest.fn()}
        currency="USD"
        items={[
          {
            id: 'card-1',
            title: 'Card',
            amount: 0,
            paymentPlan: { amount: 0, date: 0, dateLabel: 'Due' },
          },
        ]}
        onRename={jest.fn()}
        onAmountChange={jest.fn()}
        onRemove={jest.fn()}
        onPaymentAmountChange={jest.fn()}
        onBack={jest.fn()}
        onContinue={jest.fn()}
      />,
    );

    const inputStyle = StyleSheet.flatten(
      screen.getByTestId('onboarding-amount-card-1').props.style,
    );

    expect(inputStyle.position).not.toBe('absolute');
    expect(inputStyle.paddingHorizontal).toBe(0);
    expect(inputStyle.flexShrink).toBe(0);

    const paymentStyle = StyleSheet.flatten(
      screen.getByTestId('onboarding-card-pay-card-1').props.style,
    );
    expect(paymentStyle.position).not.toBe('absolute');
    expect(paymentStyle.paddingHorizontal).toBe(0);
    expect(paymentStyle.flexShrink).toBe(0);
  });
});
