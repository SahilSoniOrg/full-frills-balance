import { accountQueryRepository } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import { convertAmount } from '@/src/services/currencyConversion';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import type { PlanningAccount, PlanningBudget } from './calculators/planning/planningContracts';
import { resolveComparisonPeriod } from './calculators/core/coreUtils';
import type { ReportBalanceInput } from './calculators/core/coreTypes';
import {
  DEFAULT_CURRENCY_VALUATION_POLICY,
  resolveCurrencyValuation,
} from './policy/currencyValuationPolicy';
import {
  readReportLedger,
  selectScopedLeafAccounts,
  type ReportLedgerSnapshot,
} from './reader/ledgerFactReader';
import { requestedReportSections, type ReportQuery, type ReportSectionId } from './types/query';
import type { ReportWarning } from './types/result';

export interface ReportBalanceRead {
  balances: ReportBalanceInput[];
  warnings: ReportWarning[];
}

export interface ReportBudgetRead {
  budgets: PlanningBudget[];
  warnings: ReportWarning[];
}

export interface ReportInputSnapshot {
  snapshot: ReportLedgerSnapshot;
  period: ReportQuery['period'];
  comparisonPeriod: ReturnType<typeof resolveComparisonPeriod>;
  currentFacts: ReportLedgerSnapshot['actualFacts'][number][];
  comparisonFacts: ReportLedgerSnapshot['actualFacts'][number][] | undefined;
  opening: ReportBalanceRead;
  closing: ReportBalanceRead;
  cashBalances: {
    openingBalances: ReportBalanceInput[];
    closingBalances: ReportBalanceInput[];
  };
  cashAccountIds: AccountId[];
  budgetRead: ReportBudgetRead;
  healthSnapshot: ReportLedgerSnapshot;
  planningAccounts: PlanningAccount[];
  healthAccounts: PlanningAccount[];
}

function hasSection(sections: ReadonlySet<ReportSectionId>, ...ids: ReportSectionId[]): boolean {
  return ids.some(id => sections.has(id));
}

function scopeLedgerSnapshot(
  snapshot: ReportLedgerSnapshot,
  query: ReportQuery,
): ReportLedgerSnapshot {
  const scopedAccountIds = new Set(
    selectScopedLeafAccounts(snapshot.accounts, query).map(account => account.id),
  );
  const scopeFacts = (facts: readonly ReportLedgerSnapshot['actualFacts'][number][]) =>
    facts.filter(fact => scopedAccountIds.has(fact.accountId));

  return {
    ...snapshot,
    actualFacts: scopeFacts(snapshot.actualFacts),
    plannedFacts: scopeFacts(snapshot.plannedFacts),
  };
}

function accountToPlanning(
  account: ReportLedgerSnapshot['accounts'][number],
  metadata?: {
    creditLimitAmount?: number;
    minimumPaymentAmount?: number;
    minimumPaymentPercent?: number;
    dueDay?: number;
    payFromAccountId?: AccountId;
  },
): PlanningAccount {
  return {
    id: account.id,
    name: account.name,
    accountType: account.accountType,
    accountSubtype: account.accountSubtype,
    currencyCode: account.currencyCode,
    parentAccountId: account.parentAccountId,
    archivedAt: account.archivedAt,
    metadata,
  };
}

async function readBalanceInputs(
  query: ReportQuery,
  snapshot: ReportLedgerSnapshot,
  asOfDate: number,
): Promise<ReportBalanceRead> {
  const accounts = selectScopedLeafAccounts(snapshot.accounts, query);
  const accountIds = accounts.map(account => account.id);
  if (accountIds.length === 0) return { balances: [], warnings: [] };
  const balances = await balanceReadService.getAccountBalances(
    query.workplaceId,
    asOfDate,
    undefined,
    undefined,
    accountIds,
  );
  const balanceById = new Map(balances.map(balance => [balance.accountId, balance]));
  const warnings: ReportWarning[] = [];
  const result: ReportBalanceInput[] = [];
  for (const account of accounts) {
    const balance = balanceById.get(account.id);
    if (!balance) continue;
    const valuation = resolveCurrencyValuation(DEFAULT_CURRENCY_VALUATION_POLICY, {
      purpose: 'BALANCE',
      sourceCurrencyCode: account.currencyCode,
      targetCurrencyCode: query.targetCurrency,
      periodEndpoint: asOfDate,
    });
    const converted = await convertAmount({
      amount: balance.balance,
      fromCurrency: account.currencyCode,
      toCurrency: query.targetCurrency,
      mode: 'historical',
      rateDate: valuation.rateDate,
    });
    if (!converted.ok) {
      warnings.push({
        code: 'MISSING_EXCHANGE_RATE',
        severity: 'WARNING',
        message: 'A point-in-time balance could not be valued in the report currency.',
        count: 1,
        accountIds: [account.id],
      });
      continue;
    }
    result.push({
      accountId: account.id,
      accountName: account.name,
      accountType: account.accountType,
      accountSubtype: account.accountSubtype,
      accountPath: account.id ? [account.id] : [],
      isLeafAccount: true,
      balance: balance.balance,
      reportCurrencyBalance: converted.amount,
      currencyCode: account.currencyCode,
    });
  }
  return { balances: result, warnings };
}

