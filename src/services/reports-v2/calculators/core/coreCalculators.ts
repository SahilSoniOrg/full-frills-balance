import { AccountType, SemanticType } from '@/src/types/enums';
import type {
  BalanceGroup,
  BalanceState,
  CalculatorInput,
  CashFlowGroup,
  CashFlowResult,
  IncomeGroup,
  IncomeResult,
  NetWorthCalculatorInput,
  NetWorthHistoryPoint,
  NetWorthResult,
  OverviewResult,
  ReportBalanceInput,
  ReportBucket,
  ReportGroup,
  SpendingGroup,
  SpendingResult,
  ReportingFact,
} from './coreTypes';
import {
  balancePath,
  bucketForDate,
  comparisonMetric,
  factsInPeriod,
  granularityFor,
  isBalanceLeaf,
  isCreditCardFact,
  isDebtPaymentSemantic,
  isExpenseFact,
  isIncomeFact,
  isLiquidAssetFact,
  isNonEconomicFlowJournal,
  makeBuckets,
  round,
  semantic,
  signedDelta,
  sum,
} from './coreUtils';

function positive(value: number): number {
  return round(Math.max(0, value));
}

function negativeMagnitude(value: number): number {
  return round(Math.max(0, -value));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function groupFacts(
  facts: readonly ReportingFact[],
  keyFor: (fact: ReportingFact) => string,
  labelFor: (fact: ReportingFact) => string,
): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  const journalIdsByGroup = new Map<string, Set<string>>();
  for (const fact of facts) {
    const key = keyFor(fact);
    const current: ReportGroup = groups.get(key) ?? {
      key,
      label: labelFor(fact),
      accountIds: [],
      accountType: fact.accountType,
      accountSubtype: fact.accountSubtype,
      accountPath: [...(fact.accountPath ?? [fact.accountId])],
      grossAmount: 0,
      reversalAmount: 0,
      netAmount: 0,
      amount: 0,
      percentage: 0,
      journalCount: 0,
      averageTransactionSize: 0,
    };
    const delta = signedDelta(fact);
    if (!current.accountIds.includes(fact.accountId)) current.accountIds.push(fact.accountId);
    const journalIds = journalIdsByGroup.get(key) ?? new Set<string>();
    journalIds.add(fact.journalId);
    journalIdsByGroup.set(key, journalIds);
    current.grossAmount = round(current.grossAmount + positive(delta));
    current.reversalAmount = round(current.reversalAmount + negativeMagnitude(delta));
    current.netAmount = round(current.grossAmount - current.reversalAmount);
    current.amount = current.netAmount;
    current.journalCount = journalIds.size;
    current.averageTransactionSize =
      current.journalCount > 0 ? round(current.grossAmount / current.journalCount) : 0;
    groups.set(key, current);
  }
  return [...groups.values()];
}

function withPercentages<T extends ReportGroup>(groups: T[], total: number): T[] {
  return groups
    .map(group => ({
      ...group,
      percentage: total > 0 ? round((Math.max(0, group.netAmount) / total) * 100) : 0,
    }))
    .sort((a, b) => b.netAmount - a.netAmount);
}

function asSpendingGroup(group: ReportGroup): SpendingGroup {
  return {
    ...group,
    grossExpense: group.grossAmount,
    refunds: group.reversalAmount,
    netExpense: group.netAmount,
    isCreditCardPurchase: false,
  };
}

function asIncomeGroup(group: ReportGroup): IncomeGroup {
  return {
    ...group,
    grossIncome: group.grossAmount,
    incomeReversals: group.reversalAmount,
    netIncome: group.netAmount,
  };
}

function expenseFacts(facts: readonly ReportingFact[]): ReportingFact[] {
  return facts.filter(fact => isExpenseFact(fact) && fact.isLeafAccount !== false);
}

function incomeFacts(facts: readonly ReportingFact[]): ReportingFact[] {
  return facts.filter(fact => isIncomeFact(fact) && fact.isLeafAccount !== false);
}

function groupJournalIds(facts: readonly ReportingFact[]): Map<string, ReportingFact[]> {
  const groups = new Map<string, ReportingFact[]>();
  facts.forEach(fact => {
    const current = groups.get(fact.journalId) ?? [];
    current.push(fact);
    groups.set(fact.journalId, current);
  });
  return groups;
}

