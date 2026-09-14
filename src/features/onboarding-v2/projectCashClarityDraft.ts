import { AppConfig } from '@/src/constants/app-config';
import { ONBOARDING_V2_STRINGS as copy } from '@/src/constants/copy/domains/onboardingV2Strings';
import { budgetProjectionProvider } from '@/src/services/budget/budgetProjectionProvider';
import { plannedPaymentProjectionProvider } from '@/src/services/planned-payment/plannedPaymentProjectionProvider';
import { ProjectionComposer } from '@/src/services/simulation/ProjectionComposer';
import { SimulationReportGenerator } from '@/src/services/simulation/SimulationReportGenerator';
import { Simulator } from '@/src/services/simulation/Simulator';
import { TimeContext } from '@/src/services/simulation/TimeContext';
import { liabilityProjectionProvider } from '@/src/services/simulation/liability/liabilityProjectionProvider';
import type {
  SimulationBudget,
  SimulationContext,
  SimulationPlannedPayment,
} from '@/src/services/simulation/types';
import { AccountType, PlannedPaymentInterval } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import dayjs, { type Dayjs } from 'dayjs';
import {
  incomeItemName,
  isSpendableAccount,
  paymentItemName,
  subtypeForAccount,
  type CashClarityDraft,
  type DraftAccount,
} from './draft';

export interface ClarityBeat {
  readonly key: string;
  readonly label: string;
  readonly amount: number;
  readonly sign?: '+' | '-';
  readonly subtitle?: string;
  readonly emphasize?: boolean;
}

export interface CashClarityProjection {
  readonly safeToSpend: number;
  readonly windowDays: number;
  readonly liquidNow: number;
  readonly expectedIncomeInWindow: number;
  readonly plannedOutflowInWindow: number;
  readonly budgetReserve: number;
  readonly projectedRoom: number;
  readonly heldNow: number;
  readonly heldLabel: string;
  readonly today: readonly ClarityBeat[];
  readonly ahead: readonly ClarityBeat[];
  readonly explanation: string;
  readonly omitted: readonly string[];
}

const INCOME_CATEGORY_ID = 'draft-income' as AccountId;
const COMMITMENT_CATEGORY_ID = 'draft-commitment' as AccountId;

function accountId(account: DraftAccount): AccountId {
  return `draft-account-${account.id}` as AccountId;
}

function toFields(account: DraftAccount, currency: string): AccountFields {
  return {
    id: accountId(account),
    name: account.name,
    accountType: account.kind === 'card' ? AccountType.LIABILITY : AccountType.ASSET,
    accountSubtype: subtypeForAccount(account),
    currencyCode: currency,
  };
}

function inWindow(dateMs: number, start: Dayjs, days: number): boolean {
  const offset = dayjs(dateMs).startOf('day').diff(start, 'day');
  return offset >= 0 && offset < days;
}

function primaryLiquidId(accounts: readonly DraftAccount[]): AccountId | undefined {
  const spendable = accounts.find(isSpendableAccount);
  return spendable ? accountId(spendable) : undefined;
}

