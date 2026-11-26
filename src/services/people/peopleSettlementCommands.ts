import {
  runAccountingWriteSession,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { personQueryRepository, personWriteRepository } from '@/src/data/repositories/people';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import {
  classifyPersonDebtPosting,
  openItemRemainder,
  planAutoSettle,
  planCrossCurrencyRepayment,
  planSameCurrencyRepayment,
  planWeAreSettled,
  projectLinkedAccount,
  type AccountUnassignedState,
  type OpenItem as DomainOpenItem,
  type SettlementAllocation as DomainSettlementAllocation,
} from '@/src/domain/people';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { fromMinorUnits, toMinorUnits } from '@/src/domain/money/money';
import type Journal from '@/src/data/models/Journal';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import { currencyReadService } from '@/src/services/currency-read-service';
import { preferences } from '@/src/services/preferences';
import { AccountSubtype, AccountType, JournalStatus } from '@/src/types/enums';
import type { AccountId, JournalId, OpenItemId, PersonId, WorkplaceId } from '@/src/types/ids';
import { asAccountId } from '@/src/types/ids';
import { ensurePersonAccountInSession } from './peopleLifecycleCommands';

export interface RepaymentAllocationInput {
  openItemId: OpenItemId;
  amount: number;
}

export interface RecordRepaymentInput {
  personId: PersonId;
  targetAccountId: AccountId;
  cashAccountId: AccountId;
  cashAmount: number;
  journalDate: number;
  journalCurrency: string;
  description?: string;
  notes?: string;
  existingJournalId?: JournalId;
  allocations: readonly RepaymentAllocationInput[];
  unassignedAmount?: number;
  exchangeRate?: number;
  targetAmount?: number;
}

export interface AllocateUnassignedRepaymentInput {
  personId: PersonId;
  targetAccountId: AccountId;
  settlementJournalId: JournalId;
  allocations: readonly RepaymentAllocationInput[];
}

export interface ExecuteWeAreSettledInput {
  personId: PersonId;
  workplaceCurrency: string;
  journalDate?: number;
  exchangeRateByCurrency?: ReadonlyMap<string, number>;
}

function toDomainItems(
  items: Awaited<ReturnType<typeof personQueryRepository.listOpenItems>>,
): DomainOpenItem[] {
  return items.map(item => ({
    id: item.id,
    personId: item.personId,
    accountId: item.accountId,
    originatingJournalId: item.originatingJournalId,
    currencyCode: item.currencyCode,
    originalAmount: item.originalAmount,
    createdAt: item.createdAt?.getTime(),
  }));
}

function toDomainAllocations(
  allocations: Awaited<ReturnType<typeof personQueryRepository.listSettlementAllocations>>,
): DomainSettlementAllocation[] {
  return allocations.map(allocation => ({
    id: allocation.id,
    openItemId: allocation.openItemId,
    journalId: allocation.settlementJournalId,
    amount: allocation.amount,
    active: allocation.isActive,
  }));
}

function roleForLinkedAccount(account: {
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
}): 'receivable' | 'payable' | null {
  if (account.accountType === AccountType.ASSET) return 'receivable';
  if (account.accountType === AccountType.LIABILITY) return 'payable';
  return null;
}

async function buildPrecisionMap(): Promise<Map<string, number>> {
  return currencyReadService.getAllPrecisions();
}

/** Runs same-currency auto-settle in a new write session when Workplace opt-in is enabled. */
export async function autoSettlePerson(
  workplaceId: WorkplaceId,
  personId: PersonId,
  journalDate = Date.now(),
): Promise<Journal | null> {
  if (!preferences.workplace.getSnapshot(workplaceId).autoSettlePeopleBalances) {
    return null;
  }
  return runAccountingWriteSession(session =>
    autoSettlePersonInSession(session, workplaceId, personId, journalDate),
  );
}

/** Auto-settles any People linked to `accountIds` after an originating write commits. */
export async function autoSettleTouchedPeople(
  workplaceId: WorkplaceId,
  accountIds: Iterable<AccountId>,
  journalDate = Date.now(),
): Promise<void> {
  if (!preferences.workplace.getSnapshot(workplaceId).autoSettlePeopleBalances) {
    return;
  }
  const links = await personQueryRepository.listPersonAccounts(workplaceId);
  const linkByAccount = new Map(links.map(link => [link.accountId, link.personId]));
  const personIds = new Set(
    Array.from(accountIds)
      .map(id => linkByAccount.get(id))
      .filter((personId): personId is PersonId => Boolean(personId)),
  );
  for (const personId of personIds) {
    await autoSettlePerson(workplaceId, personId, journalDate);
  }
}

/** Runs same-currency auto-settle inside an open write session when Workplace opt-in is enabled. */
export async function autoSettlePersonInSession(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  personId: PersonId,
  journalDate = Date.now(),
): Promise<Journal | null> {
  if (!preferences.workplace.getSnapshot(workplaceId).autoSettlePeopleBalances) {
    return null;
  }

  const [links, items, allocations, allAccounts] = await Promise.all([
    personQueryRepository.listPersonAccounts(workplaceId, personId),
    personQueryRepository.listOpenItems(workplaceId, { personId }),
    personQueryRepository.listSettlementAllocations(workplaceId, { personId, activeOnly: true }),
    accountQueryRepository.findAll(workplaceId),
  ]);

  const accountById = new Map(allAccounts.map(account => [account.id, account]));
  const domainItems = toDomainItems(items);
  const domainAllocations = toDomainAllocations(allocations);
  const roles = new Map<string, 'receivable' | 'payable'>();
  const states: AccountUnassignedState[] = [];

  for (const link of links) {
    const account = accountById.get(link.accountId);
    if (!account) continue;
    const role = roleForLinkedAccount(account);
    if (!role) continue;
    roles.set(account.id, role);
    const balance = await balanceReadService.getAccountBalance(account.id, workplaceId);
    const state = projectLinkedAccount({
      accountId: account.id,
      currencyCode: account.currencyCode,
      ledgerBalanceInNormalDirection: balance.balance,
      items: domainItems,
      allocations: domainAllocations,
    });
    if (state.hasNegativeUnassignedRemainder) {
      return null;
    }
    states.push(state);
  }

  const plan = planAutoSettle({
    items: domainItems,
    accounts: states,
    roles,
    activeAllocations: domainAllocations,
  });
  if (plan.lines.length < 2) {
    return null;
  }

  const byCurrency = new Map<string, typeof plan.lines>();
  for (const line of plan.lines) {
    const code = line.currencyCode ?? '';
    const group = byCurrency.get(code) ?? [];
    group.push(line);
    byCurrency.set(code, group);
  }

  let lastJournal: Journal | null = null;
  for (const [currencyCode, lines] of byCurrency) {
    if (lines.length < 2) continue;
    const itemIdsInCurrency = new Set(
      domainItems.filter(item => item.currencyCode === currencyCode).map(item => item.id),
    );
    const result = await journalPersistenceRepository.putInSession(
      session,
      {
        journalDate,
        description: 'Auto-settle People balances',
        currencyCode,
        status: JournalStatus.POSTED,
        transactions: lines,
      },
      workplaceId,
    );
    lastJournal = result.journal;
    const currencyAllocations = plan.allocations.filter(a => itemIdsInCurrency.has(a.openItemId));
    const itemById = new Map(items.map(item => [item.id as string, item]));
    await personWriteRepository.createSettlementAllocationsInSession(
      session,
      workplaceId,
      currencyAllocations.flatMap(allocation => {
        const item = itemById.get(allocation.openItemId);
        if (!item) return [];
        return [
          {
            personId,
            openItemId: item.id,
            settlementJournalId: result.journal.id,
            accountId: item.accountId,
            allocationKind: 'auto_settle' as const,
            amount: allocation.amount,
          },
        ];
      }),
    );
  }

  return lastJournal;
}

/** Records a new repayment or matches/reclassifies an existing posted journal and applies allocations. */
export async function recordRepayment(
  workplaceId: WorkplaceId,
  input: RecordRepaymentInput,
): Promise<Journal> {
  return runAccountingWriteSession(async session => {
    const [targetAccount, existingLink, items, allocations, targetBalance, existingJournal] =
      await Promise.all([
        accountQueryRepository.find(workplaceId, input.targetAccountId),
        personQueryRepository.findPersonAccountByAccountId(workplaceId, input.targetAccountId),
        personQueryRepository.listOpenItems(workplaceId, {
          personId: input.personId,
          accountId: input.targetAccountId,
        }),
        personQueryRepository.listSettlementAllocations(workplaceId, {
          personId: input.personId,
          activeOnly: true,
        }),
        balanceReadService.getAccountBalance(input.targetAccountId, workplaceId),
        input.existingJournalId
          ? journalQueryRepository.find(workplaceId, input.existingJournalId)
          : Promise.resolve(null),
      ]);

    if (!targetAccount) throw new Error('Target account not found');
    if (!existingLink || existingLink.personId !== input.personId) {
      throw new Error('Target account is not linked to this person');
    }
    if (input.existingJournalId && !existingJournal) {
      throw new Error('Existing journal not found');
    }

    const role = roleForLinkedAccount(targetAccount);
    if (!role) throw new Error('Target account must be a receivable or payable account');

    const domainItems = toDomainItems(items);
    const domainAllocations = toDomainAllocations(allocations);
    const targetState = projectLinkedAccount({
      accountId: targetAccount.id,
      currencyCode: targetAccount.currencyCode,
      ledgerBalanceInNormalDirection: targetBalance.balance,
      items: domainItems,
      allocations: domainAllocations,
    });

    const journalCurrency = existingJournal?.currencyCode ?? input.journalCurrency;
    const isSameCurrency =
      targetAccount.currencyCode.trim().toUpperCase() === journalCurrency.trim().toUpperCase();

    const plan = isSameCurrency
      ? planSameCurrencyRepayment({
          cashAccountId: input.cashAccountId,
          targetAccountId: targetAccount.id,
          items: domainItems,
          activeAllocations: domainAllocations,
          assigned: input.allocations,
          unassignedAmount: input.unassignedAmount ?? 0,
          repaymentLegAmount: input.cashAmount,
          currencyCode: targetAccount.currencyCode,
          target: targetState,
          role,
        })
      : await (async () => {
          if (input.allocations.length !== 1) {
            throw new Error(
              'Cross-currency repayment requires explicitly assigning one target open item',
            );
          }
          const allocation = input.allocations[0]!;
          const openItem = domainItems.find(item => item.id === allocation.openItemId);
          if (!openItem) throw new Error('Target open item not found');
          if (!input.exchangeRate || input.exchangeRate <= 0) {
            throw new Error(
              'Explicit positive exchange rate is required for cross-currency repayment',
            );
          }
          const precisionByCurrency = await buildPrecisionMap();
          if (!precisionByCurrency.has(journalCurrency)) {
            precisionByCurrency.set(journalCurrency, getCurrencyPrecision(journalCurrency));
          }
          if (!precisionByCurrency.has(targetAccount.currencyCode)) {
            precisionByCurrency.set(
              targetAccount.currencyCode,
              getCurrencyPrecision(targetAccount.currencyCode),
            );
          }
          return planCrossCurrencyRepayment({
            cashAccountId: input.cashAccountId,
            openItem,
            cashAmount: input.cashAmount,
            exchangeRate: input.exchangeRate,
            journalCurrency,
            precisionByCurrency,
            targetAmount: input.targetAmount ?? allocation.amount,
            role,
            activeAllocations: domainAllocations,
          });
        })();

    const result = await journalPersistenceRepository.putInSession(
      session,
      {
        ...(input.existingJournalId ? { journalId: input.existingJournalId } : {}),
        journalDate: existingJournal?.journalDate ?? input.journalDate,
        description: input.description ?? existingJournal?.description ?? 'Repayment',
        notes: input.notes ?? existingJournal?.notes,
        currencyCode: journalCurrency,
        status: JournalStatus.POSTED,
        transactions: plan.lines,
      },
      workplaceId,
    );

    const itemById = new Map(items.map(item => [item.id as string, item]));
    await personWriteRepository.createSettlementAllocationsInSession(
      session,
      workplaceId,
      plan.allocations.map(allocation => {
        const item = itemById.get(allocation.openItemId);
        if (!item) {
          throw new Error('Allocation open item mismatch');
        }
        return {
          personId: input.personId,
          openItemId: item.id,
          settlementJournalId: result.journal.id,
          accountId: targetAccount.id,
          allocationKind: 'repayment' as const,
          amount: allocation.amount,
        };
      }),
    );

    return result.journal;
  });
}

/** Allocates unallocated amount from an already-posted direct repayment journal to Open items. */
export async function allocateUnassignedRepayment(
  workplaceId: WorkplaceId,
  input: AllocateUnassignedRepaymentInput,
): Promise<void> {
  if (input.allocations.length === 0) return;

  await runAccountingWriteSession(async session => {
    const [targetAccount, journal, txs, items, existingAllocations] = await Promise.all([
      accountQueryRepository.find(workplaceId, input.targetAccountId),
      journalQueryRepository.find(workplaceId, input.settlementJournalId),
      transactionQueryRepository.findByJournal(workplaceId, input.settlementJournalId),
      personQueryRepository.listOpenItems(workplaceId, {
        personId: input.personId,
        accountId: input.targetAccountId,
      }),
      personQueryRepository.listSettlementAllocations(workplaceId, {
        personId: input.personId,
        activeOnly: true,
      }),
    ]);

    if (!targetAccount) throw new Error('Target account not found');
    if (!journal || journal.status !== JournalStatus.POSTED) {
      throw new Error('Settlement journal must be posted');
    }

    const precision = getCurrencyPrecision(targetAccount.currencyCode);
    const reducingLegUnits = txs
      .filter(
        tx =>
          tx.accountId === input.targetAccountId &&
          classifyPersonDebtPosting({
            accountType: targetAccount.accountType,
            transactionType: tx.transactionType,
          }) === 'reducing',
      )
      .reduce((sum, tx) => sum + toMinorUnits(tx.amount, precision), 0);

    const alreadyAllocatedUnits = existingAllocations
      .filter(
        allocation =>
          allocation.settlementJournalId === input.settlementJournalId &&
          allocation.accountId === input.targetAccountId,
      )
      .reduce((sum, allocation) => sum + toMinorUnits(allocation.amount, precision), 0);

    const domainItems = toDomainItems(items);
    const domainAllocations = toDomainAllocations(existingAllocations);
    let requestedUnits = 0;

    for (const allocation of input.allocations) {
      const item = domainItems.find(candidate => candidate.id === allocation.openItemId);
      if (!item) throw new Error('Open item not found on target account');
      const remainderUnits = toMinorUnits(openItemRemainder(item, domainAllocations), precision);
      const amountUnits = toMinorUnits(allocation.amount, precision);
      if (amountUnits <= 0 || amountUnits > remainderUnits) {
        throw new Error('Allocation exceeds open item remainder');
      }
      requestedUnits += amountUnits;
    }

    if (alreadyAllocatedUnits + requestedUnits > reducingLegUnits) {
      throw new Error('Allocation exceeds unallocated repayment amount');
    }

    await personWriteRepository.createSettlementAllocationsInSession(
      session,
      workplaceId,
      input.allocations.map(allocation => ({
        personId: input.personId,
        openItemId: allocation.openItemId,
        settlementJournalId: input.settlementJournalId,
        accountId: input.targetAccountId,
        allocationKind: 'repayment' as const,
        amount: fromMinorUnits(toMinorUnits(allocation.amount, precision), precision),
      })),
    );
  });
}

/** Explicit closing adjustment ("We're settled") in Workplace currency with residual write-off. */
export async function executeWeAreSettled(
  workplaceId: WorkplaceId,
  input: ExecuteWeAreSettledInput,
): Promise<Journal> {
  return runAccountingWriteSession(async session => {
    const [links, items, allocations, allAccounts, precisionByCurrency] = await Promise.all([
      personQueryRepository.listPersonAccounts(workplaceId, input.personId),
      personQueryRepository.listOpenItems(workplaceId, { personId: input.personId }),
      personQueryRepository.listSettlementAllocations(workplaceId, {
        personId: input.personId,
        activeOnly: true,
      }),
      accountQueryRepository.findAll(workplaceId),
      buildPrecisionMap(),
    ]);

    if (!precisionByCurrency.has(input.workplaceCurrency)) {
      precisionByCurrency.set(
        input.workplaceCurrency,
        getCurrencyPrecision(input.workplaceCurrency),
      );
    }

    const accountById = new Map(allAccounts.map(account => [account.id, account]));
    const domainItems = toDomainItems(items);
    const domainAllocations = toDomainAllocations(allocations);
    const roles = new Map<string, 'receivable' | 'payable'>();
    const states: AccountUnassignedState[] = [];

    for (const link of links) {
      const account = accountById.get(link.accountId);
      if (!account) continue;
      const role = roleForLinkedAccount(account);
      if (!role) continue;
      roles.set(account.id, role);
      if (!precisionByCurrency.has(account.currencyCode)) {
        precisionByCurrency.set(account.currencyCode, getCurrencyPrecision(account.currencyCode));
      }
      const balance = await balanceReadService.getAccountBalance(account.id, workplaceId);
      states.push(
        projectLinkedAccount({
          accountId: account.id,
          currencyCode: account.currencyCode,
          ledgerBalanceInNormalDirection: balance.balance,
          items: domainItems,
          allocations: domainAllocations,
        }),
      );
    }

    const placeholderExpenseId = asAccountId('__pending_expense__');
    const placeholderIncomeId = asAccountId('__pending_income__');

    const plan = planWeAreSettled({
      accounts: states,
      items: domainItems,
      activeAllocations: domainAllocations,
      roles,
      workplaceCurrency: input.workplaceCurrency,
      expenseAccountId: placeholderExpenseId,
      incomeAccountId: placeholderIncomeId,
      precisionByCurrency,
      exchangeRateByCurrency: input.exchangeRateByCurrency ?? new Map(),
    });

    if (plan.lines.length < 2) {
      throw new Error('Nothing to settle for this person');
    }

    let resolvedExpenseId: AccountId | undefined;
    let resolvedIncomeId: AccountId | undefined;
    const resolvedLines = await Promise.all(
      plan.lines.map(async line => {
        if (line.accountId === placeholderExpenseId) {
          resolvedExpenseId ??= (
            await ensurePersonAccountInSession(
              session,
              workplaceId,
              input.personId,
              'expense',
              input.workplaceCurrency,
            )
          ).id;
          return { ...line, accountId: resolvedExpenseId };
        }
        if (line.accountId === placeholderIncomeId) {
          resolvedIncomeId ??= (
            await ensurePersonAccountInSession(
              session,
              workplaceId,
              input.personId,
              'income',
              input.workplaceCurrency,
            )
          ).id;
          return { ...line, accountId: resolvedIncomeId };
        }
        return line;
      }),
    );

    const result = await journalPersistenceRepository.putInSession(
      session,
      {
        journalDate: input.journalDate ?? Date.now(),
        description: "We're settled",
        currencyCode: input.workplaceCurrency,
        status: JournalStatus.POSTED,
        transactions: resolvedLines,
      },
      workplaceId,
    );

    const itemById = new Map(items.map(item => [item.id as string, item]));
    await personWriteRepository.createSettlementAllocationsInSession(
      session,
      workplaceId,
      plan.allocations.flatMap(allocation => {
        const item = itemById.get(allocation.openItemId);
        if (!item) return [];
        return [
          {
            personId: input.personId,
            openItemId: item.id,
            settlementJournalId: result.journal.id,
            accountId: item.accountId,
            allocationKind: 'write_off' as const,
            amount: allocation.amount,
          },
        ];
      }),
    );

    return result.journal;
  });
}
