import { PlannedPaymentCard } from '@/src/features/planned-payments/components/PlannedPaymentCard';
import { AppConfig } from '@/src/constants';
import { preferences } from '@/src/services/preferences';
import { AccountType, PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import type { AccountId, PlannedPaymentId } from '@/src/types/ids';
import type { PlainAccount } from '@/src/types/plainDtos';
import { fireEvent, render, within } from '@/src/utils/test-utils';
import { StyleSheet, View } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import type { PlannedPaymentListOccurrence } from '@/src/services/planned-payment/plannedPaymentReadService';

const account = (name: string) => ({ name, accountType: AccountType.ASSET }) as PlainAccount;
const day = (value: number) => new Date(2026, 9, value).getTime();

function makeOccurrence(
  overrides: {
    dueDay?: number;
    amount?: number;
    currencyCode?: string;
    flowDirection?: PlannedPaymentListOccurrence['payment']['flowDirection'];
    status?: PlannedPaymentStatus;
    canRecord?: boolean;
    isAutoPost?: boolean;
    intervalType?: PlannedPaymentInterval;
    intervalN?: number;
    recurrenceDay?: number;
    fromAccount?: PlainAccount;
    toAccount?: PlainAccount;
  } = {},
): PlannedPaymentListOccurrence {
  const dueDate = day(overrides.dueDay ?? 10);
  return {
    occurrenceId: `payment-1:${dueDate}`,
    payment: {
      id: 'payment-1' as PlannedPaymentId,
      name: 'Rent',
      amount: 1200,
      currencyCode: 'USD',
      fromAccountId: 'account-1' as AccountId,
      toAccountId: 'account-2' as AccountId,
      fromAccount: overrides.fromAccount,
      toAccount: overrides.toAccount,
      intervalN: overrides.intervalN ?? 1,
      intervalType: overrides.intervalType ?? PlannedPaymentInterval.MONTHLY,
      recurrenceDay: overrides.recurrenceDay,
      startDate: day(1),
      nextOccurrence: dueDate,
      status: overrides.status ?? PlannedPaymentStatus.ACTIVE,
      isAutoPost: overrides.isAutoPost ?? false,
      flowDirection: overrides.flowDirection ?? 'outflow',
    },
    date: dueDate,
    amount: overrides.amount ?? 1200,
    currencyCode: overrides.currencyCode ?? 'USD',
    canRecord: overrides.canRecord ?? true,
  };
}

function renderCard(
  occurrence: PlannedPaymentListOccurrence,
  onPress = jest.fn(),
  onRecord = jest.fn(),
) {
  return {
    ...render(<PlannedPaymentCard occurrence={occurrence} onPress={onPress} onRecord={onRecord} />),
    onPress,
    onRecord,
  };
}

function dateBlockColor(testInstance: ReactTestInstance) {
  return StyleSheet.flatten(testInstance.props.style)?.backgroundColor;
}

describe('PlannedPaymentCard rendered row', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 4, 12));
    preferences.privacy.setIsPrivacyMode(false);
  });

  afterEach(() => {
    jest.useRealTimers();
    preferences.privacy.setIsPrivacyMode(false);
  });

  it('shows weekday and day, with error and warning urgency treatments', () => {
    const overdue = renderCard(makeOccurrence({ dueDay: 1 }));
    expect(overdue.getByText('Thu')).toBeTruthy();
    expect(overdue.getByText('1')).toBeTruthy();
    expect(overdue.getByText('3 days late')).toBeTruthy();
    const overdueDateBlock = overdue
      .UNSAFE_getAllByType(View)
      .find(view => StyleSheet.flatten(view.props.style)?.width === 44);

    const dueSoon = renderCard(makeOccurrence({ dueDay: 7 }));
    expect(dueSoon.getByText('Wed')).toBeTruthy();
    expect(dueSoon.getByText('7')).toBeTruthy();
    const dueSoonDateBlock = dueSoon
      .UNSAFE_getAllByType(View)
      .find(view => StyleSheet.flatten(view.props.style)?.width === 44);
    expect(dateBlockColor(overdueDateBlock!)).not.toBe(dateBlockColor(dueSoonDateBlock!));
  });

  it('keeps outgoing money neutral and prefixes income with plus in the income color', () => {
    const outgoing = renderCard(makeOccurrence({ amount: 725.25, currencyCode: 'EUR' }));
    const outgoingAmount = outgoing.getByText(/725/);
    const outgoingStyle = StyleSheet.flatten(outgoingAmount.props.style);
    expect(String(outgoingAmount.props.children)).not.toMatch(/^\+/);

    const incoming = renderCard(
      makeOccurrence({ amount: 725.25, currencyCode: 'EUR', flowDirection: 'inflow' }),
    );
    const incomingAmount = incoming.getByText(/725/);
    const incomingStyle = StyleSheet.flatten(incomingAmount.props.style);
    expect(String(incomingAmount.props.children)).toMatch(/^\+/);
    expect(incomingStyle?.color).not.toBe(outgoingStyle?.color);
  });

  it('uses whole currency units in the list row and compact overdue action', () => {
    const { getByRole, getByText } = render(
      <PlannedPaymentCard
        occurrence={makeOccurrence({ dueDay: 1, amount: 725.25, currencyCode: 'EUR' })}
        onPress={jest.fn()}
        onRecord={jest.fn()}
      />,
    );
    expect(getByText(/725/).props.children).not.toMatch(/\.25/);
    const record = getByRole('button', { name: /^Record Rent/ });
    expect(StyleSheet.flatten(record.props.style)?.minHeight).toBeGreaterThanOrEqual(44);
    const pill = record
      .findAllByType(View)
      .find(view => StyleSheet.flatten(view.props.style)?.minHeight === 30);
    expect(pill).toBeTruthy();
  });

  it('shows account fallback labels and an auto-post accessibility label', () => {
    const fallback = renderCard(makeOccurrence());
    expect(fallback.getAllByText('Unavailable account')).toHaveLength(2);
    const accounts = renderCard(
      makeOccurrence({ fromAccount: account('Checking'), toAccount: account('Housing') }),
    );
    expect(accounts.getByText('Checking')).toBeTruthy();
    expect(accounts.getByText('Housing')).toBeTruthy();

    const autoPost = renderCard(makeOccurrence({ isAutoPost: true }));
    expect(autoPost.getByRole('button', { name: /Auto-post/ })).toBeTruthy();
  });

  it('renders planned account flows with tinted single-line account labels', () => {
    const { getAllByTestId } = renderCard(
      makeOccurrence({ fromAccount: account('Checking'), toAccount: account('Housing') }),
    );
    const labels = getAllByTestId('account-flow-label');
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      const style = StyleSheet.flatten(label.props.style);
      expect(style.backgroundColor).toBeTruthy();
      expect(style.borderRadius).toBeTruthy();
    }
    expect(within(labels[0]).getByText('Checking').props.numberOfLines).toBe(1);
    expect(within(labels[1]).getByText('Housing').props.numberOfLines).toBe(1);
  });

  it('shows multi-interval cadence while omitting the ordinary monthly cadence', () => {
    const ordinaryMonthly = renderCard(makeOccurrence());
    expect(ordinaryMonthly.queryByText(/Every|Monthly|month/)).toBeNull();

    const everyTwoMonths = renderCard(
      makeOccurrence({ intervalType: PlannedPaymentInterval.MONTHLY, intervalN: 2 }),
    );
    expect(everyTwoMonths.getByText('Every 2 months')).toBeTruthy();

    const everyTwoWeeks = renderCard(
      makeOccurrence({
        intervalType: PlannedPaymentInterval.WEEKLY,
        intervalN: 2,
        recurrenceDay: 5,
      }),
    );
    expect(everyTwoWeeks.getByText('Every 2 weeks on Fri')).toBeTruthy();
  });

  it('records a completed schedule’s outstanding overdue occurrence from its separate button', () => {
    const onPress = jest.fn();
    const onRecord = jest.fn();
    const { getByText } = render(
      <PlannedPaymentCard
        occurrence={makeOccurrence({
          dueDay: 1,
          status: PlannedPaymentStatus.COMPLETED,
          amount: 725.25,
          currencyCode: 'EUR',
        })}
        onPress={onPress}
        onRecord={onRecord}
      />,
    );
    expect(getByText(/725/)).toBeTruthy();
    fireEvent.press(getByText('Record'));
    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('masks the amount in both the rendered row and its accessible Record label', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const { getByRole, getAllByText, queryByText } = render(
      <PlannedPaymentCard
        occurrence={makeOccurrence({ dueDay: 1, amount: 725.25, currencyCode: 'EUR' })}
        onPress={jest.fn()}
        onRecord={jest.fn()}
      />,
    );
    expect(getAllByText(AppConfig.privacyMask).length).toBeGreaterThan(0);
    expect(queryByText(/725/)).toBeNull();
    expect(getByRole('button', { name: /^Record Rent/ }).props.accessibilityLabel).toContain(
      AppConfig.privacyMask,
    );
  });

  it('does not expose Record for an occurrence marked ineligible', () => {
    const { queryByText } = render(
      <PlannedPaymentCard
        occurrence={makeOccurrence({ dueDay: 1, canRecord: false })}
        onPress={jest.fn()}
        onRecord={jest.fn()}
        canRecord={false}
      />,
    );
    expect(queryByText('3 days late')).toBeTruthy();
    expect(queryByText('Record')).toBeNull();
  });
});
