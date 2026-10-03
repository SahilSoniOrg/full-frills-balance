import { toPlainPlannedPayment } from '@/src/data/models/PlannedPayment';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { observeWorkplaceAccounts } from '@/src/services/reactive/reactiveWorkplaceObserves';
import { AccountType, PlannedPaymentStatus } from '@/src/types/enums';
import type Account from '@/src/data/models/Account';
import { toPlainAccount } from '@/src/data/models/Account';
import type Journal from '@/src/data/models/Journal';
import type PlannedPayment from '@/src/data/models/PlannedPayment';
import type { PlainAccount, PlainPlannedPayment } from '@/src/types/plainDtos';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { combineLatest, map, Observable } from 'rxjs';
import {
  calculateNextOccurrence,
  computeFirstOccurrence,
  normalizeToStartOfDay,
} from './plannedPaymentRecurrence';

export interface PlannedPaymentSavedOccurrence {
  plannedPaymentId: PlannedPaymentId;
  journalId: JournalId;
  date: number;
  amount: number;
  currencyCode: string;
}

export interface PlannedPaymentListData {
  /** Legacy schedule rows; amounts remain the rule defaults. */
  items: PlannedPaymentObligation[];
  savedOccurrences: PlannedPaymentSavedOccurrence[];
}

export interface PlannedPaymentListOccurrence {
  occurrenceId: string;
  payment: PlannedPaymentObligation;
  date: number;
  amount: number;
  currencyCode: string;
  journalId?: JournalId;
  canRecord: boolean;
}

/**
 * All saved pending entries plus every cursor occurrence through the horizon and one
 * later occurrence per active schedule. Saved entries override projected days, never
 * each other. The cursor is authoritative; historical recording dates do not suppress it.
 */
export function projectPlannedPaymentListOccurrences(
  { items, savedOccurrences }: PlannedPaymentListData,
  throughDate: number,
): PlannedPaymentListOccurrence[] {
  const savedByPlan = new Map<PlannedPaymentId, PlannedPaymentSavedOccurrence[]>();
  for (const occurrence of savedOccurrences) {
    const saved = savedByPlan.get(occurrence.plannedPaymentId) ?? [];
    saved.push(occurrence);
    savedByPlan.set(occurrence.plannedPaymentId, saved);
  }
  const occurrences: PlannedPaymentListOccurrence[] = [];
  for (const payment of items) {
    const saved = savedByPlan.get(payment.id) ?? [];
    const savedDays = new Set(saved.map(item => normalizeToStartOfDay(item.date)));
    for (const item of saved) {
      occurrences.push({
        occurrenceId: `journal:${item.journalId}`,
        payment,
        date: item.date,
        amount: item.amount,
        currencyCode: item.currencyCode,
        journalId: item.journalId,
        canRecord: payment.status !== PlannedPaymentStatus.PAUSED,
      });
    }
    if (
      payment.status !== PlannedPaymentStatus.ACTIVE ||
      !Number.isFinite(normalizeToStartOfDay(throughDate)) ||
      !Number.isFinite(normalizeToStartOfDay(payment.startDate)) ||
      !Number.isFinite(normalizeToStartOfDay(payment.nextOccurrence)) ||
      (payment.endDate != null && !Number.isFinite(normalizeToStartOfDay(payment.endDate)))
    )
      continue;
    // Align stale cursors directly to the valid schedule start. Legitimate overdue
    // occurrences after that start are retained without an arbitrary generation cap.
    let cursor =
      payment.nextOccurrence < payment.startDate
        ? computeFirstOccurrence(payment.startDate, payment)
        : payment.nextOccurrence;
    while (Number.isFinite(cursor)) {
      if (payment.endDate != null && cursor > payment.endDate) break;
      const day = normalizeToStartOfDay(cursor);
      if (cursor >= payment.startDate && !savedDays.has(day)) {
        occurrences.push({
          occurrenceId: `plan:${payment.id}:${day}`,
          payment,
          date: cursor,
          amount: payment.amount,
          currencyCode: payment.currencyCode,
          canRecord: true,
        });
      }
      if (cursor > throughDate && cursor >= payment.startDate) break;
      const next = calculateNextOccurrence(cursor, payment);
      if (!Number.isFinite(next) || next <= cursor) break;
      cursor = next;
    }
  }
  return occurrences.sort(
    (a, b) =>
      a.date - b.date ||
      a.payment.name.localeCompare(b.payment.name) ||
      a.occurrenceId.localeCompare(b.occurrenceId),
  );
}

export type PlannedPaymentObligation = PlainPlannedPayment & {
  nextDueOccurrence?: number;
  outstandingJournalId?: string;
  flowDirection: 'inflow' | 'outflow' | 'transfer' | 'unknown';
  fromAccount?: PlainAccount;
  toAccount?: PlainAccount;
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
  const accountsById = new Map(accounts.map(account => [account.id, toPlainAccount(account)]));
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
        fromAccount: from,
        toAccount: to,
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

export function observePlannedPaymentListData(
  payments$: Observable<PlannedPayment[]>,
  journals$: Observable<Journal[]>,
  accounts$: Observable<Account[]>,
): Observable<PlannedPaymentListData> {
  return combineLatest([payments$, journals$, accounts$]).pipe(
    map(([payments, journals, accounts]) => ({
      items: projectPlannedPaymentObligations(
        payments.map(toPlainPlannedPayment),
        journals,
        accounts,
      ),
      // Copy model fields on every emission: amount/currency edits must produce fresh DTOs.
      savedOccurrences: journals.flatMap(journal =>
        journal.plannedPaymentId
          ? [
              {
                plannedPaymentId: journal.plannedPaymentId,
                journalId: journal.id,
                date: journal.journalDate,
                amount: journal.totalAmount,
                currencyCode: journal.currencyCode,
              },
            ]
          : [],
      ),
    })),
  );
}

/** Read boundary for planned-payment feature consumers. */
export class PlannedPaymentReadService {
  observeListData(workplaceId: WorkplaceId) {
    return observePlannedPaymentListData(
      plannedPaymentRepository.observeAll(workplaceId),
      journalObserveQueries.observeAllPlanned(workplaceId),
      observeWorkplaceAccounts(workplaceId),
    );
  }

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
