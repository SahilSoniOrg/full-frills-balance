import { toPlainPlannedPayment } from '@/src/data/models/PlannedPayment';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { observeWorkplaceAccounts } from '@/src/services/reactive/reactiveWorkplaceObserves';
import { AccountType } from '@/src/types/enums';
import type Account from '@/src/data/models/Account';
import type Journal from '@/src/data/models/Journal';
import type PlannedPayment from '@/src/data/models/PlannedPayment';
import type { PlainPlannedPayment } from '@/src/types/plainDtos';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { combineLatest, map, Observable } from 'rxjs';

export type PlannedPaymentObligation = PlainPlannedPayment & {
  nextDueOccurrence?: number;
  outstandingJournalId?: string;
  flowDirection: 'inflow' | 'outflow' | 'transfer' | 'unknown';
};

export function classifyPlannedPaymentDirection(
  fromType: AccountType | undefined,
  toType: AccountType | undefined,
): PlannedPaymentObligation['flowDirection'] {
  if (!fromType || !toType) return 'unknown';
  const isBalanceSheet = (type: AccountType) =>
    type === AccountType.ASSET || type === AccountType.LIABILITY;
  const isIncomeStatement = (type: AccountType) =>
    type === AccountType.INCOME || type === AccountType.EXPENSE;
  if (isBalanceSheet(fromType) && toType === AccountType.EXPENSE) return 'outflow';
  if (isIncomeStatement(fromType) && isBalanceSheet(toType)) return 'inflow';
  if (fromType === toType && isBalanceSheet(fromType)) return 'transfer';
  if (fromType === AccountType.ASSET && toType === AccountType.LIABILITY) return 'outflow';
  if (fromType === AccountType.LIABILITY && toType === AccountType.ASSET) return 'inflow';
  return 'unknown';
}

export function projectPlannedPaymentObligations(
  payments: ReturnType<typeof toPlainPlannedPayment>[],
  journals: Journal[],
  accounts: Account[],
): PlannedPaymentObligation[] {
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const journalsByPlan = new Map<string, Journal[]>();
  for (const journal of journals) {
    if (!journal.plannedPaymentId) continue;
    const matches = journalsByPlan.get(journal.plannedPaymentId) ?? [];
    matches.push(journal);
    journalsByPlan.set(journal.plannedPaymentId, matches);
  }
  return payments
    .map(payment => {
      const pending = (journalsByPlan.get(payment.id) ?? []).sort(
        (a, b) => a.journalDate - b.journalDate,
      )[0];
      const from = accountsById.get(payment.fromAccountId);
      const to = accountsById.get(payment.toAccountId);
      const flowDirection = classifyPlannedPaymentDirection(from?.accountType, to?.accountType);
      const cursorValid =
        payment.status === 'ACTIVE' &&
        (payment.endDate === undefined ||
          payment.endDate === null ||
          payment.nextOccurrence <= payment.endDate);
      const cursorDate = cursorValid ? payment.nextOccurrence : undefined;
      const pendingWins =
        pending !== undefined && (cursorDate === undefined || pending.journalDate <= cursorDate);
      const nextDueOccurrence = pendingWins ? pending.journalDate : cursorDate;
      return {
        ...payment,
        nextDueOccurrence,
        outstandingJournalId: pendingWins ? pending.id : undefined,
        flowDirection,
      };
    })
    .sort((a, b) => {
      const aPaused = a.status !== 'ACTIVE';
      const bPaused = b.status !== 'ACTIVE';
      if (aPaused !== bPaused) return aPaused ? 1 : -1;
      return (
        (a.nextDueOccurrence ?? Number.MAX_SAFE_INTEGER) -
        (b.nextDueOccurrence ?? Number.MAX_SAFE_INTEGER)
      );
    });
}

export function observePlannedPaymentObligations(
  payments$: Observable<PlannedPayment[]>,
  journals$: Observable<Journal[]>,
  accounts$: Observable<Account[]>,
) {
  return combineLatest([payments$, journals$, accounts$]).pipe(
    map(([payments, journals, accounts]) =>
      projectPlannedPaymentObligations(payments.map(toPlainPlannedPayment), journals, accounts),
    ),
  );
}

/** Read boundary for planned-payment feature consumers. */
export class PlannedPaymentReadService {
  observeObligations(workplaceId: WorkplaceId) {
    return observePlannedPaymentObligations(
      plannedPaymentRepository.observeAll(workplaceId),
      journalObserveQueries.observeAllPlanned(workplaceId),
      observeWorkplaceAccounts(workplaceId),
    );
  }

  observeObligationById(workplaceId: WorkplaceId, plannedPaymentId: PlannedPaymentId) {
    return this.observeObligations(workplaceId).pipe(
      map(items => items.find(item => item.id === plannedPaymentId) ?? null),
    );
  }
  observeAll(workplaceId: WorkplaceId) {
    return plannedPaymentRepository
      .observeAll(workplaceId)
      .pipe(map(items => items.map(toPlainPlannedPayment)));
  }

  observeActive(workplaceId: WorkplaceId) {
    return plannedPaymentRepository
      .observeActive(workplaceId)
      .pipe(map(items => items.map(toPlainPlannedPayment)));
  }

  observeById(workplaceId: WorkplaceId, plannedPaymentId: PlannedPaymentId) {
    return plannedPaymentRepository
      .observeById(workplaceId, plannedPaymentId)
      .pipe(map(item => (item ? toPlainPlannedPayment(item) : null)));
  }

  async find(workplaceId: WorkplaceId, plannedPaymentId: PlannedPaymentId) {
    const item = await plannedPaymentRepository.find(workplaceId, plannedPaymentId);
    return item ? toPlainPlannedPayment(item) : undefined;
  }
}

export const plannedPaymentReadService = new PlannedPaymentReadService();