function flowBuckets(facts: readonly ReportingFact[], buckets: readonly ReportBucket[]) {
  return buckets.map(bucket => {
    const bucketFacts = facts.filter(fact => bucketForDate([bucket], fact.journalDate));
    const income = incomeFacts(bucketFacts);
    const expense = expenseFacts(bucketFacts);
    const cash = bucketFacts.filter(isLiquidAssetFact);
    const incomeGross = sum(income.map(fact => positive(signedDelta(fact))));
    const incomeReversals = sum(income.map(fact => negativeMagnitude(signedDelta(fact))));
    const expenseGross = sum(expense.map(fact => positive(signedDelta(fact))));
    const refunds = sum(expense.map(fact => negativeMagnitude(signedDelta(fact))));
    const cashInflows = sum(cash.map(fact => positive(signedDelta(fact))));
    const cashOutflows = sum(cash.map(fact => negativeMagnitude(signedDelta(fact))));
    const journals = [...groupJournalIds(bucketFacts).values()];
    const internalTransferGroups = journals.filter(group => isNonEconomicFlowJournal(group));
    const borrowingGroups = journals.filter(group =>
      group.some(fact => semantic(fact) === SemanticType.BORROWING),
    );
    const debtPaymentGroups = journals.filter(group =>
      group.some(fact => isDebtPaymentSemantic(fact)),
    );
    return {
      ...bucket,
      grossIncome: incomeGross,
      incomeReversals,
      netIncome: round(incomeGross - incomeReversals),
      grossExpense: expenseGross,
      refunds,
      netExpense: round(expenseGross - refunds),
      netFlow: round(incomeGross - incomeReversals - expenseGross + refunds),
      cashInflows,
      cashOutflows,
      netCashFlow: round(cashInflows - cashOutflows),
      internalTransfers: sum(
        internalTransferGroups.flatMap(group =>
          group.filter(isLiquidAssetFact).map(fact => positive(signedDelta(fact))),
        ),
      ),
      borrowings: sum(
        borrowingGroups.flatMap(group =>
          group.filter(isLiquidAssetFact).map(fact => positive(signedDelta(fact))),
        ),
      ),
      debtPayments: sum(
        debtPaymentGroups.flatMap(group =>
          group.filter(isLiquidAssetFact).map(fact => negativeMagnitude(signedDelta(fact))),
        ),
      ),
      creditCardPayments: sum(
        debtPaymentGroups
          .filter(group => group.some(isCreditCardFact))
          .flatMap(group =>
            group.filter(isLiquidAssetFact).map(fact => negativeMagnitude(signedDelta(fact))),
          ),
      ),
    };
  });
}

function spendingResult(input: CalculatorInput, facts: readonly ReportingFact[]): SpendingResult {
  const selected = expenseFacts(facts);
  const grossExpense = sum(selected.map(fact => positive(signedDelta(fact))));
  const refunds = sum(selected.map(fact => negativeMagnitude(signedDelta(fact))));
  const netExpense = round(grossExpense - refunds);
  const accountGroups = withPercentages(
    groupFacts(
      selected,
      fact => fact.accountId,
      fact => fact.accountName ?? fact.accountId,
    ).map(asSpendingGroup),
    netExpense,
  );
  const subtypeGroups = withPercentages(
    groupFacts(
      selected,
      fact => String(fact.accountSubtype ?? 'OTHER'),
      fact => String(fact.accountSubtype ?? 'OTHER'),
    ).map(asSpendingGroup),
    netExpense,
  );
  const period = input.query.period;
  const buckets = makeBuckets(period, granularityFor(input.query, period));
  const bucketRows = flowBuckets(facts, buckets).map(bucket => ({
    startDate: bucket.startDate,
    endDate: bucket.endDate,
    label: bucket.label,
    grossExpense: bucket.grossExpense,
    refunds: bucket.refunds,
    netExpense: bucket.netExpense,
  }));
  const comparisonFacts = input.comparisonFacts ? expenseFacts(input.comparisonFacts) : null;
  const comparison = comparisonFacts
    ? {
        grossExpense: comparisonMetric(
          grossExpense,
          sum(comparisonFacts.map(fact => positive(signedDelta(fact)))),
        ),
        refunds: comparisonMetric(
          refunds,
          sum(comparisonFacts.map(fact => negativeMagnitude(signedDelta(fact)))),
        ),
        netExpense: comparisonMetric(
          netExpense,
          sum(comparisonFacts.map(fact => Math.max(0, signedDelta(fact)))),
        ),
      }
    : null;
  return {
    startDate: period.startDate,
    endDate: period.endDate,
    currencyCode: input.query.targetCurrency,
    grossExpense,
    refunds,
    netExpense,
    journalCount: unique(selected.map(fact => fact.journalId)).length,
    averageTransactionSize: selected.length > 0 ? round(grossExpense / selected.length) : 0,
    byAccount: accountGroups,
    bySubtype: subtypeGroups,
    buckets: bucketRows,
    comparison,
  };
}

