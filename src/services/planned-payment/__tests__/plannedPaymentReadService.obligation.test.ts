import type Account from '@/src/data/models/Account';
import type Journal from '@/src/data/models/Journal';
import type { PlainPlannedPayment } from '@/src/types/plainDtos';
import { AccountType, PlannedPaymentStatus } from '@/src/types/enums';
import {
  observePlannedPaymentObligations,
  projectPlannedPaymentObligations,
} from '../plannedPaymentReadService';
import { BehaviorSubject } from 'rxjs';
import { Icon } from '@/src/types/domainIcons';

const payment = (overrides: Partial<PlainPlannedPayment> = {}) =>
  ({
    id: 'plan-1',
    name: 'Rent',
    amount: 800,
    currencyCode: 'USD',
    fromAccountId: 'cash',
    toAccountId: 'expense',
    intervalN: 1,
    intervalType: 'MONTHLY',
    startDate: 0,
    nextOccurrence: 300,
    status: 'COMPLETED',
    isAutoPost: false,
    ...overrides,
  }) as unknown as PlainPlannedPayment;

describe('planned obligation projection', () => {
  const accounts = [
    { id: 'cash', name: 'Checking', accountType: AccountType.ASSET },
    { id: 'expense', name: 'Housing', accountType: AccountType.EXPENSE },
  ] as Account[];

  it('keeps the earliest unpaid generated journal actionable after a finite schedule completes', () => {
    const projected = projectPlannedPaymentObligations(
      [payment()],
      [{ id: 'generated-early', plannedPaymentId: 'plan-1', journalDate: 200 }] as Journal[],
      accounts,
    );
    expect(projected[0]).toMatchObject({
      nextDueOccurrence: 200,
      outstandingJournalId: 'generated-early',
      flowDirection: 'outflow',
      fromAccount: expect.objectContaining({ name: 'Checking' }),
      toAccount: expect.objectContaining({ name: 'Housing' }),
    });
  });

  it('uses an earlier valid recurrence cursor than a later outstanding journal', () => {
    const projected = projectPlannedPaymentObligations(
      [payment({ status: PlannedPaymentStatus.ACTIVE, nextOccurrence: 100 })],
      [{ id: 'generated-later', plannedPaymentId: 'plan-1', journalDate: 200 }] as Journal[],
      accounts,
    );
    expect(projected[0]?.nextDueOccurrence).toBe(100);
    expect(projected[0]?.outstandingJournalId).toBeUndefined();
  });

  it('projects account identity snapshots and updates them when account appearance changes', () => {
    const from = { ...accounts[0]!, color: '#336699', icon: 'bank' } as Account;
    const accounts$ = new BehaviorSubject([from, accounts[1]!]);
    const seen: ReturnType<typeof projectPlannedPaymentObligations> = [];
    const subscription = observePlannedPaymentObligations(
      new BehaviorSubject([payment() as never]),
      new BehaviorSubject<Journal[]>([]),
      accounts$,
    ).subscribe(items => seen.push(items[0]!));

    expect(seen[0]?.fromAccount).toMatchObject({
      name: 'Checking',
      color: '#336699',
      icon: Icon.Bank,
    });
    expect(seen[0]?.toAccount?.icon).toBe(Icon.Tag);

    from.color = '#996633';
    from.icon = 'creditCard';
    accounts$.next([from, accounts[1]!]);

    expect(seen[1]?.fromAccount).toMatchObject({ color: '#996633', icon: Icon.CreditCard });
    expect(seen[0]?.fromAccount?.color).toBe('#336699');
    subscription.unsubscribe();
  });

  it('leaves missing account identities unavailable', () => {
    const [projected] = projectPlannedPaymentObligations([payment()], [], []);
    expect(projected?.fromAccount).toBeUndefined();
    expect(projected?.toAccount).toBeUndefined();
  });

  it('reactively moves the feature DTO when an outstanding journal is settled', () => {
    const paymentModel = new BehaviorSubject([payment() as never]);
    const journals = new BehaviorSubject([
      { id: 'generated-early', plannedPaymentId: 'plan-1', journalDate: 200 },
    ] as Journal[]);
    const accounts$ = new BehaviorSubject(accounts);
    const seen: number[] = [];
    const subscription = observePlannedPaymentObligations(
      paymentModel,
      journals,
      accounts$,
    ).subscribe(items => seen.push(items[0]!.nextDueOccurrence!));

    journals.next([]);
    expect(seen).toEqual([200, undefined]);
    subscription.unsubscribe();
  });
});
