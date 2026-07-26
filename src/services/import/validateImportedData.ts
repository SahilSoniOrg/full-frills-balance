import { AppConfig } from '@/src/constants/app-config';
import { TransactionType } from '@/src/data/models/Transaction';
import {
  BatchImportData,
  ImportedJournal,
  ImportedTransaction,
} from '@/src/data/repositories/ImportRepository';
import { checkJournal, JournalLineForCheck } from '@/src/services/accounting/BalanceEffects';
import { CanonicalImport } from '@/src/services/import/canonicalImport';
import { batchImportDataFromCanonical } from '@/src/services/import/canonicalImportAdapter';

function toTransactionType(value: string): TransactionType {
  return value === TransactionType.CREDIT ? TransactionType.CREDIT : TransactionType.DEBIT;
}

function currencyPrecision(data: BatchImportData, currencyCode: string): number {
  const match = data.currencies?.find(c => c.code === currencyCode);
  return match?.precision ?? AppConfig.constants.precision;
}

function journalLabel(journal: ImportedJournal): string {
  const description = journal.description?.trim();
  return description || journal.id;
}

function activeTransactionsForJournal(
  journalId: string,
  transactions: ImportedTransaction[],
): ImportedTransaction[] {
  return transactions.filter(t => t.journalId === journalId && t.deletedAt == null);
}

/** Validates accounting invariants on canonical plugin output before persistence. */
export function validateCanonicalImport(canonical: CanonicalImport): void {
  validateImportedData(batchImportDataFromCanonical(canonical));
}

/**
 * Ensures every non-deleted imported journal satisfies double-entry (debits ≡ credits).
 * Call before wiping or persisting workplace data.
 */
export function validateImportedData(data: BatchImportData): void {
  for (const journal of data.journals) {
    if (journal.deletedAt != null) {
      continue;
    }

    const legs = activeTransactionsForJournal(journal.id, data.transactions);
    const lines: JournalLineForCheck[] = legs.map(t => ({
      amount: t.amount,
      type: toTransactionType(t.transactionType),
      exchangeRate: t.exchangeRate,
    }));

    const precision = currencyPrecision(data, journal.currencyCode);
    const validation = checkJournal(lines, precision);

    if (!validation.isValid) {
      throw new Error(
        `Import validation failed: journal "${journalLabel(journal)}" (${journal.id}) is unbalanced ` +
          `(imbalance: ${validation.imbalance}, debits: ${validation.totalDebits}, credits: ${validation.totalCredits})`,
      );
    }
  }
}
