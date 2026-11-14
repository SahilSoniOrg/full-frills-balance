import { render, screen } from '@/src/utils/test-utils';
import type { ComponentProps, ReactNode } from 'react';
import { CollectedRow, type CollectedItem } from '../CollectedRow';

jest.mock('@/src/components/core', () => {
  const { Pressable: NativePressable, Text: NativeText, View: NativeView } = jest.requireActual(
    'react-native',
  ) as typeof import('react-native');
  return {
    AppCard: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <NativeView {...(props as ComponentProps<typeof NativeView>)}>{children}</NativeView>
    ),
    AppIcon: () => null,
    AppText: ({ children }: { children?: ReactNode }) => <NativeText>{children}</NativeText>,
    FilterChipButton: () => null,
    PressScaleTouchable: ({ children, haptic: _haptic, ...props }: { children?: ReactNode; haptic?: string; [key: string]: unknown }) => (
      <NativePressable {...(props as ComponentProps<typeof NativePressable>)}>{children}</NativePressable>
    ),
    SwipeToRemove: ({ children }: { children?: ReactNode }) => <NativeView>{children}</NativeView>,
  };
});

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: { text: '#000', textSecondary: '#666' },
    tokens: { input: { placeholder: '#999' } },
    fonts: { regular: 'System', semibold: 'System' },
  }),
}));

jest.mock('@/src/components/filters/DateTimePickerModal', () => ({
  DateTimePickerModal: () => null,
}));

jest.mock('@/src/components/filters/SelectionPickerSheet', () => ({
  SelectionPickerSheet: () => null,
}));

describe('CollectedRow field errors', () => {
  it('renders a stable account balance error beside its input', () => {
    const item: CollectedItem = {
      kind: 'account',
      id: 'bank-1',
      title: 'Bank',
      amount: 0,
      amountText: '',
      amountError: 'Enter an amount.',
      amountLabel: 'Current balance',
      detail: { kind: 'plain' },
      onRename: jest.fn(),
      onAmountChange: jest.fn(),
      onRemove: jest.fn(),
    };

    render(<CollectedRow item={item} currency="USD" locale="en-US" />);

    expect(screen.getByTestId('onboarding-amount-bank-1').props.value).toBe('');
    expect(screen.getByText('Enter an amount.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Bank' })).toBeTruthy();
  });

  it('renders the planned card-payment error next to the card-payment input', () => {
    const item: CollectedItem = {
      kind: 'account',
      id: 'card-1',
      title: 'Card',
      amount: 0,
      amountText: '0',
      amountLabel: 'Amount owed',
      detail: {
        kind: 'card',
        paymentPlan: { amount: 0, date: Date.now(), dateLabel: 'Due' },
        paymentAmountText: '1.234',
        paymentAmountError: 'Use fewer decimal places for this currency.',
        onAmountChange: jest.fn(),
        onDateChange: jest.fn(),
      },
      onRename: jest.fn(),
      onAmountChange: jest.fn(),
      onRemove: jest.fn(),
    };

    render(<CollectedRow item={item} currency="USD" locale="en-US" />);

    expect(screen.getByTestId('onboarding-card-pay-card-1').props.value).toBe('1.234');
    expect(screen.getByText('Use fewer decimal places for this currency.')).toBeTruthy();
  });
});