export async function readBudgets(
  workplaceId: ReportQuery['workplaceId'],
  targetCurrency: string,
  period: ReportQuery['period'],
  scopedAccountIds?: ReadonlySet<string>,
): Promise<ReportBudgetRead> {
  const budgets = await budgetRepository.findAllActive(workplaceId);
  const scopes = await budgetRepository.getScopesByBudgetIds(
    workplaceId,
    budgets.map(budget => budget.id),
  );
  const accountIdsByBudget = new Map<string, string[]>();
  for (const scope of scopes) {
    const ids = accountIdsByBudget.get(scope.budgetId) ?? [];
    ids.push(scope.accountId);
    accountIdsByBudget.set(scope.budgetId, ids);
  }
  const warnings: ReportWarning[] = [];
  const valuedBudgets: PlanningBudget[] = [];
  for (const budget of budgets) {
    const leafAccountIds = accountIdsByBudget.get(budget.id) ?? [];
    if (scopedAccountIds && !leafAccountIds.some(accountId => scopedAccountIds.has(accountId))) {
      continue;
    }
    const converted = await convertAmount({
      amount: budget.amount,
      fromCurrency: budget.currencyCode,
      toCurrency: targetCurrency,
      mode: 'historical',
      rateDate: period.endDate,
    });
    if (!converted.ok) {
      warnings.push({
        code: 'MISSING_EXCHANGE_RATE',
        severity: 'WARNING',
        message: 'A budget could not be valued in the report currency.',
        count: 1,
      });
      continue;
    }
    const startDate =
      budget.startDate ??
      (/^\d{4}-\d{2}$/.test(budget.startMonth)
        ? new Date(`${budget.startMonth}-01T00:00:00`).getTime()
        : undefined);
    valuedBudgets.push({
      id: budget.id,
      name: budget.name,
      amount: converted.amount,
      currencyCode: targetCurrency,
      intervalType: budget.intervalType,
      intervalN: budget.intervalN,
      startDate,
      recurrenceDay: budget.recurrenceDay,
      recurrenceMonth: budget.recurrenceMonth,
      leafAccountIds,
    });
  }
  return { budgets: valuedBudgets, warnings };
}

export async function readReportInputs(query: ReportQuery): Promise<ReportInputSnapshot> {
  const sections = requestedReportSections(query);
  const needsHealth = sections.has('health');
  const healthSnapshot = needsHealth
    ? await readReportLedger({
        ...query,
        accountIds: undefined,
        accountTypes: undefined,
        includeArchivedAccounts: true,
      })
    : undefined;
  const snapshot = healthSnapshot
    ? scopeLedgerSnapshot(healthSnapshot, query)
    : await readReportLedger(query);
  const period = query.period;
  const comparisonPeriod = resolveComparisonPeriod(query, period);
  const currentFacts = [...snapshot.actualFacts, ...snapshot.plannedFacts];
  const comparisonFacts = comparisonPeriod
    ? currentFacts.filter(
        fact =>
          fact.journalDate >= comparisonPeriod.startDate &&
          fact.journalDate <= comparisonPeriod.endDate,
      )
    : undefined;
  const scopedAccounts = selectScopedLeafAccounts(snapshot.accounts, query);
  const scopedAccountIds = new Set(scopedAccounts.map(account => account.id));
  const cashSubtypes: readonly AccountSubtype[] = [
    AccountSubtype.CASH,
    AccountSubtype.WALLET,
    AccountSubtype.BANK_CHECKING,
    AccountSubtype.BANK_SAVINGS,
    AccountSubtype.MONEY_MARKET,
  ];
  const isCashSubtype = (value: AccountSubtype | string | undefined): boolean =>
    value !== undefined && cashSubtypes.includes(value as AccountSubtype);
  const needsBalances = hasSection(
    sections,
    'overview',
    'cash-flow',
    'net-worth',
    'debt',
    'forecast',
  );
  const opening = needsBalances
    ? await readBalanceInputs(query, snapshot, Math.max(0, period.startDate - 1))
    : { balances: [], warnings: [] };
  const closing = needsBalances
    ? await readBalanceInputs(query, snapshot, period.endDate)
    : { balances: [], warnings: [] };
  const cashBalances = {
    openingBalances: opening.balances.filter(balance => isCashSubtype(balance.accountSubtype)),
    closingBalances: closing.balances.filter(balance => isCashSubtype(balance.accountSubtype)),
  };
  const cashAccountIds = scopedAccounts
    .filter(
      account => account.accountType === AccountType.ASSET && isCashSubtype(account.accountSubtype),
    )
    .map(account => account.id);
  const needsPlanning = hasSection(sections, 'debt', 'forecast');
  const [accountsMetadata, budgetRead] = await Promise.all([
    needsPlanning
      ? accountQueryRepository.findMetadataByAccountIds(
          query.workplaceId,
          scopedAccounts.map(account => account.id),
        )
      : Promise.resolve([]),
    sections.has('budgets')
      ? readBudgets(query.workplaceId, query.targetCurrency, period, scopedAccountIds)
      : Promise.resolve({ budgets: [], warnings: [] }),
  ]);
  const metadataByAccount = new Map(accountsMetadata.map(item => [item.accountId, item]));
  const planningAccounts = scopedAccounts.map(account =>
    accountToPlanning(account, metadataByAccount.get(account.id)),
  );
  const healthAccounts = (healthSnapshot ?? snapshot).accounts.map(account =>
    accountToPlanning(account),
  );

  return {
    snapshot,
    period,
    comparisonPeriod,
    currentFacts,
    comparisonFacts,
    opening,
    closing,
    cashBalances,
    cashAccountIds,
    budgetRead,
    healthSnapshot: healthSnapshot ?? snapshot,
    planningAccounts,
    healthAccounts,
  };
}
