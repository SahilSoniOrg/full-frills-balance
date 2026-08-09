import {
  BatchImportData,
  ImportedAccount,
  ImportedAccountMetadata,
  ImportedAuditLog,
  ImportedBalanceSnapshot,
  ImportedBudget,
  ImportedBudgetScope,
  ImportedCurrency,
  ImportedExchangeRate,
  ImportedJournal,
  ImportedJournalMetadata,
  ImportedPlannedPayment,
  ImportedTransaction,
  ImportedTransactionAutoPostRule,
  ImportedTransactionInboxRecord,
} from '@/src/data/repositories/ImportRepository';

import {
  CANONICAL_IMPORT_VERSION_V1,
  CanonicalImport,
  CanonicalImportMetadata,
  CanonicalImportV1,
} from '@/src/services/import/canonicalImport';

/** Maps canonical plugin output to the persistence batch shape (commit 29 will narrow this path). */
export function batchImportDataFromCanonical(canonical: CanonicalImport): BatchImportData {
  if (canonical.version !== CANONICAL_IMPORT_VERSION_V1) {
    throw new Error(`Unsupported canonical import version: ${canonical.version}`);
  }

  const v1 = canonical as CanonicalImportV1;
  return {
    accounts: v1.accounts as ImportedAccount[],
    journals: v1.journals as ImportedJournal[],
    transactions: v1.transactions as ImportedTransaction[],
    budgets: v1.budgets as ImportedBudget[] | undefined,
    budgetScopes: v1.budgetScopes as ImportedBudgetScope[] | undefined,
    auditLogs: v1.auditLogs as ImportedAuditLog[] | undefined,
    currencies: v1.currencies as ImportedCurrency[] | undefined,
    exchangeRates: v1.exchangeRates as ImportedExchangeRate[] | undefined,
    accountMetadata: v1.accountMetadata as ImportedAccountMetadata[] | undefined,
    plannedPayments: v1.plannedPayments as ImportedPlannedPayment[] | undefined,
    journalMetadata: v1.journalMetadata as ImportedJournalMetadata[] | undefined,
    transactionAutoPostRules: v1.transactionAutoPostRules as
      ImportedTransactionAutoPostRule[] | undefined,
    transactionInboxRecords: v1.transactionInboxRecords as
      ImportedTransactionInboxRecord[] | undefined,
    balanceSnapshots: v1.balanceSnapshots as ImportedBalanceSnapshot[] | undefined,
  };
}

export function canonicalImportFromBatchImportData(
  data: BatchImportData,
  options: {
    sourceFormatVersion?: string;
    importMetadata?: CanonicalImportMetadata;
  } = {},
): CanonicalImportV1 {
  return {
    version: CANONICAL_IMPORT_VERSION_V1,
    sourceFormatVersion: options.sourceFormatVersion,
    accounts: data.accounts as CanonicalImportV1['accounts'],
    journals: data.journals as CanonicalImportV1['journals'],
    transactions: data.transactions as CanonicalImportV1['transactions'],
    budgets: data.budgets as CanonicalImportV1['budgets'],
    budgetScopes: data.budgetScopes as CanonicalImportV1['budgetScopes'],
    auditLogs: data.auditLogs as CanonicalImportV1['auditLogs'],
    currencies: data.currencies as CanonicalImportV1['currencies'],
    exchangeRates: data.exchangeRates as CanonicalImportV1['exchangeRates'],
    accountMetadata: data.accountMetadata as CanonicalImportV1['accountMetadata'],
    plannedPayments: data.plannedPayments as CanonicalImportV1['plannedPayments'],
    journalMetadata: data.journalMetadata as CanonicalImportV1['journalMetadata'],
    transactionAutoPostRules:
      data.transactionAutoPostRules as CanonicalImportV1['transactionAutoPostRules'],
    transactionInboxRecords:
      data.transactionInboxRecords as CanonicalImportV1['transactionInboxRecords'],
    balanceSnapshots: data.balanceSnapshots as CanonicalImportV1['balanceSnapshots'],
    importMetadata: options.importMetadata,
  };
}

export function resolveParsedImportBatchData(parsed: {
  canonical?: CanonicalImport;
}): BatchImportData {
  if (parsed.canonical) {
    return batchImportDataFromCanonical(parsed.canonical);
  }
  throw new Error('Parsed import result missing canonical data');
}
