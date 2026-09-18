import React from 'react';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { ClarityScene } from '../wrap';

jest.mock('@/src/components/core', () => {
  const {
    Text: NativeText,
    View: NativeView,
    Pressable: NativePressable,
  } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    AppText: ({ children, ...props }: { children?: React.ReactNode }) => (
      <NativeText {...props}>{children}</NativeText>
    ),
    ColoredDot: () => <NativeView />,
    Icon: { HelpCircle: 'helpCircle' },
    IconButton: ({ onPress, ...props }: { onPress: () => void }) => (
      <NativePressable {...props} onPress={onPress} />
    ),
  };
});

jest.mock('@/src/components/shared/MoneyText', () => {
  const { Text: NativeText } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    MoneyText: ({ amount, ...props }: { amount: number }) => (
      <NativeText {...props}>{amount}</NativeText>
    ),
  };
});

jest.mock('@/src/components/overlays/InfoSheet', () => {
  const {
    Text: NativeText,
    View: NativeView,
    Pressable: NativePressable,
  } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    InfoSheet: ({
      visible,
      title,
      onClose,
      children,
      accessibilityCloseLabel,
    }: {
      visible: boolean;
      title: string;
      onClose: () => void;
      children: React.ReactNode;
      accessibilityCloseLabel: string;
    }) =>
      visible ? (
        <NativeView testID="onboarding-clarity-sheet">
          <NativeText>{title}</NativeText>
          <NativePressable accessibilityLabel={accessibilityCloseLabel} onPress={onClose} />
          {children}
        </NativeView>
      ) : null,
  };
});

jest.mock('../conversationUi', () => {
  const { View: NativeView } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    ConversationStep: ({ children }: { children: React.ReactNode }) => (
      <NativeView>{children}</NativeView>
    ),
  };
});

jest.mock('../clarityChart', () => {
  const { Text: NativeText } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    ClarityChart: () => <NativeText testID="onboarding-clarity-chart">chart</NativeText>,
  };
});

jest.mock('@/src/design-system', () => {
  const { View: NativeView } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    Inline: ({ children, ...props }: { children?: React.ReactNode }) => (
      <NativeView {...props}>{children}</NativeView>
    ),
    Stack: ({ children, ...props }: { children?: React.ReactNode }) => (
      <NativeView {...props}>{children}</NativeView>
    ),
  };
});

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: { asset: '#111', success: '#222', error: '#333', warning: '#444' },
  }),
}));

describe('ClarityScene progressive explanation', () => {
  it('keeps the definition and calculation visible, then opens the detailed sheet', () => {
    render(
      <ClarityScene
        currency="USD"
        draft={{
          operationId: 'op' as never,
          displayName: '',
          workplaceName: 'Personal',
          workplaceIcon: 'home' as never,
          currency: 'USD',
          accounts: [],
          income: { kind: 'unset' },
          commitment: { kind: 'unset' },
          budget: { kind: 'unset' },
        }}
        projection={{
          safeToSpend: 100,
          windowDays: 30,
          chart: [],
          liquidNow: 100,
          expectedIncomeInWindow: 0,
          plannedOutflowInWindow: 0,
          budgetReserveInWindow: 0,
          projectedRoom: 100,
          heldNow: 0,
          heldLabel: 'Already spoken for',
          today: [],
          ahead: [],
          explanation: '',
          omitted: [],
        }}
        finishing={false}
        onEnter={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByText(/Safe to Spend is the cash/)).toBeTruthy();
    expect(screen.getByTestId('onboarding-clarity-calculation')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-clarity-sheet')).toBeNull();

    fireEvent.press(screen.getByTestId('onboarding-clarity-info-button'));

    expect(screen.getByTestId('onboarding-clarity-sheet')).toBeTruthy();
    expect(screen.getByText('How Safe to Spend works')).toBeTruthy();
  });
});
