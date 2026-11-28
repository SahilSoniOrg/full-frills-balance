import {
  runAccountingWriteSession,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import {
  balanceRebuildIntentRepository,
  type BalanceRebuildClaim,
} from '@/src/data/repositories/BalanceRebuildIntentRepository';
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
} from '@/src/domain/people';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { fromMinorUnits, toMinorUnits } from '@/src/domain/money/money';
import type Journal from '@/src/data/models/Journal';
import { currencyReadService } from '@/src/services/currency-read-service';
import { preferences } from '@/src/services/preferences';
import { JournalStatus } from '@/src/types/enums';
import type { AccountId, JournalId, OpenItemId, PersonId, WorkplaceId } from '@/src/types/ids';
import { asAccountId } from '@/src/types/ids';
import type { JournalWriteLine } from '@/src/types/journalWrite';
import { ensurePersonAccountInSession } from './peopleLifecycleCommands';
import { asDomainItems, asDomainAllocations, repaymentCandidates } from './peopleReadService';
import { debtAccountRole, readPersonLedgerBalance } from './peopleLedgerReads';
import {
  availableRepaymentMinorUnits,
  isRepaymentJournal,
} from '@/src/domain/people/personRepaymentPolicy';
import { allocatePersonRepaymentMinorUnits } from '@/src/domain/people/personRepaymentAllocation';
import { assertExpectedJournalSnapshot } from '@/src/data/repositories/journal/journalAuditGuard';

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
  expectedJournalUpdatedAt?: number;
  expectedCurrent?: Record<string, unknown>;
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
  expectedPlan?: {
    lines: readonly JournalWriteLine[];
    allocations: readonly { openItemId: string; amount: number }[];
  };
}

function settlementPlanKey(plan: {
  lines: readonly JournalWriteLine[];
  allocations: readonly { openItemId: string; amount: number }[];
}): string {
  return JSON.stringify({
    lines: plan.lines
      .map(line => [
        line.accountId,
        line.amount,
        line.transactionType,
        line.currencyCode,
        line.exchangeRate ?? 1,
      ])
      .sort(),
    allocations: plan.allocations.map(a => [a.openItemId, a.amount]).sort(),
  });
}

const pendingExpenseId = asAccountId('__pending_expense__');
const pendingIncomeId = asAccountId('__pending_income__');

async function readSettlementFacts(workplaceId: WorkplaceId, personId: PersonId) {
  const [links, items, allocations, precisionByCurrency] = await Promise.all([
    personQueryRepository.listPersonAccounts(workplaceId, personId),
    personQueryRepository.listOpenItems(workplaceId, { personId }),
    personQueryRepository.listSettlementAllocations(workplaceId, { personId, activeOnly: true }),
    currencyReadService.getAllPrecisions(),
  ]);
  const [accounts, origins] = await Promise.all([
    accountQueryRepository.findAllByIds(
      workplaceId,
      links.map(link => link.accountId),
    ),
    journalQueryRepository.findByIds(workplaceId, [
      ...new Set(items.map(item => item.originatingJournalId)),
    ]),
  ]);
  const dates = new Map(origins.map(journal => [journal.id, journal.journalDate]));
  const domainItems = asDomainItems(items).map(item => ({
    ...item,
    journalDate: dates.get(item.originatingJournalId),
  }));
  const activeAllocations = asDomainAllocations(allocations);
  const roles = new Map<string, 'receivable' | 'payable'>();
  const states = await Promise.all(
    accounts
      .filter(account => {
        const role = debtAccountRole(account.accountType);
        if (role) roles.set(account.id, role);
        return role !== undefined;
      })
      .map(async account =>
        projectLinkedAccount({
          accountId: account.id,
          currencyCode: account.currencyCode,
          ledgerBalanceInNormalDirection: await readPersonLedgerBalance(
            workplaceId,
            account,
            precisionByCurrency,
          ),
          items: domainItems,
          allocations: activeAllocations,
          precision: precisionByCurrency.get(account.currencyCode),
        }),
      ),
  );
  return { accounts, items: domainItems, activeAllocations, states, roles, precisionByCurrency };
}