export function calculateSpending(input: CalculatorInput): SpendingResult {
  return spendingResult(input, factsInPeriod(input.facts, input.query.period));
}

export function calculateIncome(input: CalculatorInput): IncomeResult {
  const period = input.query.period;
  const selected = incomeFacts(factsInPeriod(input.facts, period));
  const grossIncome = sum(selected.map(fact => positive(signedDelta(fact))));
  const incomeReversals = sum(selected.map(fact => negativeMagnitude(signedDelta(fact))));
  const netIncome = round(grossIncome - incomeReversals);
  const accountGroups = withPercentages(
    groupFacts(
      selected,
      fact => fact.accountId,
      fact => fact.accountName ?? fact.accountId,
    ).map(asIncomeGroup),
    netIncome,
  );
  const subtypeGroups = withPercentages(
    groupFacts(
      selected,
      fact => String(fact.accountSubtype ?? 'OTHER'),
      fact => String(fact.accountSubtype ?? 'OTHER'),
    ).map(asIncomeGroup),
    netIncome,
  );
  const buckets = makeBuckets(period, granularityFor(input.query, period));
  const bucketRows = flowBuckets(selected, buckets).map(bucket => ({
    startDate: bucket.startDate,
    endDate: bucket.endDate,
    label: bucket.label,
    grossIncome: bucket.grossIncome,
    incomeReversals: bucket.incomeReversals,
    netIncome: bucket.netIncome,
  }));
  const previous = input.comparisonFacts ? incomeFacts(input.comparisonFacts) : null;
  return {
    startDate: period.startDate,
    endDate: period.endDate,
    currencyCode: input.query.targetCurrency,
    grossIncome,
    incomeReversals,
    netIncome,
    journalCount: unique(selected.map(fact => fact.journalId)).length,
    averageTransactionSize: selected.length > 0 ? round(grossIncome / selected.length) : 0,
    byAccount: accountGroups,
    bySubtype: subtypeGroups,
    buckets: bucketRows,
    comparison: previous
      ? {
          grossIncome: comparisonMetric(
            grossIncome,
            sum(previous.map(fact => positive(signedDelta(fact)))),
          ),
          incomeReversals: comparisonMetric(
            incomeReversals,
            sum(previous.map(fact => negativeMagnitude(signedDelta(fact)))),
          ),
          netIncome: comparisonMetric(
            netIncome,
            round(
              sum(previous.map(fact => positive(signedDelta(fact)))) -
                sum(previous.map(fact => negativeMagnitude(signedDelta(fact)))),
            ),
          ),
        }
      : null,
  };
}

function cashGroups(
  facts: readonly ReportingFact[],
  keyFor: (fact: ReportingFact) => string,
): CashFlowGroup[] {
  const groups = new Map<string, CashFlowGroup>();
  for (const fact of facts.filter(isLiquidAssetFact)) {
    const key = keyFor(fact);
    const current: CashFlowGroup = groups.get(key) ?? {
      key,
      label: fact.accountName ?? key,
      accountIds: [],
      accountSubtype: fact.accountSubtype,
      inflows: 0,
      outflows: 0,
      netCashFlow: 0,
      journalCount: 0,
    };
    if (!current.accountIds.includes(fact.accountId)) current.accountIds.push(fact.accountId);
    const delta = signedDelta(fact);
    current.inflows = round(current.inflows + positive(delta));
    current.outflows = round(current.outflows + negativeMagnitude(delta));
    current.netCashFlow = round(current.inflows - current.outflows);
    current.journalCount += 1;
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.netCashFlow - a.netCashFlow);
}

