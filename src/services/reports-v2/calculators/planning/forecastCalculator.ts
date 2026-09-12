import type {
  ForecastInput,
  ForecastResult,
  ForecastTimelinePoint,
  PlanningAccount,
  PlanningFact,
} from './planningContracts';
import {
  dateKey,
  inPeriod,
  lookupNumber,
  periodDayTimestamps,
  roundAmount,
  selectActualFacts,
  selectPlannedFacts,
  signedDelta,
  upper,
} from './planningUtils';

function inferredCashIds(accounts: readonly PlanningAccount[] | undefined): string[] {
  return (accounts ?? [])
    .filter(
      account =>
        account.isCashEquivalent ||
        (upper(account.accountType) === 'ASSET' &&
          ['CASH', 'WALLET', 'BANK_CHECKING', 'BANK_SAVINGS', 'MONEY_MARKET'].includes(
            upper(account.accountSubtype),
          )),
    )
    .map(account => account.id);
}

function factMovement(
  facts: readonly PlanningFact[],
  cashIds: readonly string[],
  period: ForecastInput['period'],
): number {
  return facts
    .filter(fact => cashIds.includes(fact.accountId) && inPeriod(fact, period))
    .reduce((total, fact) => total + signedDelta(fact), 0);
}

export function calculateForecast(input: ForecastInput): ForecastResult {
  const precision = input.precision ?? 2;
  const cashAccountIds = Array.from(input.cashAccountIds ?? inferredCashIds(input.accounts));
  const actual = selectActualFacts(input);
  const planned = selectPlannedFacts(input);
  const startingCashBalance =
    input.startingCashBalance ??
    cashAccountIds.reduce(
      (total, id) => total + (lookupNumber(input.startingCashBalances, id) ?? 0),
      0,
    );
  let actualBalance = startingCashBalance;
  let projectedBalance = startingCashBalance;
  const warnings: ForecastResult['warnings'] = [];
  const timeline: ForecastTimelinePoint[] = periodDayTimestamps(input.period).map(timestamp => {
    const dayPeriod = { startDate: timestamp, endDate: timestamp };
    const actualNetMovement = factMovement(actual, cashAccountIds, dayPeriod);
    const plannedNetMovement = factMovement(planned, cashAccountIds, dayPeriod);
    const actualInflow = Math.max(0, actualNetMovement);
    const actualOutflow = Math.max(0, -actualNetMovement);
    const plannedInflow = Math.max(0, plannedNetMovement);
    const plannedOutflow = Math.max(0, -plannedNetMovement);
    actualBalance = roundAmount(actualBalance + actualNetMovement, precision);
    projectedBalance = roundAmount(
      projectedBalance + actualNetMovement + plannedNetMovement,
      precision,
    );
    if (input.lowBalanceThreshold !== undefined && projectedBalance < input.lowBalanceThreshold) {
      warnings.push({
        code: 'LOW_PROJECTED_BALANCE',
        date: dateKey(timestamp),
        balance: projectedBalance,
        threshold: input.lowBalanceThreshold,
      });
    }
    return {
      date: dateKey(timestamp),
      timestamp,
      actualInflow: roundAmount(actualInflow, precision),
      actualOutflow: roundAmount(actualOutflow, precision),
      actualNetMovement: roundAmount(actualNetMovement, precision),
      plannedInflow: roundAmount(plannedInflow, precision),
      plannedOutflow: roundAmount(plannedOutflow, precision),
      plannedNetMovement: roundAmount(plannedNetMovement, precision),
      actualBalance,
      projectedBalance,
    };
  });
  const upcoming = planned
    .filter(fact => cashAccountIds.includes(fact.accountId) && inPeriod(fact, input.period))
    .sort((left, right) => left.journalDate - right.journalDate)
    .map(fact => ({
      journalId: fact.journalId,
      date: dateKey(fact.journalDate),
      timestamp: fact.journalDate,
      amount: roundAmount(signedDelta(fact), precision),
      plannedPaymentId: fact.plannedPaymentId,
      description: fact.description,
    }));
  const actualInflow = timeline.reduce((total, point) => total + point.actualInflow, 0);
  const actualOutflow = timeline.reduce((total, point) => total + point.actualOutflow, 0);
  const plannedInflow = timeline.reduce((total, point) => total + point.plannedInflow, 0);
  const plannedOutflow = timeline.reduce((total, point) => total + point.plannedOutflow, 0);
  return {
    cashAccountIds,
    startingCashBalance: roundAmount(startingCashBalance, precision),
    timeline,
    upcoming,
    warnings,
    totals: {
      actualInflow: roundAmount(actualInflow, precision),
      actualOutflow: roundAmount(actualOutflow, precision),
      actualNetMovement: roundAmount(actualInflow - actualOutflow, precision),
      plannedInflow: roundAmount(plannedInflow, precision),
      plannedOutflow: roundAmount(plannedOutflow, precision),
      plannedNetMovement: roundAmount(plannedInflow - plannedOutflow, precision),
      endingActualBalance: roundAmount(actualBalance, precision),
      endingProjectedBalance: roundAmount(projectedBalance, precision),
    },
  };
}
