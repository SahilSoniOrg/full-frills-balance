import { AppConfig } from '@/src/constants/app-config';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { simulateDraftScenario } from '@/src/services/simulation/draftSimulationService';
import { TimeContext } from '@/src/services/simulation/TimeContext';
import type {
  SimulationBudget,
  SimulationLiabilityAccount,
  SimulationPlannedPayment,
} from '@/src/services/simulation/types';
import { PlannedPaymentInterval } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
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

export interface ClarityChartEvent {
  readonly name: string;
  readonly amount: number;
  readonly kind: 'INFLOW' | 'OUTFLOW' | 'TRANSFER';
}

export interface ClarityChartPoint {
  readonly x: number;
  readonly y: number;
  readonly events: readonly ClarityChartEvent[];
}

export function findSafeToSpendChartPoint(
  chart: readonly ClarityChartPoint[],
  safeToSpend: number,
): ClarityChartPoint | undefined {
  if (chart.length === 0) return undefined;
  const match = chart.find(point => Math.abs(point.y - safeToSpend) <= 0.01);
  if (match) return match;
  if (safeToSpend <= 0) return chart.find(point => point.y <= 0) ?? chart[0];
  return chart.reduce((lowest, point) => (point.y < lowest.y ? point : lowest));
}

export interface CashClarityProjection {
  readonly safeToSpend: number;
  readonly windowDays: number;
  readonly chart: readonly ClarityChartPoint[];
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

function simulationAccountId(account: DraftAccount): AccountId {
  return `draft-account-${account.id}` as AccountId;
}

function inWindow(dateMs: number, start: Dayjs, days: number): boolean {
  const offset = dayjs(dateMs).startOf('day').diff(start, 'day');
  return offset >= 0 && offset < days;
}

function primaryLiquidId(accounts: readonly DraftAccount[]): AccountId | undefined {
  const spendable = accounts.find(isSpendableAccount);
  return spendable ? simulationAccountId(spendable) : undefined;
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

  const startingBalances = new Map<AccountId, number>();
  const liquidIds: AccountId[] = [];
  const liabilityBalances: { account: SimulationLiabilityAccount; balance: number }[] = [];

  for (const account of draft.accounts) {
    const id = simulationAccountId(account);
    startingBalances.set(id, account.balance);
    if (isSpendableAccount(account)) liquidIds.push(id);
    if (account.kind === 'card' && account.balance > 0) {
      liabilityBalances.push({
        account: {
          id,
          name: account.name,
          accountSubtype: subtypeForAccount(account),
          currencyCode: currency,
        },
        balance: account.balance,
      });
    }
  }

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
      toAccountId: simulationAccountId(account),
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

  const { safeToSpend, flowSummary, projections } = simulateDraftScenario({
    simulationStartMs: start.valueOf(),
    simulationDays: windowDays,
    resultCurrency: currency,
    startingBalances,
    liquidAccountIds: liquidIds,
    liabilityBalances,
    plannedPayments,
    budgets,
    budgetCategoryMap,
  });
  const expectedIncomeInWindow = flowSummary.totalFutureInflow;
  const plannedOutflowInWindow = flowSummary.totalPlannedOutflow;
  const budgetReserve =
    draft.budget.kind === 'set'
      ? draft.budget.items.reduce((sum, item) => sum + item.amount, 0)
      : 0;
  const projectedRoom = liquidNow + expectedIncomeInWindow - plannedOutflowInWindow - budgetReserve;
  const heldNow = Math.max(0, Math.round((liquidNow - safeToSpend + Number.EPSILON) * 100) / 100);
  const { heldLabel, today, ahead } = clarityBeats(draft, {
    windowDays,
    start,
    liquidNow,
    heldNow,
    safeToSpend,
    projectedRoom,
  });

  return {
    safeToSpend,
    windowDays,
    chart: projections.map(point => ({
      x: point.timestamp,
      y: point.globalBalance,
      events: point.flows.map(flow => ({
        name: flow.label,
        amount: flow.amount,
        kind: flow.kind,
      })),
    })),
    liquidNow,
    expectedIncomeInWindow,
    plannedOutflowInWindow,
    budgetReserve,
    projectedRoom,
    heldNow,
    heldLabel,
    today,
    ahead,
    explanation: copy.clarityFooter,
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
