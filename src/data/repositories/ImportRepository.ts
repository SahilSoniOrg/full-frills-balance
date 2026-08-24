import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { applyImportChanges, ImportChanges } from '@/src/data/repositories/importChangeApplier';
import { prepareAuxiliaryImportRecords } from '@/src/data/repositories/importAuxiliaryWriters';
import { prepareCoreImportRecords } from '@/src/data/repositories/importCoreWriters';
import {
  calculateImportRunningBalances,
  applyImportBalancePatches,
} from '@/src/data/repositories/importBalanceCalculator';
import type { BatchImportData } from '@/src/data/repositories/importTypes';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';

export class ImportRepository {
  async batchInsert(
    workplaceId: WorkplaceId,
    data: BatchImportData,
    onProgress?: (message: string, progress?: number) => void,
  ): Promise<void> {
    const balancePatches = await calculateImportRunningBalances(data, onProgress);
    applyImportBalancePatches(data, balancePatches);

    await database.write(async () => {
      const operations = [
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

      if (operations.length === 0) return;

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
    });
  }

  async applyChanges(workplaceId: WorkplaceId, data: ImportChanges): Promise<void> {
    await applyImportChanges(workplaceId, data);
  }
}

export const importRepository = new ImportRepository();
