import { presentPlannedPaymentCard } from '@/src/features/planned-payments/components/PlannedPaymentCard';
import type { PlannedPaymentObligation } from '@/src/services/planned-payment/plannedPaymentReadService';
import { AccountType, PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import type { PlainAccount } from '@/src/types/plainDtos';

const account = (name: string) => ({ name, accountType: AccountType.ASSET }) as PlainAccount;

function makeItem(status: PlannedPaymentStatus): PlannedPaymentObligation {
  return {
    id: 'payment-1' as PlannedPaymentObligation['id'],
    name: 'Rent',
    amount: 1200,
    currencyCode: 'USD',
    fromAccountId: 'account-1' as PlannedPaymentObligation['fromAccountId'],
    toAccountId: 'account-2' as PlannedPaymentObligation['toAccountId'],
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: Date.now(),
    nextOccurrence: Date.now() + 86400000 * 10,
    status,
    isAutoPost: false,
    flowDirection: 'outflow',
    nextDueOccurrence: Date.now() + 86400000 * 10,
  };
}

describe('presentPlannedPaymentCard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 2, 12));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shortens same-year dates and keeps the year for future years', () => {
    const item = makeItem(PlannedPaymentStatus.ACTIVE);
    item.nextDueOccurrence = new Date(2026, 9, 10).getTime();
    expect(presentPlannedPaymentCard(item).dueSummary).toBe('Oct 10');
    expect(presentPlannedPaymentCard(item).dateLabel).toContain('Oct 10, 2026');
    item.nextDueOccurrence = new Date(2027, 2, 30).getTime();
    expect(presentPlannedPaymentCard(item).dueSummary).toBe('Mar 30, 2027');
  });

  it('keeps nearby due dates relative', () => {
    const item = makeItem(PlannedPaymentStatus.ACTIVE);
    item.nextDueOccurrence = new Date(2026, 9, 5).getTime();
    expect(presentPlannedPaymentCard(item).dueSummary).toBe('in 3 days');
    item.nextDueOccurrence = new Date(2026, 9, 2).getTime();
    expect(presentPlannedPaymentCard(item).dueSummary).toBe('Today');
  });

  it('shows the account route, posting mode and finite schedule', () => {
    const item = makeItem(PlannedPaymentStatus.ACTIVE);
    item.fromAccount = account('Checking');
    item.toAccount = account('Housing');
    item.isAutoPost = true;
    item.endDate = new Date(2027, 1, 15).getTime();
    const vm = presentPlannedPaymentCard(item);
    expect(vm.fromAccountLabel).toBe('Checking');
    expect(vm.toAccountLabel).toBe('Housing');
    expect(vm.postingLabel).toBe('Auto-post');
    expect(vm.endDateLabel).toBe('Ends Feb 15, 2027');
  });

  it('makes unavailable accounts and manual posting explicit', () => {
    const vm = presentPlannedPaymentCard(makeItem(PlannedPaymentStatus.ACTIVE));
    expect(vm.fromAccountLabel).toBe('Unavailable account');
    expect(vm.toAccountLabel).toBe('Unavailable account');
    expect(vm.postingLabel).toBe('Manual posting');
    expect(vm.endDateLabel).toBeUndefined();
  });

  it('formats multi-week recurrence with its scheduled weekday', () => {
    const item = makeItem(PlannedPaymentStatus.ACTIVE);
    item.intervalN = 2;
    item.intervalType = PlannedPaymentInterval.WEEKLY;
    item.recurrenceDay = 5;
    expect(presentPlannedPaymentCard(item).intervalLabel).toBe('Every 2 weeks on Fri');
    expect(presentPlannedPaymentCard(item).intervalSummary).toBe('2 wk');
  });

  it('keeps an unpaid occurrence overdue after the schedule ends', () => {
    const item = makeItem(PlannedPaymentStatus.COMPLETED);
    item.nextDueOccurrence = new Date(2020, 0, 1).getTime();
    expect(presentPlannedPaymentCard(item).statusBadge?.text).toBe('Overdue');
    expect(presentPlannedPaymentCard(item).dateLabel).toContain('Due:');
    item.nextDueOccurrence = undefined;
    expect(presentPlannedPaymentCard(item).statusBadge?.text).toBe('Completed');
    expect(presentPlannedPaymentCard(item).dueSummary).toBe('Completed');
  });

  it('omits the ordinary Active badge and preserves payment details', () => {
    const vm = presentPlannedPaymentCard(makeItem(PlannedPaymentStatus.ACTIVE));

    expect(vm.statusBadge).toBeUndefined();
    expect(vm.intervalLabel).toBe('Monthly');
    expect(vm.dateLabel).toContain('Next:');
    expect(vm.amount).toBe(1200);
    expect(vm.currencyCode).toBe('USD');
  });

  it('keeps the Paused status label', () => {
    const vm = presentPlannedPaymentCard(makeItem(PlannedPaymentStatus.PAUSED));
    expect(vm.statusBadge?.text).toBe('Paused');
    expect(vm.dueSummary).toBe('Paused');
  });

  it('keeps Due Soon and Overdue labels for active payments', () => {
    const dueSoon = makeItem(PlannedPaymentStatus.ACTIVE);
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dueSoon.nextDueOccurrence = tomorrow.getTime();
    expect(presentPlannedPaymentCard(dueSoon).statusBadge?.text).toBe('Due Soon');

    const overdue = makeItem(PlannedPaymentStatus.ACTIVE);
    const yesterday = new Date();
    yesterday.setHours(0, 0, 0, 0);
    yesterday.setDate(yesterday.getDate() - 1);
    overdue.nextDueOccurrence = yesterday.getTime();
    expect(presentPlannedPaymentCard(overdue).statusBadge?.text).toBe('Overdue');
    expect(presentPlannedPaymentCard(overdue).dueSummary).toBe('1 day overdue');
  });
});
