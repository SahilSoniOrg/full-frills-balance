import { BatchImportData, ImportedAccount } from '@/src/data/repositories/ImportRepository';
import { CanonicalImport } from '@/src/services/import/canonicalImport';
import { batchImportDataFromCanonical } from '@/src/services/import/canonicalImportAdapter';

function assertUniqueIds(tableName: string, records: { id: string }[]): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) {
      throw new Error(`Import validation failed: duplicate ${tableName} id "${record.id}"`);
    }
    seen.add(record.id);
  }
}

function validateReferences(data: BatchImportData): void {
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

  const accountIds = new Set(data.accounts.map(account => account.id));
  const journalIds = new Set(data.journals.map(journal => journal.id));
  const transactionIds = new Set(data.transactions.map(transaction => transaction.id));
  const budgetIds = new Set((data.budgets ?? []).map(budget => budget.id));
  const plannedPaymentIds = new Set(
    (data.plannedPayments ?? []).map(plannedPayment => plannedPayment.id),
  );
  const currencyCodes = new Set((data.currencies ?? []).map(currency => currency.code));

  for (const account of data.accounts) {
    if (account.parentAccountId && !accountIds.has(account.parentAccountId)) {
      throw new Error(
        `Import validation failed: account "${account.id}" references missing parent account "${account.parentAccountId}"`,
      );
    }
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
    if (!accountIds.has(transaction.accountId)) {
      throw new Error(
        `Import validation failed: transaction "${transaction.id}" references missing account "${transaction.accountId}"`,
      );
    }
  }

  for (const budgetScope of data.budgetScopes ?? []) {
    if (!budgetIds.has(budgetScope.budgetId)) {
      throw new Error(
        `Import validation failed: budget scope "${budgetScope.id}" references missing budget "${budgetScope.budgetId}"`,
      );
    }
    if (!accountIds.has(budgetScope.accountId)) {
      throw new Error(
        `Import validation failed: budget scope "${budgetScope.id}" references missing account "${budgetScope.accountId}"`,
      );
    }
  }

  for (const budget of data.budgets ?? []) {
    if (!budget.assetAccountIds) continue;
    for (const rawId of budget.assetAccountIds.split(',')) {
      const assetAccountId = rawId.trim();
      if (!assetAccountId) continue;
      if (!accountIds.has(assetAccountId)) {
        throw new Error(
          `Import validation failed: budget "${budget.id}" references missing asset account "${assetAccountId}"`,
        );
      }
    }
  }

  for (const metadata of data.accountMetadata ?? []) {
    if (!accountIds.has(metadata.accountId)) {
      throw new Error(
        `Import validation failed: account metadata "${metadata.id}" references missing account "${metadata.accountId}"`,
      );
    }
    if (metadata.payFromAccountId && !accountIds.has(metadata.payFromAccountId)) {
      throw new Error(
        `Import validation failed: account metadata "${metadata.id}" references missing payment account "${metadata.payFromAccountId}"`,
      );
    }
  }

  for (const payment of data.plannedPayments ?? []) {
    if (!accountIds.has(payment.fromAccountId) || !accountIds.has(payment.toAccountId)) {
      throw new Error(
        `Import validation failed: planned payment "${payment.id}" references a missing account`,
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

  for (const snapshot of data.balanceSnapshots ?? []) {
    if (!accountIds.has(snapshot.accountId) || !transactionIds.has(snapshot.transactionId)) {
      throw new Error(
        `Import validation failed: balance snapshot "${snapshot.id}" references a missing account or transaction`,
      );
    }
  }

  for (const rule of data.transactionAutoPostRules ?? []) {
    // Review/ignore rules may leave source or category empty (EMPTY_ACCOUNT_ID).
    if (rule.sourceAccountId && !accountIds.has(rule.sourceAccountId)) {
      throw new Error(
        `Import validation failed: auto-post rule "${rule.id}" references missing account "${rule.sourceAccountId}"`,
      );
    }
    if (rule.categoryAccountId && !accountIds.has(rule.categoryAccountId)) {
      throw new Error(
        `Import validation failed: auto-post rule "${rule.id}" references missing account "${rule.categoryAccountId}"`,
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
 * Does not re-check historical debit≡credit / FX math — trust the backup as written.
 */
export function validateImportedData(data: BatchImportData): void {
  validateReferences(data);
}
