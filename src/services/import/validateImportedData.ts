import { BatchImportData, ImportedAccount } from '@/src/data/repositories/ImportRepository';
import {
  MissingImportedAccountRef,
  missingImportedAccountRefs,
} from '@/src/services/accounts/accountReferenceGraph';
import { CanonicalImport } from '@/src/services/import/canonicalImport';
import { batchImportDataFromCanonical } from '@/src/services/import/canonicalImportAdapter';
import { accountImportBatchFromSources } from '@/src/services/import/plugins/nativeImportAccountRemap';

function assertUniqueIds(tableName: string, records: { id: string }[]): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) {
      throw new Error(`Import validation failed: duplicate ${tableName} id "${record.id}"`);
    }
    seen.add(record.id);
  }
}

function formatMissingAccountError(missing: MissingImportedAccountRef): string {
  const recordId = missing.recordId ?? '?';
  switch (missing.siteKey) {
    case 'account.parentAccountId':
      return `Import validation failed: account "${recordId}" references missing parent account "${missing.accountId}"`;
    case 'transaction.accountId':
      return `Import validation failed: transaction "${recordId}" references missing account "${missing.accountId}"`;
    case 'budgetScope.accountId':
      return `Import validation failed: budget scope "${recordId}" references missing account "${missing.accountId}"`;
    case 'budget.assetAccountIds':
      return `Import validation failed: budget "${recordId}" references missing asset account "${missing.accountId}"`;
    case 'accountMetadata.accountId':
      return `Import validation failed: account metadata "${recordId}" references missing account "${missing.accountId}"`;
    case 'accountMetadata.payFromAccountId':
      return `Import validation failed: account metadata "${recordId}" references missing payment account "${missing.accountId}"`;
    case 'plannedPayment.fromAccountId':
    case 'plannedPayment.toAccountId':
      return `Import validation failed: planned payment "${recordId}" references a missing account`;
    case 'balanceSnapshot.accountId':
      return `Import validation failed: balance snapshot "${recordId}" references a missing account or transaction`;
    case 'transactionAutoPostRule.sourceAccountId':
    case 'transactionAutoPostRule.categoryAccountId':
      return `Import validation failed: auto-post rule "${recordId}" references missing account "${missing.accountId}"`;
    default:
      return `Import validation failed: missing account "${missing.accountId}"`;
  }
}

function validateAccountReferences(data: BatchImportData): void {
  // Soft-deleted txs are skipped inside accountImportBatchFromSources (import-only rule).
  const missing = missingImportedAccountRefs(accountImportBatchFromSources(data));
  if (missing.length > 0) {
    throw new Error(formatMissingAccountError(missing[0]));
  }
}