export function projectCashClarityDraft(
  draft: CashClarityDraft,
  now: Dayjs = dayjs(),
): CashClarityProjection {
  const windowDays = AppConfig.defaults.safeToSpendDays;
  const time = new TimeContext(now, windowDays);
  const start = time.getStartOfToday();
  const currency = draft.currency;
  const omitted: string[] = [];

  const accountMap = new Map<AccountId, AccountFields>();
  const startingBalances = new Map<AccountId, number>();
  const liquidIds: AccountId[] = [];
  const liabilityBalances: { account: AccountFields; balance: number }[] = [];

  for (const account of draft.accounts) {
    const fields = toFields(account, currency);
    accountMap.set(fields.id, fields);
    startingBalances.set(fields.id, account.balance);
    if (isSpendableAccount(account)) liquidIds.push(fields.id);
    if (account.kind === 'card' && account.balance > 0) {
      liabilityBalances.push({ account: fields, balance: account.balance });
    }
  }

  accountMap.set(INCOME_CATEGORY_ID, {
    id: INCOME_CATEGORY_ID,
    name: 'Salary',
    accountType: AccountType.INCOME,
    currencyCode: currency,
  });
  accountMap.set(COMMITMENT_CATEGORY_ID, {
    id: COMMITMENT_CATEGORY_ID,
    name: 'Planned payment',
    accountType: AccountType.EXPENSE,
    currencyCode: currency,
  });

  const liquidNow = draft.accounts
    .filter(isSpendableAccount)
    .reduce((sum, account) => sum + account.balance, 0);

  const payFrom = primaryLiquidId(draft.accounts);
  const plannedPayments: SimulationPlannedPayment[] = [];

  if (draft.income.kind === 'recurring' && payFrom) {
    draft.income.items.forEach(item => {
      if (!inWindow(item.nextDate, start, windowDays)) return;
      plannedPayments.push({
        id: `draft-income-${item.id}`,
        name: incomeItemName(item),
        amount: item.amount,
        currencyCode: currency,
        fromAccountId: INCOME_CATEGORY_ID,
        toAccountId: payFrom,
        nextOccurrence: item.nextDate,
        intervalType: item.interval,
        intervalN: item.intervalN,
        recurrenceDay: dayjs(item.nextDate).date(),
      });
    });
  } else if (draft.income.kind === 'skipped') {
    omitted.push(copy.noIncomeIncluded);
  }

  if (draft.commitment.kind === 'payment' && payFrom) {
    draft.commitment.items.forEach(item => {
      if (!inWindow(item.dueDate, start, windowDays)) return;
      plannedPayments.push({
        id: `draft-commitment-${item.id}`,
        name: paymentItemName(item),
        amount: item.amount,
        currencyCode: currency,
        fromAccountId: payFrom,
        toAccountId: COMMITMENT_CATEGORY_ID,
        nextOccurrence: item.dueDate,
        intervalType: PlannedPaymentInterval.MONTHLY,
        intervalN: 1,
        recurrenceDay: dayjs(item.dueDate).date(),
      });
    });
  } else if (draft.commitment.kind === 'skipped') {
    omitted.push(copy.noPaymentIncluded);
  }

  for (const account of draft.accounts) {
    if (
      account.kind !== 'card' ||
      !account.cardPaymentAmount ||
      !account.cardPaymentDate ||
      !payFrom
    ) {
      continue;
    }
    if (!inWindow(account.cardPaymentDate, start, windowDays)) continue;
    plannedPayments.push({
      id: `draft-card-pay-${account.id}`,
      name: 'Card payment',
      amount: account.cardPaymentAmount,
      currencyCode: currency,
      fromAccountId: payFrom,
      toAccountId: accountId(account),
      nextOccurrence: account.cardPaymentDate,
      intervalType: PlannedPaymentInterval.MONTHLY,
      intervalN: 1,
      recurrenceDay: dayjs(account.cardPaymentDate).date(),
    });
  }

  const budgets: SimulationBudget[] = [];
  const budgetCategoryMap = new Map<string, Set<string>>();
  if (draft.budget.kind === 'set' && payFrom) {
    draft.budget.items.forEach(item => {
      const budgetId = `draft-budget-${item.id}`;
      const categoryId = `draft-budget-cat-${item.id}` as AccountId;
      accountMap.set(categoryId, {
        id: categoryId,
        name: item.name,
        accountType: AccountType.EXPENSE,
        currencyCode: currency,
      });
      budgets.push({
        id: budgetId,
        name: item.name,
        amount: item.amount,
        currencyCode: currency,
        assetAccountIds: payFrom,
        intervalType: PlannedPaymentInterval.MONTHLY,
        intervalN: 1,
        startDate: start.startOf('month').valueOf(),
        recurrenceDay: 1,
      });
      budgetCategoryMap.set(budgetId, new Set([categoryId]));
    });
  } else if (draft.budget.kind === 'skipped') {
    omitted.push(copy.noBufferIncluded);
  }

  const context: SimulationContext = {
    simulationStartMs: start.valueOf(),
    simulationDays: windowDays,
    simulationEndMs: time.getEndMs(),
    resultCurrency: currency,
    liquidAccountIds: new Set(liquidIds),
    orderedLiquidAccountIds: liquidIds,
    liabilityAccountIds: new Set(liabilityBalances.map(item => item.account.id)),
    accountMap,
    convert: amount => amount,
  };

  const expenseAccountIds = new Set(
    [...accountMap.values()]
      .filter(account => account.accountType === AccountType.EXPENSE)
      .map(account => account.id),
  );

  const scheduled = plannedPaymentProjectionProvider.projectScheduled(context, {
    plannedPayments,
    projectablePlannedJournals: [],
    expenseAccountIds,
    journalTransactionsMap: new Map(),
  });

  const capacities = budgetProjectionProvider.projectCapacities(
    context,
    budgets,
    budgets.map(budget => ({
      spent: 0,
      remaining: budget.amount,
      budgetAmount: budget.amount,
      usagePercent: 0,
    })),
    budgetCategoryMap,
  );

  const resolvedSpending = ProjectionComposer.composeSpending(capacities, scheduled, context);
  const liabilityFlows = liabilityProjectionProvider.projectLiabilityFlows(context, {
    liabilityBalances,
    metadataMap: new Map(),
    statementBalances: new Map(),
    settledSinceStatement: new Map(),
    previousFlows: resolvedSpending,
  });
  const allFlows = ProjectionComposer.sortTimeline([...resolvedSpending, ...liabilityFlows]);
  const simulation = Simulator.simulate(
    startingBalances,
    allFlows,
    windowDays,
    context.liquidAccountIds,
    liquidIds,
    0,
    start.valueOf(),
  );
  const report = SimulationReportGenerator.generate(
    allFlows,
    accountMap,
    liabilityBalances,
    context.liquidAccountIds,
  );

  const expectedIncomeInWindow = report.summary.totalFutureInflow;
  const plannedOutflowInWindow = report.summary.totalPlannedOutflow;
  const budgetReserve =
    draft.budget.kind === 'set'
      ? draft.budget.items.reduce((sum, item) => sum + item.amount, 0)
      : 0;
  const projectedRoom = liquidNow + expectedIncomeInWindow - plannedOutflowInWindow - budgetReserve;
  const heldNow = Math.max(
    0,
    Math.round((liquidNow - simulation.summary.safeToSpend + Number.EPSILON) * 100) / 100,
  );
  const { heldLabel, today, ahead } = clarityBeats(draft, {
    windowDays,
    start,
    liquidNow,
    heldNow,
    safeToSpend: simulation.summary.safeToSpend,
    projectedRoom,
  });

  return {
    safeToSpend: simulation.summary.safeToSpend,
    windowDays,
    liquidNow,
    expectedIncomeInWindow,
    plannedOutflowInWindow,
    budgetReserve,
    projectedRoom,
    heldNow,
    heldLabel,
    today,
    ahead,
    explanation: copy.clarityCallout,
    omitted,
  };
}

