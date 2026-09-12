import type {
  DebtAccountResult,
  DebtCalculationInput,
  DebtReportResult,
  PlanningAccount,
  PlanningFact,
} from './planningContracts';
import {
  inPeriod,
  lookupNumber,
  roundAmount,
  selectActualFacts,
  selectPlannedFacts,
  signedDelta,
  upper,
  unique,
} from './planningUtils';

function isDebt(account: PlanningAccount): boolean {
  return upper(account.accountType) === 'LIABILITY';
}

function isPayment(fact: PlanningFact): boolean {
  const semantic = upper(fact.semanticType);
  return signedDelta(fact) < 0 || semantic === 'DEBT_PAYMENT' || semantic === 'DEBT_PAYDOWN';
}

function isBorrowing(fact: PlanningFact): boolean {
  return signedDelta(fact) > 0;
}

function balanceFor(
  account: PlanningAccount,
  lookup: DebtCalculationInput['openingBalances'],
): { value: number; known: boolean } {
  const lookupValue = lookupNumber(lookup, account.id);
  if (lookupValue !== undefined) return { value: lookupValue, known: true };
  const fallback =
    account.openingBalance ?? account.balanceAtStart ?? account.balance ?? account.currentBalance;
  return fallback === undefined ? { value: 0, known: false } : { value: fallback, known: true };
}

function factsForAccount(
  facts: readonly PlanningFact[],
  account: PlanningAccount,
  period: DebtCalculationInput['period'],
): PlanningFact[] {
  return facts.filter(fact => fact.accountId === account.id && (!period || inPeriod(fact, period)));
}

export function calculateDebtReport(input: DebtCalculationInput): DebtReportResult {
  const precision = input.precision ?? 2;
  const actual = selectActualFacts(input);
  const planned = selectPlannedFacts(input);
  const accounts = input.accounts.filter(isDebt);
  const rows: DebtAccountResult[] = accounts.map(account => {
    const opening = balanceFor(account, input.openingBalances);
    const actualFacts = factsForAccount(actual, account, input.period);
    const plannedFacts = factsForAccount(planned, account, input.period);
    const borrowings = actualFacts
      .filter(isBorrowing)
      .reduce((total, fact) => total + signedDelta(fact), 0);
    const totalPayments = actualFacts
      .filter(isPayment)
      .reduce((total, fact) => total + Math.abs(signedDelta(fact)), 0);
    const balanceAdjustments = actualFacts
      .filter(fact => !isBorrowing(fact) && !isPayment(fact))
      .reduce((total, fact) => total + signedDelta(fact), 0);
    const balanceChange = actualFacts.reduce((total, fact) => total + signedDelta(fact), 0);
    const plannedBorrowings = plannedFacts
      .filter(isBorrowing)
      .reduce((total, fact) => total + signedDelta(fact), 0);
    const plannedPayments = plannedFacts
      .filter(isPayment)
      .reduce((total, fact) => total + Math.abs(signedDelta(fact)), 0);
    const closingBalance = opening.value + balanceChange;
    const plannedClosingBalance = closingBalance + plannedBorrowings - plannedPayments;
    const metadata = account.metadata;
    const creditLimitAmount = metadata?.creditLimitAmount ?? account.creditLimitAmount ?? null;
    return {
      accountId: account.id,
      name: account.name ?? account.id,
      accountSubtype: account.accountSubtype,
      openingBalance: roundAmount(opening.value, precision),
      closingBalance: roundAmount(closingBalance, precision),
      balanceChange: roundAmount(balanceChange, precision),
      openingBalanceKnown: opening.known,
      borrowings: roundAmount(borrowings, precision),
      totalPayments: roundAmount(totalPayments, precision),
      balanceAdjustments: roundAmount(balanceAdjustments, precision),
      principalRepayment: null,
      interestAndFees: null,
      plannedBorrowings: roundAmount(plannedBorrowings, precision),
      plannedPayments: roundAmount(plannedPayments, precision),
      plannedClosingBalance: roundAmount(plannedClosingBalance, precision),
      creditLimitAmount,
      utilizationPercent:
        creditLimitAmount && creditLimitAmount > 0
          ? roundAmount((closingBalance / creditLimitAmount) * 100, precision)
          : null,
      minimumPaymentAmount: metadata?.minimumPaymentAmount ?? account.minimumPaymentAmount ?? null,
      minimumPaymentPercent:
        metadata?.minimumPaymentPercent ?? account.minimumPaymentPercent ?? null,
      dueDay: metadata?.dueDay ?? account.dueDay ?? null,
      payFromAccountId: metadata?.payFromAccountId ?? account.payFromAccountId,
      journalIds: unique(actualFacts.map(fact => fact.journalId)),
      plannedJournalIds: unique(plannedFacts.map(fact => fact.journalId)),
    };
  });

  const sum = (
    field: keyof Pick<
      DebtAccountResult,
      | 'openingBalance'
      | 'closingBalance'
      | 'balanceChange'
      | 'borrowings'
      | 'totalPayments'
      | 'balanceAdjustments'
      | 'plannedBorrowings'
      | 'plannedPayments'
      | 'plannedClosingBalance'
    >,
  ) =>
    roundAmount(
      rows.reduce((total, row) => total + Number(row[field]), 0),
      precision,
    );
  const creditLimitAmount = roundAmount(
    rows.reduce((total, row) => total + (row.creditLimitAmount ?? 0), 0),
    precision,
  );
  return {
    accounts: rows,
    totals: {
      openingBalance: sum('openingBalance'),
      closingBalance: sum('closingBalance'),
      balanceChange: sum('balanceChange'),
      borrowings: sum('borrowings'),
      totalPayments: sum('totalPayments'),
      balanceAdjustments: sum('balanceAdjustments'),
      principalRepayment: null,
      interestAndFees: null,
      plannedBorrowings: sum('plannedBorrowings'),
      plannedPayments: sum('plannedPayments'),
      plannedClosingBalance: sum('plannedClosingBalance'),
      creditLimitAmount,
      utilizationPercent:
        creditLimitAmount > 0
          ? roundAmount((sum('closingBalance') / creditLimitAmount) * 100, precision)
          : null,
    },
  };
}