function balanceState(balances: readonly ReportBalanceInput[] | undefined): BalanceState | null {
  if (!balances) return null;
  const leaf = balances.filter(isBalanceLeaf);
  const assets = leaf.filter(item => item.accountType === AccountType.ASSET);
  const liabilities = leaf.filter(item => item.accountType === AccountType.LIABILITY);
  const buildGroups = (items: readonly ReportBalanceInput[], type: AccountType): BalanceGroup[] => {
    const total = sum(items.map(item => item.reportCurrencyBalance ?? item.balance));
    return items
      .map(item => ({
        key: item.accountId,
        label: item.accountName ?? item.accountId,
        accountId: item.accountId,
        accountIds: [item.accountId],
        accountType: type,
        accountSubtype: item.accountSubtype,
        accountPath: balancePath(item),
        balance: round(item.reportCurrencyBalance ?? item.balance),
        percentage:
          total > 0 ? round(((item.reportCurrencyBalance ?? item.balance) / total) * 100) : 0,
      }))
      .sort((a, b) => b.balance - a.balance);
  };
  const totalAssets = sum(assets.map(item => item.reportCurrencyBalance ?? item.balance));
  const totalLiabilities = sum(liabilities.map(item => item.reportCurrencyBalance ?? item.balance));
  return {
    totalAssets,
    totalLiabilities,
    netWorth: round(totalAssets - totalLiabilities),
    byAccount: [
      ...buildGroups(assets, AccountType.ASSET),
      ...buildGroups(liabilities, AccountType.LIABILITY),
    ],
    bySubtype: [],
  };
}

export function calculateCashFlow(input: CalculatorInput): CashFlowResult {
  const period = input.query.period;
  const facts = factsInPeriod(input.facts, period);
  const cash = facts.filter(isLiquidAssetFact);
  const cashInflows = sum(cash.map(fact => positive(signedDelta(fact))));
  const cashOutflows = sum(cash.map(fact => negativeMagnitude(signedDelta(fact))));
  const journals = groupJournalIds(facts);
  const internalTransferGroups = [...journals.values()].filter(group =>
    isNonEconomicFlowJournal(group),
  );
  const internalTransfers = sum(
    internalTransferGroups.flatMap(group =>
      group.filter(isLiquidAssetFact).map(fact => positive(signedDelta(fact))),
    ),
  );
  const borrowingGroups = [...journals.values()].filter(group =>
    group.some(fact => semantic(fact) === SemanticType.BORROWING),
  );
  const debtPaymentGroups = [...journals.values()].filter(group =>
    group.some(fact => isDebtPaymentSemantic(fact)),
  );
  const borrowings = sum(
    borrowingGroups.flatMap(group =>
      group.filter(isLiquidAssetFact).map(fact => positive(signedDelta(fact))),
    ),
  );
  const debtPayments = sum(
    debtPaymentGroups.flatMap(group =>
      group.filter(isLiquidAssetFact).map(fact => negativeMagnitude(signedDelta(fact))),
    ),
  );
  const creditCardPayments = sum(
    debtPaymentGroups
      .filter(group => group.some(isCreditCardFact))
      .flatMap(group =>
        group.filter(isLiquidAssetFact).map(fact => negativeMagnitude(signedDelta(fact))),
      ),
  );
  const buckets = makeBuckets(period, granularityFor(input.query, period));
  const flow = flowBuckets(facts, buckets);
  const opening = balanceState(input.openingBalances);
  const closing = balanceState(input.closingBalances);
  return {
    startDate: period.startDate,
    endDate: period.endDate,
    currencyCode: input.query.targetCurrency,
    openingCashBalance:
      opening?.byAccount
        .filter(group => group.accountType === AccountType.ASSET)
        .reduce((total, group) => total + group.balance, 0) ?? null,
    closingCashBalance:
      closing?.byAccount
        .filter(group => group.accountType === AccountType.ASSET)
        .reduce((total, group) => total + group.balance, 0) ?? null,
    cashInflows,
    cashOutflows,
    netCashFlow: round(cashInflows - cashOutflows),
    internalTransfers,
    borrowings,
    debtPayments,
    creditCardPayments,
    byAccount: cashGroups(cash, fact => fact.accountId),
    bySubtype: cashGroups(cash, fact => String(fact.accountSubtype ?? 'OTHER')),
    buckets: flow.map(bucket => ({
      startDate: bucket.startDate,
      endDate: bucket.endDate,
      label: bucket.label,
      cashInflows: bucket.cashInflows,
      cashOutflows: bucket.cashOutflows,
      netCashFlow: bucket.netCashFlow,
      internalTransfers: bucket.internalTransfers,
      borrowings: bucket.borrowings,
      debtPayments: bucket.debtPayments,
      creditCardPayments: bucket.creditCardPayments,
    })),
    comparison: null,
  };
}

