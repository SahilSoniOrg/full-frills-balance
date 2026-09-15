import { CANONICAL_IMPORT_VERSION_V1 } from '@/src/types/importContracts';
import type {
  BatchImportData,
  CanonicalImport,
  CanonicalImportMetadata,
  CanonicalImportV1,
} from '@/src/types/importContracts';

/** Maps canonical plugin output to the persistence batch shape (commit 29 will narrow this path). */
export function batchImportDataFromCanonical(canonical: CanonicalImport): BatchImportData {
  if (canonical.version !== CANONICAL_IMPORT_VERSION_V1) {
    throw new Error(`Unsupported canonical import version: ${canonical.version}`);
  }

  const v1 = canonical as CanonicalImportV1;
  return {
    accounts: v1.accounts,
    journals: v1.journals,
    transactions: v1.transactions,
    budgets: v1.budgets,
    budgetScopes: v1.budgetScopes,
    auditLogs: v1.auditLogs,
    currencies: v1.currencies,
    exchangeRates: v1.exchangeRates,
    accountMetadata: v1.accountMetadata,
    plannedPayments: v1.plannedPayments,
    journalMetadata: v1.journalMetadata,
    transactionAutoPostRules: v1.transactionAutoPostRules,
    transactionInboxRecords: v1.transactionInboxRecords,
    balanceSnapshots: v1.balanceSnapshots,
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
    accounts: data.accounts,
    journals: data.journals,
    transactions: data.transactions,
    budgets: data.budgets,
    budgetScopes: data.budgetScopes,
    auditLogs: data.auditLogs,
    currencies: data.currencies,
    exchangeRates: data.exchangeRates,
    accountMetadata: data.accountMetadata,
    plannedPayments: data.plannedPayments,
    journalMetadata: data.journalMetadata,
    transactionAutoPostRules: data.transactionAutoPostRules,
    transactionInboxRecords: data.transactionInboxRecords,
    balanceSnapshots: data.balanceSnapshots,
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