function validateStructuralRules(data: BatchImportData): void {
  assertUniqueIds('account', data.accounts);
  assertUniqueIds('journal', data.journals);
  assertUniqueIds('transaction', data.transactions);
  assertUniqueIds('budget', data.budgets ?? []);
  assertUniqueIds('budget scope', data.budgetScopes ?? []);
  assertUniqueIds('planned payment', data.plannedPayments ?? []);
  assertUniqueIds('journal metadata', data.journalMetadata ?? []);
  assertUniqueIds('balance snapshot', data.balanceSnapshots ?? []);
  assertUniqueIds('transaction inbox record', data.transactionInboxRecords ?? []);
  assertUniqueIds('transaction auto-post rule', data.transactionAutoPostRules ?? []);
  assertUniqueIds('currency', data.currencies ?? []);

  const journalIds = new Set(data.journals.map(journal => journal.id));
  const transactionIds = new Set(data.transactions.map(transaction => transaction.id));
  const budgetIds = new Set((data.budgets ?? []).map(budget => budget.id));
  const plannedPaymentIds = new Set(
    (data.plannedPayments ?? []).map(plannedPayment => plannedPayment.id),
  );
  const currencyCodes = new Set((data.currencies ?? []).map(currency => currency.code));

  for (const account of data.accounts) {
    if (account.parentAccountId && account.parentAccountId === account.id) {
      throw new Error(`Import validation failed: account "${account.id}" cannot be its own parent`);
    }
  }

  // Detect parent cycles before persistence. A self-reference is handled above;
  // this catches longer cycles such as A → B → C → A.
  for (const account of data.accounts) {
    const visited = new Set<string>();
    let current: ImportedAccount | undefined = account;
    while (current?.parentAccountId) {
      if (visited.has(current.id)) {
        throw new Error(
          `Import validation failed: account hierarchy contains a cycle involving "${current.id}"`,
        );
      }
      visited.add(current.id);
      current = data.accounts.find(candidate => candidate.id === current?.parentAccountId);
    }
  }

  for (const transaction of data.transactions) {
    if (transaction.deletedAt != null) continue;
    if (!journalIds.has(transaction.journalId)) {
      throw new Error(
        `Import validation failed: transaction "${transaction.id}" references missing journal "${transaction.journalId}"`,
      );
    }
  }

  for (const budgetScope of data.budgetScopes ?? []) {
    if (!budgetIds.has(budgetScope.budgetId)) {
      throw new Error(
        `Import validation failed: budget scope "${budgetScope.id}" references missing budget "${budgetScope.budgetId}"`,
      );
    }
  }

  for (const snapshot of data.balanceSnapshots ?? []) {
    if (!transactionIds.has(snapshot.transactionId)) {
      throw new Error(
        `Import validation failed: balance snapshot "${snapshot.id}" references a missing account or transaction`,
      );
    }
  }

  for (const metadata of data.journalMetadata ?? []) {
    if (!journalIds.has(metadata.journalId)) {
      throw new Error(
        `Import validation failed: journal metadata "${metadata.id}" references missing journal "${metadata.journalId}"`,
      );
    }
  }

  for (const inboxRecord of data.transactionInboxRecords ?? []) {
    if (inboxRecord.linkedJournalId && !journalIds.has(inboxRecord.linkedJournalId)) {
      throw new Error(
        `Import validation failed: inbox record "${inboxRecord.id}" references missing journal "${inboxRecord.linkedJournalId}"`,
      );
    }
    if (inboxRecord.duplicateJournalId && !journalIds.has(inboxRecord.duplicateJournalId)) {
      throw new Error(
        `Import validation failed: inbox record "${inboxRecord.id}" references missing duplicate journal "${inboxRecord.duplicateJournalId}"`,
      );
    }
  }

  if (currencyCodes.size > 0) {
    for (const transaction of data.transactions) {
      if (!currencyCodes.has(transaction.currencyCode)) {
        throw new Error(
          `Import validation failed: transaction "${transaction.id}" references missing currency "${transaction.currencyCode}"`,
        );
      }
    }
    for (const journal of data.journals) {
      if (!currencyCodes.has(journal.currencyCode)) {
        throw new Error(
          `Import validation failed: journal "${journal.id}" references missing currency "${journal.currencyCode}"`,
        );
      }
    }
  }

  for (const journal of data.journals) {
    if (journal.plannedPaymentId && !plannedPaymentIds.has(journal.plannedPaymentId)) {
      throw new Error(
        `Import validation failed: journal "${journal.id}" references missing planned payment "${journal.plannedPaymentId}"`,
      );
    }
  }
}

/** Validates structural integrity on canonical plugin output before persistence. */
export function validateCanonicalImport(canonical: CanonicalImport): void {
  validateImportedData(batchImportDataFromCanonical(canonical));
}

/**
 * Ensures imported graphs hang together (IDs, FKs, hierarchy).
 * Account FK presence walks the shared Account reference graph inventory;
 * import-only structural rules (cycles, empty review legs, soft-deleted tx skip)
 * stay local in this adapter.
 * Does not re-check historical debit≡credit / FX math — trust the backup as written.
 */
export function validateImportedData(data: BatchImportData): void {
  validateStructuralRules(data);
  validateAccountReferences(data);
}