function buildClosingPlan(
  facts: Awaited<ReturnType<typeof readSettlementFacts>>,
  workplaceCurrency: string,
  exchangeRateByCurrency: ReadonlyMap<string, number>,
) {
  return planWeAreSettled({
    accounts: facts.states,
    items: facts.items,
    activeAllocations: facts.activeAllocations,
    roles: facts.roles,
    precisionByCurrency: facts.precisionByCurrency,
    workplaceCurrency,
    expenseAccountId: pendingExpenseId,
    incomeAccountId: pendingIncomeId,
    exchangeRateByCurrency,
  });
}

export async function previewPersonSettlement(
  workplaceId: WorkplaceId,
  personId: PersonId,
  workplaceCurrency: string,
  exchangeRateByCurrency: ReadonlyMap<string, number>,
) {
  const facts = await readSettlementFacts(workplaceId, personId);
  const foreignCurrencies = [
    ...new Set(
      facts.states
        .filter(
          state =>
            state.currencyCode !== workplaceCurrency && state.ledgerBalanceInNormalDirection > 0,
        )
        .map(state => state.currencyCode),
    ),
  ];
  try {
    const plan = buildClosingPlan(facts, workplaceCurrency, exchangeRateByCurrency);
    const residual = plan.lines.find(
      line => line.accountId === pendingIncomeId || line.accountId === pendingExpenseId,
    );
    return {
      foreignCurrencies,
      plan,
      closingResidual: residual?.amount ?? 0,
      forgivenAccountType:
        residual?.accountId === pendingIncomeId ? ('Income' as const) : ('Expense' as const),
      blockedReason: plan.lines.length < 2 ? 'Nothing open to close' : undefined,
    };
  } catch (error) {
    return {
      foreignCurrencies,
      plan: undefined,
      closingResidual: 0,
      forgivenAccountType: 'Expense' as const,
      blockedReason: error instanceof Error ? error.message : 'Cannot preview settlement',
    };
  }
}

/** Run the opt-in follow-up while its persisted rebuild request is still current. */
export async function settlePeopleForRebuildClaim(claim: BalanceRebuildClaim) {
  const { workplaceId, accountId, peopleSettlementJournalDate } = claim;
  if (
    peopleSettlementJournalDate == null ||
    !preferences.workplace.getSnapshot(workplaceId).autoSettlePeopleBalances
  )
    return;
  await runAccountingWriteSession(async session => {
    if (!(await balanceRebuildIntentRepository.findCurrent(claim))) return;
    const link = await personQueryRepository.findPersonAccountByAccountId(workplaceId, accountId);
    if (!link) return;
    await autoSettlePersonInSession(
      session,
      workplaceId,
      link.personId,
      peopleSettlementJournalDate,
    );
  });
}

