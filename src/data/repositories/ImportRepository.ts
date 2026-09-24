import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { prepareAuxiliaryImportRecords } from '@/src/data/repositories/importAuxiliaryWriters';
import { prepareCoreImportRecords } from '@/src/data/repositories/importCoreWriters';
import {
  calculateImportRunningBalances,
  applyImportBalancePatches,
} from '@/src/data/repositories/importBalanceCalculator';
import type { BatchImportData } from '@/src/types/importContracts';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import Workplace from '@/src/data/models/Workplace';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { Model } from '@nozbe/watermelondb';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { evaluateJournalBalance } from '@/src/domain/accounting/journalBalanceEvaluator';
import { JournalStatus } from '@/src/types/enums';
import { toJournalStatus, toTransactionType } from '@/src/data/repositories/importValueParsers';

export class ImportRepository {
  private async prepareImportData(
    data: BatchImportData,
    onProgress?: (message: string, progress?: number) => void,
  ): Promise<void> {
    const balancePatches = await calculateImportRunningBalances(data, onProgress);
    applyImportBalancePatches(data, balancePatches);
  }

  private prepareOperations(workplaceId: WorkplaceId, data: BatchImportData): Model[] {
    return [
      ...prepareCoreImportRecords(
        workplaceId,
        {
          accounts: database.collections.get<Account>('accounts'),
          journals: database.collections.get<Journal>('journals'),
          transactions: database.collections.get<Transaction>('transactions'),
        },
        { accounts: data.accounts, journals: data.journals, transactions: data.transactions },
      ),
      ...prepareAuxiliaryImportRecords(workplaceId, data),
    ];
  }

  private async validatePostedJournalBalances(data: BatchImportData): Promise<void> {
    const accountsById = new Map(data.accounts.map(account => [account.id, account]));
    const transactionsByJournalId = new Map<string, BatchImportData['transactions']>();
    for (const transaction of data.transactions) {
      if (transaction.deletedAt) continue;
      const lines = transactionsByJournalId.get(transaction.journalId) ?? [];
      lines.push(transaction);
      transactionsByJournalId.set(transaction.journalId, lines);
    }

    const postedJournals = data.journals.filter(
      journal => !journal.deletedAt && toJournalStatus(journal.status) === JournalStatus.POSTED,
    );
    if (postedJournals.length === 0) return;

    const currencyPrecision = new Map(
      (data.currencies ?? []).map(currency => [
        currency.code.trim().toUpperCase(),
        currency.precision,
      ]),
    );
    const currencyCodes = new Set<string>();
    for (const journal of postedJournals) {
      currencyCodes.add(journal.currencyCode.trim().toUpperCase());
      for (const transaction of transactionsByJournalId.get(journal.id) ?? []) {
        const account = accountsById.get(transaction.accountId);
        const accountCurrency = account && !account.deletedAt ? account.currencyCode : undefined;
        if (accountCurrency) currencyCodes.add(accountCurrency.trim().toUpperCase());
      }
    }
    for (const code of currencyCodes) {
      if (!currencyPrecision.has(code)) {
        currencyPrecision.set(code, await currencyRepository.getPrecision(code));
      }
    }

    for (const journal of postedJournals) {
      const lines = transactionsByJournalId.get(journal.id) ?? [];
      const evaluation = evaluateJournalBalance({
        journalCurrency: journal.currencyCode,
        precisionByCurrency: currencyPrecision,
        lines: lines.map(transaction => {
          const account = accountsById.get(transaction.accountId);
          return {
            id: transaction.id,
            accountId: transaction.accountId,
            accountCurrency: account && !account.deletedAt ? account.currencyCode : undefined,
            amount: transaction.amount,
            exchangeRate: transaction.exchangeRate,
            transactionType: toTransactionType(transaction.transactionType),
          };
        }),
      });
      if (!evaluation.isBalanced) {
        const details = evaluation.issues.map(issue => issue.message).join('; ');
        throw new Error(
          `Restore rejected: posted journal ${journal.id} is invalid or unbalanced${details ? `: ${details}` : ''}`,
        );
      }
    }
  }

  private async batchPreparedOperations(
    operations: Model[],
    onProgress?: (message: string, progress?: number) => void,
    atomic = false,
  ): Promise<void> {
    if (operations.length === 0) return;
    if (atomic) {
      onProgress?.(`Saving ${operations.length} records...`, 0);
      await database.batch(operations);
      onProgress?.('Saving records complete.', 1);
      return;
    }
    const chunkSize = 5000;
    logger.info(
      `[ImportRepository] Starting batch insert of ${operations.length} operations in chunks of ${chunkSize}...`,
    );
    for (let index = 0; index < operations.length; index += chunkSize) {
      const chunk = operations.slice(index, index + chunkSize);
      const currentCount = index + chunk.length;
      onProgress?.(
        `Saving records (${Math.min(currentCount, operations.length)}/${operations.length})...`,
        index / operations.length,
      );
      await database.batch(chunk);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    onProgress?.('Saving records complete.', 1);
    logger.info('[ImportRepository] Batch insert complete.');
  }

  async batchInsert(
    workplaceId: WorkplaceId,
    data: BatchImportData,
    onProgress?: (message: string, progress?: number) => void,
  ): Promise<void> {
    await this.prepareImportData(data, onProgress);

    await database.write(async () => {
      await this.batchPreparedOperations(this.prepareOperations(workplaceId, data), onProgress);
    });
  }

  /** Publishes a new Workplace and its imported records in one transaction. */
  async batchInsertNewWorkplace(
    workplace: {
      id: WorkplaceId;
      name: string;
      icon: string;
      defaultCurrencyCode: string;
    },
    data: BatchImportData,
    onProgress?: (message: string, progress?: number) => void,
  ): Promise<Workplace> {
    await this.prepareImportData(data, onProgress);
    await this.validatePostedJournalBalances(data);

    let created!: Workplace;
    await database.write(async () => {
      created = workplaceRepository.prepareCreate(workplace);
      await this.batchPreparedOperations(
        [created, ...this.prepareOperations(workplace.id, data)],
        onProgress,
        true,
      );
    });
    return created;
  }
}

export const importRepository = new ImportRepository();
