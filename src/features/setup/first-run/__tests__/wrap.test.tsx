import React from 'react';
import { fireEvent, render, screen } from '@/src/testing/render';
import { ClarityScene } from '../wrap';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { AccountType } from '@/src/types/enums';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import { Icon } from '@/src/types/domainIcons';

jest.mock('@/src/components/core', () => {
  const {
    Text: NativeText,
    View: NativeView,
    Pressable: NativePressable,
  } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    AppCard: ({ children, ...props }: { children?: React.ReactNode }) => (
      <NativeView {...props}>{children}</NativeView>
    ),
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
      position,
    }: {
      visible: boolean;
      title: string;
      onClose: () => void;
      children: React.ReactNode;
      accessibilityCloseLabel: string;
      position?: string;
    }) =>
      visible ? (
        <NativeView
          testID={
            position === 'bottomSheet'
              ? 'onboarding-clarity-sheet-bottom-sheet'
              : 'onboarding-clarity-sheet'
          }
        >
          <NativeText>{title}</NativeText>
          <NativePressable accessibilityLabel={accessibilityCloseLabel} onPress={onClose} />
          {children}
        </NativeView>
      ) : null,
  };
});

jest.mock('../conversationUi', () => {
  const {
    View: NativeView,
    Pressable,
    Text,
  } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    ConversationStep: ({
      children,
      footer,
      onPrimary,
      primaryLabel,
    }: {
      children: React.ReactNode;
      footer?: React.ReactNode;
      onPrimary?: () => void;
      primaryLabel?: string;
    }) => (
      <NativeView>
        {children}
        {footer}
        <Pressable testID="result-primary" onPress={onPrimary}>
          <Text>{primaryLabel}</Text>
        </Pressable>
      </NativeView>
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
  const emptyResult = {
    currency: 'USD',
    draft: {
      operationId: asWorkplaceId('result-operation'),
      displayName: 'Ada',
      workplaceName: 'Personal',
      workplaceIcon: Icon.Home,
      currency: 'USD',
      accounts: [],
      income: { kind: 'unset' },
      commitment: { kind: 'unset' },
      budget: { kind: 'unset' },
    },
    projection: {
      safeToSpend: 0,
      windowDays: 30,
      chart: [],
      liquidNow: 0,
      expectedIncomeInWindow: 0,
      plannedOutflowInWindow: 0,
      budgetReserveInWindow: 0,
      projectedRoom: 0,
      heldNow: 0,
      heldLabel: '',
      today: [],
      ahead: [],
      explanation: '',
      omitted: [],
    },
    finishing: false,
    onEnter: jest.fn(),
    onBack: jest.fn(),
  } satisfies React.ComponentProps<typeof ClarityScene>;

  it('shows unknown instead of a numeric estimate with no usable input', () => {
    render(<ClarityScene {...emptyResult} />);
    expect(screen.getByText(copy.clarityUnknown)).toBeTruthy();
    expect(screen.queryByTestId('onboarding-clarity-sts')).toBeNull();
    expect(screen.queryByTestId('onboarding-clarity-formula')).toBeNull();
  });

  it('shows preserved metadata without inventing a balance or an estimate', () => {
    render(
      <ClarityScene
        {...emptyResult}
        hasUsableEstimate={false}
        draft={{
          ...emptyResult.draft,
          preservedStarterAccounts: [
            {
              id: asAccountId('brokerage'),
              name: 'Brokerage',
              type: AccountType.ASSET,
              icon: Icon.Briefcase,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('Brokerage')).toBeTruthy();
    expect(screen.getByText(copy.balanceNotProvided)).toBeTruthy();
    expect(screen.queryByTestId('onboarding-clarity-sts')).toBeNull();
  });

  it('retries opening a saved workplace without committing again', () => {
    const onEnter = jest.fn();
    const onRetryOpen = jest.fn();
    render(
      <ClarityScene
        {...emptyResult}
        onEnter={onEnter}
        publishedOutcome={{ retryOpen: onRetryOpen }}
      />,
    );
    fireEvent.press(screen.getByTestId('result-primary'));
    expect(onRetryOpen).toHaveBeenCalledTimes(1);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('keeps the result concise and opens calculations on demand', () => {
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

    expect(screen.getByTestId('onboarding-clarity-result')).toBeTruthy();
    expect(screen.queryByText(copy.clarityDefinition)).toBeNull();
    expect(screen.queryByTestId('onboarding-clarity-calculation')).toBeNull();
    expect(screen.queryByTestId('onboarding-clarity-formula')).toBeNull();

    fireEvent.press(screen.getByTestId('onboarding-clarity-info-button'));

    expect(screen.getByTestId('onboarding-clarity-sheet-bottom-sheet')).toBeTruthy();
    expect(screen.getByText('How Safe to Spend works')).toBeTruthy();
    expect(screen.getByTestId('onboarding-clarity-calculation')).toBeTruthy();
    expect(screen.getByTestId('onboarding-clarity-formula')).toBeTruthy();
  });
});