function formatDay(dateMs: number): string {
  return dayjs(dateMs).format('D MMM');
}

function paymentBeatSubtitle(dueDate: number, firstIncome?: number): string {
  const date = formatDay(dueDate);
  if (!firstIncome) return copy.clarityPaymentOnly(date);
  if (dueDate < firstIncome) return copy.clarityPaymentBefore(date);
  return copy.clarityPaymentAfter(date);
}

function clarityBeats(
  draft: CashClarityDraft,
  numbers: {
    readonly windowDays: number;
    readonly start: Dayjs;
    readonly liquidNow: number;
    readonly heldNow: number;
    readonly safeToSpend: number;
    readonly projectedRoom: number;
  },
): {
  readonly heldLabel: string;
  readonly today: readonly ClarityBeat[];
  readonly ahead: readonly ClarityBeat[];
} {
  const incomeItems = draft.income.kind === 'recurring' ? draft.income.items : [];
  const paymentItems = draft.commitment.kind === 'payment' ? draft.commitment.items : [];
  const budgetItems = draft.budget.kind === 'set' ? draft.budget.items : [];
  const firstIncome = incomeItems.reduce<number | undefined>((soonest, item) => {
    if (soonest === undefined || item.nextDate < soonest) return item.nextDate;
    return soonest;
  }, undefined);
  const heldLabel = firstIncome ? copy.clarityHeld : copy.clarityHeldNoIncome;

  const today: ClarityBeat[] = [
    { key: 'cash', label: copy.cashYouHave, amount: numbers.liquidNow },
  ];
  if (numbers.heldNow > 0) {
    today.push({ key: 'held', label: heldLabel, amount: numbers.heldNow, sign: '-' });
  }
  today.push({
    key: 'sts',
    label: copy.safeToSpend,
    amount: numbers.safeToSpend,
    emphasize: true,
  });

  const ahead: ClarityBeat[] = [
    ...incomeItems.map(item => ({
      key: item.id,
      label: incomeItemName(item),
      amount: item.amount,
      sign: '+' as const,
      subtitle: inWindow(item.nextDate, numbers.start, numbers.windowDays)
        ? copy.clarityIncomeSubtitle(formatDay(item.nextDate))
        : copy.clarityIncomeOutside,
    })),
    ...paymentItems.map(item => ({
      key: item.id,
      label: paymentItemName(item),
      amount: item.amount,
      sign: '-' as const,
      subtitle: paymentBeatSubtitle(item.dueDate, firstIncome),
    })),
    ...budgetItems.map(item => ({
      key: item.id,
      label: item.category === 'Food' || item.name === 'Food' ? copy.foodBuffer : item.name,
      amount: item.amount,
      sign: '-' as const,
      subtitle: firstIncome ? copy.clarityBufferSubtitle : copy.clarityBufferNoIncome,
    })),
  ];
  if (ahead.length > 0) {
    ahead.push({
      key: 'room',
      label: copy.projectedRoom,
      amount: numbers.projectedRoom,
      emphasize: true,
    });
  }

  return { heldLabel, today, ahead };
}