export function calculateOverview(input: CalculatorInput): OverviewResult {
  const period = input.query.period;
  const facts = factsInPeriod(input.facts, period);
  const income = calculateIncome({ ...input, facts });
  const spending = spendingResult(input, facts);
  const netFlow = round(income.netIncome - spending.netExpense);
  const previous = input.comparisonFacts
    ? {
        netIncome: round(
          sum(incomeFacts(input.comparisonFacts).map(fact => positive(signedDelta(fact)))) -
            sum(
              incomeFacts(input.comparisonFacts).map(fact => negativeMagnitude(signedDelta(fact))),
            ),
        ),
        netExpense: spendingResult(input, input.comparisonFacts).netExpense,
      }
    : null;
  const topSpendingCategories = spending.bySubtype.slice(0, 5);
  return {
    startDate: period.startDate,
    endDate: period.endDate,
    currencyCode: input.query.targetCurrency,
    grossIncome: income.grossIncome,
    netIncome: income.netIncome,
    grossExpense: spending.grossExpense,
    refunds: spending.refunds,
    netExpense: spending.netExpense,
    netFlow,
    savingsRate: income.netIncome > 0 ? round((netFlow / income.netIncome) * 100) : null,
    netWorthChange: null,
    buckets: flowBuckets(facts, makeBuckets(period, granularityFor(input.query, period))),
    topSpendingCategories,
    comparison: previous
      ? {
          netIncome: comparisonMetric(income.netIncome, previous.netIncome),
          netExpense: comparisonMetric(spending.netExpense, previous.netExpense),
          netFlow: comparisonMetric(netFlow, round(previous.netIncome - previous.netExpense)),
        }
      : null,
  };
}

function netWorthHistory(
  opening: BalanceState | null,
  facts: readonly ReportingFact[],
  period: { startDate: number; endDate: number; timeZone?: string },
): NetWorthHistoryPoint[] {
  if (!opening) return [];
  const buckets = makeBuckets(period, 'DAY');
  const orderedFacts = [...facts].sort((left, right) => left.journalDate - right.journalDate);
  let factIndex = orderedFacts.findIndex(fact => fact.journalDate >= period.startDate);
  if (factIndex === -1) factIndex = orderedFacts.length;
  let assets = opening.totalAssets;
  let liabilities = opening.totalLiabilities;
  return buckets.map(bucket => {
    while (
      factIndex < orderedFacts.length &&
      orderedFacts[factIndex].journalDate <= bucket.endDate
    ) {
      const fact = orderedFacts[factIndex];
      const delta = signedDelta(fact);
      if (fact.accountType === AccountType.ASSET) assets = round(assets + delta);
      if (fact.accountType === AccountType.LIABILITY) liabilities = round(liabilities + delta);
      factIndex += 1;
    }
    return {
      ...bucket,
      totalAssets: assets,
      totalLiabilities: liabilities,
      netWorth: round(assets - liabilities),
      netWorthChange: 0,
    };
  });
}

export function calculateNetWorth(input: NetWorthCalculatorInput): NetWorthResult {
  const period = input.query.period;
  const opening = balanceState(input.openingBalances);
  const closing = balanceState(input.closingBalances);
  const actualChange = round((closing?.netWorth ?? 0) - (opening?.netWorth ?? 0));
  const facts = factsInPeriod(input.facts, period);
  const netIncome = round(
    sum(incomeFacts(facts).map(fact => signedDelta(fact))) -
      sum(expenseFacts(facts).map(fact => signedDelta(fact))),
  );
  return {
    startDate: period.startDate,
    endDate: period.endDate,
    currencyCode: input.query.targetCurrency,
    opening,
    closing,
    change: {
      assets: opening && closing ? round(closing.totalAssets - opening.totalAssets) : null,
      liabilities:
        opening && closing ? round(closing.totalLiabilities - opening.totalLiabilities) : null,
      netWorth: actualChange,
    },
    netWorthChangeFromFacts: actualChange,
    history: netWorthHistory(opening, facts, period),
    reconciliation: {
      actualChange,
      netIncome,
      contributions: 0,
      withdrawals: 0,
      transfers: 0,
      debtPrincipalMovement: 0,
      currencyValuationMovement: 0,
      assetNonCashMovement: 0,
      explainedChange: netIncome,
      unexplainedDifference: round(actualChange - netIncome),
    },
    comparison: null,
  };
}
