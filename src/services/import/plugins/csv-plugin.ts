import { CanonicalImportBuilder } from '@/src/services/import/canonicalImportBuilder';
import {
  CsvColumnMapping,
  detectColumns,
  findHeaderRow,
  HeaderDetectionResult,
  parseAmountString,
  parseCsvRows,
  parseFlexibleDate,
} from '@/src/services/import/plugins/csv/csvParser';
import { ImportFileContext, ImportPlugin, ParsedImportResult } from '@/src/services/import/types';
import { AccountType } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';

// Re-export parser utilities for backwards compatibility & tests
export { parseCsvRows, parseAmountString, parseFlexibleDate, detectColumns, findHeaderRow };
export type { CsvColumnMapping, HeaderDetectionResult };

export const csvPlugin: ImportPlugin = {
  id: 'csv',
  name: 'CSV Statement / Export',
  description: 'Import bank statements or transaction spreadsheets in standard CSV format.',
  icon: '📄',

  detect(context: ImportFileContext): boolean {
    const isCsvExt =
      context.name.toLowerCase().endsWith('.csv') || context.name.toLowerCase().endsWith('.tsv');

    if (isCsvExt) return true;

    if (context.text) {
      const rows = parseCsvRows(context.text);
      if (rows.length > 1) {
        return findHeaderRow(rows) !== null;
      }
    }

    return false;
  },

  async parse(
    context: ImportFileContext,
    options: {
      defaultCurrency: string;
      onProgress?: (message: string, progress: number) => void;
    },
  ): Promise<ParsedImportResult> {
    const { defaultCurrency, onProgress } = options;
    logger.info('[CsvPlugin] Parsing CSV file...');
    onProgress?.('Reading CSV rows...', 0.1);

    if (!context.text) {
      throw new Error('CSV text content is missing.');
    }

    const rows = parseCsvRows(context.text);
    if (rows.length < 2) {
      throw new Error('CSV file contains no transaction rows.');
    }

    const headerResult = findHeaderRow(rows);
    if (!headerResult) {
      throw new Error('Could not identify date and amount columns in CSV header.');
    }

    const { headerIndex, mapping } = headerResult;

    onProgress?.('Preparing double-entry import...', 0.3);
    const builder = new CanonicalImportBuilder(defaultCurrency);
    const defaultAccountId = 'csv-account-default';
    let hasCustomAccounts = false;

    const registeredAccounts = new Set<string>();
    const registeredCategories = new Set<string>();

    let skippedTransactions = 0;
    const dataRows = rows.slice(headerIndex + 1);
    const totalRows = dataRows.length;

    for (let i = 0; i < totalRows; i++) {
      if (i % 500 === 0) {
        onProgress?.(`Ingesting rows (${i}/${totalRows})...`, 0.3 + (i / totalRows) * 0.6);
        await new Promise(r => setTimeout(r, 0));
      }

      const row = dataRows[i];
      if (row.length <= mapping.dateCol) {
        skippedTransactions++;
        continue;
      }

      const dateStr = row[mapping.dateCol];
      const date = parseFlexibleDate(dateStr);
      const desc =
        mapping.descCol !== undefined && row[mapping.descCol]
          ? row[mapping.descCol]
          : 'Transaction';
      const notes = mapping.notesCol !== undefined ? row[mapping.notesCol] : undefined;

      // Determine amount and type
      let amount = 0;
      let type: 'EXPENSE' | 'INCOME' = 'EXPENSE';

      if (mapping.debitCol !== undefined || mapping.creditCol !== undefined) {
        const debitVal =
          mapping.debitCol !== undefined && row[mapping.debitCol]
            ? parseAmountString(row[mapping.debitCol])
            : null;
        const creditVal =
          mapping.creditCol !== undefined && row[mapping.creditCol]
            ? parseAmountString(row[mapping.creditCol])
            : null;

        if (creditVal !== null && Math.abs(creditVal) > 0) {
          amount = Math.abs(creditVal);
          type = 'INCOME';
        } else if (debitVal !== null && Math.abs(debitVal) > 0) {
          amount = Math.abs(debitVal);
          type = 'EXPENSE';
        } else if (mapping.amountCol !== undefined && row[mapping.amountCol]) {
          const rawAmt = parseAmountString(row[mapping.amountCol]);
          if (rawAmt === null) {
            skippedTransactions++;
            continue;
          }
          amount = Math.abs(rawAmt);
          type = rawAmt < 0 ? 'EXPENSE' : 'INCOME';
        } else {
          skippedTransactions++;
          continue;
        }
      } else if (mapping.amountCol !== undefined && row[mapping.amountCol]) {
        const rawAmt = parseAmountString(row[mapping.amountCol]);
        if (rawAmt === null) {
          skippedTransactions++;
          continue;
        }
        amount = Math.abs(rawAmt);
        type = rawAmt < 0 ? 'EXPENSE' : 'INCOME';
      } else {
        skippedTransactions++;
        continue;
      }

      // Account
      let accountId = defaultAccountId;
      if (mapping.accountCol !== undefined && row[mapping.accountCol]) {
        const accName = row[mapping.accountCol].trim();
        if (accName) {
          accountId = `csv-acc-${accName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
          hasCustomAccounts = true;
          if (!registeredAccounts.has(accountId)) {
            registeredAccounts.add(accountId);
            builder.addAccount({
              id: accountId,
              name: accName,
              currencyCode: defaultCurrency,
              accountType: AccountType.ASSET,
            });
          }
        }
      }

      // Category
      let categoryId: string | undefined;
      if (mapping.categoryCol !== undefined && row[mapping.categoryCol]) {
        const catName = row[mapping.categoryCol].trim();
        if (catName) {
          categoryId = `csv-cat-${catName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
          if (!registeredCategories.has(categoryId)) {
            registeredCategories.add(categoryId);
            builder.registerCategory({
              id: categoryId,
              name: catName,
            });
          }
        }
      }

      builder.addTransaction({
        date,
        amount,
        currencyCode: defaultCurrency,
        type,
        sourceAccountId: accountId,
        categoryId,
        description: desc,
        notes,
      });
    }

    if (!hasCustomAccounts) {
      builder.addAccount({
        id: defaultAccountId,
        name: `Imported Account (${defaultCurrency})`,
        currencyCode: defaultCurrency,
        accountType: AccountType.ASSET,
        description: `Imported from ${context.name}`,
      });
    }

    onProgress?.('Finalizing canonical import...', 0.95);
    const { canonical, issues } = builder.build();

    const skippedItems = issues.map(issue => ({
      type: issue.entity,
      id: issue.sourceId || 'builder-issue',
      reason: issue.message,
    }));

    onProgress?.('Parsing complete', 1.0);
    logger.info(`[CsvPlugin] Parse successful: ${canonical.transactions.length} transactions.`);

    return {
      canonical,
      workplace: { defaultCurrencyCode: defaultCurrency },
      stats: {
        accounts: canonical.accounts.length,
        journals: canonical.journals.length,
        transactions: canonical.transactions.length,
        budgets: canonical.budgets?.length || 0,
        plannedPayments: canonical.plannedPayments?.length || 0,
        auditLogs: 0,
        skippedTransactions:
          skippedTransactions + issues.filter(i => i.severity === 'error').length,
        skippedItems,
      },
    };
  },
};
