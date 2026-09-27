import { CollectStep, ConversationStep } from '../conversationUi';
import { Spacing } from '@/src/constants/design-tokens';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
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
  }),
}));

describe('ConversationStep keyboard behavior', () => {
  beforeEach(() => {
    jest.spyOn(Keyboard, 'addListener').mockReturnValue({ remove: jest.fn() } as never);
    mockedUsePageKeyboard.mockReturnValue({ isKeyboardVisible: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
    const frame = jest.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 0);
    const step = () => (
      <ConversationStep onBack={jest.fn()}>
        <TextInput testID="collector-input" />
      </ConversationStep>
    );
    const { rerender } = render(step());
    const scrollView = screen.UNSAFE_getByType(ScrollView);

    fireEvent(scrollView, 'focus', { nativeEvent: { target: 42 } });
    expect(frame).toHaveBeenCalledTimes(1);

    mockedUsePageKeyboard.mockReturnValue({ isKeyboardVisible: true });
    rerender(step());
    expect(frame).toHaveBeenCalledTimes(2);

    mockedUsePageKeyboard.mockReturnValue({ isKeyboardVisible: false });
    rerender(step());
    fireEvent(scrollView, 'blur');
    mockedUsePageKeyboard.mockReturnValue({ isKeyboardVisible: true });
    rerender(step());
    expect(frame).toHaveBeenCalledTimes(2);
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
