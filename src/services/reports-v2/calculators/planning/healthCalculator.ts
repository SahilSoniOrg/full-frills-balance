import type {
  PlanningFact,
  ReportHealthDiagnostic,
  ReportHealthInput,
  ReportHealthResult,
} from './planningContracts';
import {
  inPeriod,
  isPlannedFact,
  roundAmount,
  selectActualFacts,
  upper,
  unique,
} from './planningUtils';

function journalBalanceDelta(fact: PlanningFact): number {
  const amount = Number.isFinite(fact.amount) ? fact.amount : 0;
  if (upper(fact.transactionType) === 'DEBIT') return amount;
  if (upper(fact.transactionType) === 'CREDIT') return -amount;
  return 0;
}

function addDiagnostic(
  diagnostics: Map<string, ReportHealthDiagnostic>,
  code: ReportHealthDiagnostic['code'],
  severity: ReportHealthDiagnostic['severity'],
  message: string,
  fact?: PlanningFact,
  accountId?: string,
) {
  const current = diagnostics.get(code);
  if (current) {
    diagnostics.set(code, {
      ...current,
      count: current.count + 1,
      journalIds: unique([...(current.journalIds ?? []), ...(fact ? [fact.journalId] : [])]),
      accountIds: unique([...(current.accountIds ?? []), ...(accountId ? [accountId] : [])]),
    });
    return;
  }
  diagnostics.set(code, {
    code,
    severity,
    message,
    count: 1,
    ...(fact ? { journalIds: [fact.journalId] } : {}),
    ...(accountId ? { accountIds: [accountId] } : {}),
  });
}

export function calculateReportHealth(input: ReportHealthInput): ReportHealthResult {
  const diagnostics = new Map<string, ReportHealthDiagnostic>();
  const isInSelectedPeriod = (fact: PlanningFact) => !input.period || inPeriod(fact, input.period);
  const actual = selectActualFacts(input).filter(isInSelectedPeriod);
  const actualSource = (input.actualFacts ?? input.postedFacts ?? input.facts ?? []).filter(
    isInSelectedPeriod,
  );
  const accountMap = new Map(input.accounts.map(account => [account.id, account]));
  for (const account of input.accounts) {
    if (
      account.accountSubtype &&
      input.supportedAccountSubtypes &&
      !input.supportedAccountSubtypes.includes(account.accountSubtype)
    ) {
      addDiagnostic(
        diagnostics,
        'UNSUPPORTED_ACCOUNT_SUBTYPE',
        'INFO',
        'An account subtype is not recognized by this report build.',
        undefined,
        account.id,
      );
    }
  }
  const journalGroups = new Map<string, PlanningFact[]>();
  for (const fact of (input.facts ?? [...actual]).filter(isInSelectedPeriod)) {
    const current = journalGroups.get(fact.journalId) ?? [];
    current.push(fact);
    journalGroups.set(fact.journalId, current);
    if (!Number.isFinite(fact.amount))
      addDiagnostic(
        diagnostics,
        'INVALID_AMOUNT',
        'ERROR',
        'A report line has an invalid amount.',
        fact,
      );
    if (!accountMap.has(fact.accountId))
      addDiagnostic(
        diagnostics,
        'MISSING_ACCOUNT_REFERENCE',
        'ERROR',
        'A transaction points to a missing account.',
        fact,
        fact.accountId,
      );
    const account = accountMap.get(fact.accountId);
    if (account?.archivedAt || account?.archived)
      addDiagnostic(
        diagnostics,
        'ARCHIVED_ACCOUNT_ACTIVITY',
        'WARNING',
        'An archived account has activity.',
        fact,
        fact.accountId,
      );
    if (
      input.targetCurrency &&
      fact.currencyCode &&
      fact.currencyCode !== input.targetCurrency &&
      !Number.isFinite(fact.exchangeRate) &&
      !Number.isFinite(fact.historicalBaseAmount)
    ) {
      addDiagnostic(
        diagnostics,
        'MISSING_EXCHANGE_RATE',
        'WARNING',
        'A cross-currency line has no usable exchange rate.',
        fact,
      );
    }
    if (
      (upper(fact.accountType) === 'EXPENSE' || upper(fact.accountType) === 'INCOME') &&
      !fact.accountSubtype
    ) {
      addDiagnostic(
        diagnostics,
        'UNCATEGORIZED_ACTIVITY',
        'WARNING',
        'Income or expense activity has no category subtype.',
        fact,
        fact.accountId,
      );
    }
  }
  for (const fact of actualSource) {
    if (isPlannedFact(fact))
      addDiagnostic(
        diagnostics,
        'PLANNED_IN_ACTUALS',
        'ERROR',
        'A planned line was supplied to the actual stream.',
        fact,
      );
  }
  for (const fact of (input.facts ?? [...actual]).filter(isInSelectedPeriod)) {
    if (
      !input.supportedAccountSubtypes?.includes(String(fact.accountSubtype)) &&
      fact.accountSubtype
    ) {
      addDiagnostic(
        diagnostics,
        'UNSUPPORTED_ACCOUNT_SUBTYPE',
        'INFO',
        'An account subtype is not recognized by this report build.',
        fact,
        fact.accountId,
      );
    }
  }
  for (const [journalId, facts] of journalGroups) {
    // A journal can be valid in its source currencies while its converted
    // report-currency lines differ by rounding or an imperfect FX rate. The
    // report must not turn that valuation noise into a ledger-balance error.
    const currencies = new Set(
      facts
        .map(fact => fact.currencyCode?.trim().toUpperCase())
        .filter((currency): currency is string => Boolean(currency)),
    );
    const hasMultipleCurrencies = currencies.size > 1;
    if (
      !hasMultipleCurrencies &&
      facts.length > 1 &&
      roundAmount(
        facts.reduce((total, fact) => total + journalBalanceDelta(fact), 0),
        input.precision ?? 2,
      ) !== 0
    ) {
      addDiagnostic(
        diagnostics,
        'UNBALANCED_JOURNAL',
        'ERROR',
        'A journal does not balance to zero.',
        { ...facts[0], journalId },
      );
    }
  }
  const journals = input.journals ?? [];
  for (const journal of journals) {
    if (journal.originalJournalId && journal.reversingJournalId) {
      addDiagnostic(
        diagnostics,
        'DUPLICATE_REVERSAL_ACTIVITY',
        'WARNING',
        'A journal carries both reversal links.',
        undefined,
        journal.id,
      );
    }
  }
  for (const check of input.balanceChecks ?? []) {
    if (
      roundAmount(check.storedBalance, input.precision ?? 2) !==
      roundAmount(check.computedBalance, input.precision ?? 2)
    ) {
      addDiagnostic(
        diagnostics,
        'STALE_BALANCE_PROJECTION',
        'WARNING',
        'A cached balance differs from the computed ledger balance.',
        undefined,
        check.accountId,
      );
    }
  }
  const ordered = [...diagnostics.values()].sort((left, right) => {
    const priority = { ERROR: 0, WARNING: 1, INFO: 2 };
    return priority[left.severity] - priority[right.severity];
  });
  return {
    isHealthy: ordered.every(item => item.severity !== 'ERROR'),
    diagnostics: ordered,
    summary: {
      errorCount: ordered
        .filter(item => item.severity === 'ERROR')
        .reduce((total, item) => total + item.count, 0),
      warningCount: ordered
        .filter(item => item.severity === 'WARNING')
        .reduce((total, item) => total + item.count, 0),
      infoCount: ordered
        .filter(item => item.severity === 'INFO')
        .reduce((total, item) => total + item.count, 0),
    },
  };
}