/** Runs same-currency auto-settle inside an open write session when Workplace opt-in is enabled. */
async function autoSettlePersonInSession(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  personId: PersonId,
  journalDate = Date.now(),
): Promise<Journal | null> {
  if (!preferences.workplace.getSnapshot(workplaceId).autoSettlePeopleBalances) {
    return null;
  }

  const facts = await readSettlementFacts(workplaceId, personId);
  if (facts.states.some(state => state.hasNegativeUnassignedRemainder)) return null;
  const plan = planAutoSettle({
    items: facts.items,
    accounts: facts.states,
    roles: facts.roles,
    activeAllocations: facts.activeAllocations,
    precisionByCurrency: facts.precisionByCurrency,
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
    const itemIdsInCurrency = new Set<string>(
      facts.items.filter(item => item.currencyCode === currencyCode).map(item => item.id),
    );
    const result = await journalPersistenceRepository.putInSession(
      session,
      {
        journalDate,
        description: 'Auto-settle People balances',
        skipPeopleAutoSettlement: true,
        currencyCode,
        status: JournalStatus.POSTED,
        transactions: lines,
      },
      workplaceId,
    );
    lastJournal = result.journal;
    const currencyAllocations = plan.allocations.filter(a => itemIdsInCurrency.has(a.openItemId));
    const itemById = new Map(facts.items.map(item => [String(item.id), item]));
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
    const [targetAccount, existingLink, items, allocations, precisionByCurrency, existingJournal] =
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
        currencyReadService.getAllPrecisions(),
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

    const role = debtAccountRole(targetAccount.accountType);
    if (!role) throw new Error('Target account must be a receivable or payable account');
    const existingTransactions = existingJournal
      ? await transactionQueryRepository.findByJournal(workplaceId, existingJournal.id)
      : [];
    const journalCurrency = existingJournal?.currencyCode ?? input.journalCurrency;
    const precision =
      precisionByCurrency.get(targetAccount.currencyCode) ??
      getCurrencyPrecision(targetAccount.currencyCode);
    let cashAmount = input.cashAmount;
    let existingCashLine: (typeof existingTransactions)[number] | undefined;
    if (existingJournal) {
      assertExpectedJournalSnapshot(input.expectedCurrent, existingJournal, existingTransactions);
      if (
        (input.expectedJournalUpdatedAt !== undefined &&
          existingJournal.updatedAt?.getTime() !== input.expectedJournalUpdatedAt) ||
        existingJournal.currencyCode !== input.journalCurrency ||
        input.cashAccountId === input.targetAccountId
      ) {
        throw new Error('This movement changed. Review it again before matching.');
      }
      const [accounts, links, priorAllocations] = await Promise.all([
        accountQueryRepository.findAllByIds(
          workplaceId,
          existingTransactions.map(tx => tx.accountId),
        ),
        personQueryRepository.listPersonAccountsForAccounts(
          workplaceId,
          existingTransactions.map(tx => tx.accountId),
        ),
        personQueryRepository.listSettlementAllocations(workplaceId, {
          settlementJournalId: existingJournal.id,
          activeOnly: true,
        }),
      ]);
      const match = repaymentCandidates(
        existingJournal,
        existingTransactions,
        new Map(accounts.map(account => [account.id, account])),
        new Map(links.map(link => [link.accountId, link.personId])),
        [targetAccount],
        input.personId,
        precisionByCurrency,
      ).find(candidate => candidate.cashAccountId === input.cashAccountId);
      const cashPrecision =
        precisionByCurrency.get(match?.cashCurrencyCode ?? journalCurrency) ??
        getCurrencyPrecision(match?.cashCurrencyCode ?? journalCurrency);
      if (
        !match ||
        priorAllocations.length ||
        toMinorUnits(match.cashAmount, cashPrecision) !==
          toMinorUnits(input.cashAmount, cashPrecision)
      ) {
        throw new Error('This movement is no longer eligible for matching');
      }
      existingCashLine = existingTransactions.find(tx => tx.id === match.id);
      cashAmount = match.journalAmount;
    }

    const domainItems = asDomainItems(items);
    const domainAllocations = asDomainAllocations(allocations);
    const targetState = projectLinkedAccount({
      accountId: targetAccount.id,
      currencyCode: targetAccount.currencyCode,
      ledgerBalanceInNormalDirection: await readPersonLedgerBalance(
        workplaceId,
        targetAccount,
        precisionByCurrency,
      ),
      items: domainItems,
      allocations: domainAllocations,
      precision,
    });
    const isSameCurrency =
      targetAccount.currencyCode.trim().toUpperCase() === journalCurrency.trim().toUpperCase();

    let plan;
    if (isSameCurrency) {
      const alreadyReduced = existingTransactions.some(
        tx =>
          tx.accountId === targetAccount.id &&
          classifyPersonDebtPosting({
            accountType: targetAccount.accountType,
            transactionType: tx.transactionType,
          }) === 'reducing',
      );
      plan = planSameCurrencyRepayment({
        cashAccountId: input.cashAccountId,
        targetAccountId: targetAccount.id,
        items: domainItems,
        activeAllocations: domainAllocations,
        assigned: input.allocations,
        unassignedAmount: input.unassignedAmount ?? 0,
        repaymentLegAmount: cashAmount,
        currencyCode: targetAccount.currencyCode,
        target: alreadyReduced
          ? { ...targetState, hasNegativeUnassignedRemainder: false }
          : targetState,
        role,
        precision,
      });
    } else {
      const openItem = domainItems.find(item => item.id === input.allocations[0]?.openItemId);
      if (!openItem) throw new Error('Cross-currency repayment requires an open item');
      if (!input.exchangeRate || !Number.isFinite(input.exchangeRate) || input.exchangeRate <= 0) {
        throw new Error('Explicit positive exchange rate is required for cross-currency repayment');
      }
      for (const code of [journalCurrency, targetAccount.currencyCode]) {
        if (!precisionByCurrency.has(code))
          precisionByCurrency.set(code, getCurrencyPrecision(code));
      }
      plan = planCrossCurrencyRepayment({
        cashAccountId: input.cashAccountId,
        openItem,
        cashAmount,
        exchangeRate: input.exchangeRate,
        journalCurrency,
        precisionByCurrency,
        targetAmount: input.targetAmount,
        role,
        activeAllocations: domainAllocations,
        items: domainItems,
        assigned: input.allocations,
      });
    }

    const result = await journalPersistenceRepository.putInSession(
      session,
      {
        ...(input.existingJournalId ? { journalId: input.existingJournalId } : {}),
        journalDate: existingJournal?.journalDate ?? input.journalDate,
        description: input.description ?? existingJournal?.description ?? 'Repayment',
        notes: input.notes ?? existingJournal?.notes,
        currencyCode: journalCurrency,
        status: JournalStatus.POSTED,
        repaymentAllocation: {
          personId: input.personId,
          targetAccountId: targetAccount.id,
          allocations: input.allocations,
        },
        transactions: existingCashLine
          ? plan.lines.map(line =>
              line.accountId === input.cashAccountId
                ? {
                    ...line,
                    amount: existingCashLine!.amount,
                    transactionType: existingCashLine!.transactionType,
                    currencyCode: existingCashLine!.currencyCode,
                    exchangeRate: existingCashLine!.exchangeRate,
                    notes: existingCashLine!.notes,
                  }
                : line,
            )
          : plan.lines,
      },
      workplaceId,
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
    const [targetAccount, link, journal, txs, items, existingAllocations, precisionByCurrency] =
      await Promise.all([
        accountQueryRepository.find(workplaceId, input.targetAccountId),
        personQueryRepository.findPersonAccountByAccountId(workplaceId, input.targetAccountId),
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
        currencyReadService.getAllPrecisions(),
      ]);
    if (!targetAccount || link?.personId !== input.personId)
      throw new Error('Person account is no longer available');
    if (!journal || !isRepaymentJournal(journal))
      throw new Error('This journal cannot be applied as a repayment');

    const precision =
      precisionByCurrency.get(targetAccount.currencyCode) ??
      getCurrencyPrecision(targetAccount.currencyCode);
    const reducingLegUnits = txs
      .filter(
        tx =>
          tx.accountId === targetAccount.id &&
          classifyPersonDebtPosting({
            accountType: targetAccount.accountType,
            transactionType: tx.transactionType,
          }) === 'reducing',
      )
      .reduce((total, tx) => total + toMinorUnits(tx.amount, precision), 0);
    const available = availableRepaymentMinorUnits(
      reducingLegUnits,
      existingAllocations.filter(
        row => row.settlementJournalId === journal.id && row.accountId === targetAccount.id,
      ),
      precision,
    );
    const domainAllocations = asDomainAllocations(existingAllocations);
    allocatePersonRepaymentMinorUnits({
      amountMinor: available,
      items: asDomainItems(items).map(item => ({
        openItemId: item.id,
        availableMinor: Math.max(
          0,
          toMinorUnits(openItemRemainder(item, domainAllocations, precision), precision),
        ),
        journalDate: item.createdAt ?? 0,
        createdAt: item.createdAt ?? 0,
        id: item.id,
      })),
      requestedAllocations: input.allocations.map(row => ({
        openItemId: row.openItemId,
        amountMinor: toMinorUnits(row.amount, precision),
      })),
    });

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
    const facts = await readSettlementFacts(workplaceId, input.personId);
    const plan = buildClosingPlan(
      facts,
      input.workplaceCurrency,
      input.exchangeRateByCurrency ?? new Map(),
    );

    if (input.expectedPlan && settlementPlanKey(input.expectedPlan) !== settlementPlanKey(plan)) {
      throw new Error(
        'Balances changed since the preview. Review the updated settlement before confirming.',
      );
    }

    if (plan.lines.length < 2) {
      throw new Error('Nothing to settle for this person');
    }

    let resolvedExpenseId: AccountId | undefined;
    let resolvedIncomeId: AccountId | undefined;
    const resolvedLines = await Promise.all(
      plan.lines.map(async line => {
        if (line.accountId === pendingExpenseId) {
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
        if (line.accountId === pendingIncomeId) {
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
        skipPeopleAutoSettlement: true,
        currencyCode: input.workplaceCurrency,
        status: JournalStatus.POSTED,
        transactions: resolvedLines,
      },
      workplaceId,
    );

    const itemById = new Map(facts.items.map(item => [String(item.id), item]));
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
