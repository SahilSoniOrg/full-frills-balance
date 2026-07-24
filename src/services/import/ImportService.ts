import { AppConfig } from '@/src/constants/app-config';
import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import {
  BatchImportData,
  ImportedTransactionInboxRecord,
  importRepository,
} from '@/src/data/repositories/ImportRepository';
import { currencyInitService } from '@/src/services/currency-init-service';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { ImportFileContext, ImportPlugin, ImportStats } from '@/src/services/import/types';
import { preImportBackupService } from '@/src/services/import/preImportBackupService';
import { validateImportedData } from '@/src/services/import/validateImportedData';
import { integrityService } from '@/src/services/integrity-service';
import { workplaceService } from '@/src/services/WorkplaceService';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';

export class ImportService {
  private createProgressSegment(
    onProgress: ((message: string, progress: number) => void) | undefined,
    start: number,
    end: number,
  ) {
    const range = end - start;
    return (message: string, progress: number) => {
      onProgress?.(message, start + progress * range);
    };
  }

  private getUsedCurrencyCodes(data: BatchImportData, defaultCurrency: string): string[] {
    const codes = new Set<string>();
    codes.add(defaultCurrency);

    data.accounts?.forEach(a => a.currencyCode && codes.add(a.currencyCode));
    data.journals?.forEach(j => j.currencyCode && codes.add(j.currencyCode));
    data.transactions?.forEach(t => t.currencyCode && codes.add(t.currencyCode));
    data.budgets?.forEach(b => b.currencyCode && codes.add(b.currencyCode));
    data.plannedPayments?.forEach(p => p.currencyCode && codes.add(p.currencyCode));
    data.transactionInboxRecords?.forEach(
      (s: ImportedTransactionInboxRecord) =>
        s.parsedCurrencyCode && codes.add(s.parsedCurrencyCode),
    );

    return [...codes].filter(Boolean);
  }

  /**
   * Orchestrates full data import from a plugin parsing output to persistence.
   */
  async executeImport(
    plugin: ImportPlugin,
    context: ImportFileContext,
    workplaceId: WorkplaceId,
    onProgress?: (message: string, progress?: number) => void,
  ): Promise<ImportStats> {
    logger.info(`[ImportService] Executing import for plugin: ${plugin.id}`);

    const SEGMENTS = {
      PARSE: { start: 0, end: 0.15 },
      BACKUP: { start: 0.15, end: 0.22 },
      WIPE: { start: 0.22, end: 0.3 },
      INIT: { start: 0.3, end: 0.34 },
      INSERT: { start: 0.34, end: 0.82 },
      RATES: { start: 0.82, end: 0.9 },
      INTEGRITY: { start: 0.9, end: 1.0 },
    };

    // 1. Parse file via plugin
    const parseProgress = this.createProgressSegment(
      onProgress,
      SEGMENTS.PARSE.start,
      SEGMENTS.PARSE.end,
    );
    parseProgress(`Parsing ${plugin.name} data...`, 0);

    let defaultCurrency = AppConfig.defaultCurrency as string;
    try {
      const workplace = await database.collections.get<any>('workplaces').find(workplaceId);
      if (workplace?.defaultCurrencyCode) {
        defaultCurrency = workplace.defaultCurrencyCode;
      }
    } catch {
      // Fallback to app default
    }

    const parsedResult = await plugin.parse(context, {
      defaultCurrency,
      onProgress: (msg, p) => parseProgress(msg, p),
    });

    validateImportedData(parsedResult.data);

    // 2. Safety backup before destructive wipe (ADR-0006 phase 3.1)
    const backupProgress = this.createProgressSegment(
      onProgress,
      SEGMENTS.BACKUP.start,
      SEGMENTS.BACKUP.end,
    );
    const backupResult = await preImportBackupService.createBackup(workplaceId, (message, p) =>
      backupProgress(message, p),
    );
    let preImportBackupPath: string | undefined;
    if ('path' in backupResult) {
      preImportBackupPath = backupResult.path;
    } else {
      backupProgress('No existing ledger data to back up', 1);
    }

    // 3. Reset target workplace storage
    const wipeProgress = this.createProgressSegment(
      onProgress,
      SEGMENTS.WIPE.start,
      SEGMENTS.WIPE.end,
    );
    wipeProgress('Resetting workplace storage...', 0);
    await integrityService.resetWorkplace(workplaceId, true);
    wipeProgress('Resetting workplace storage...', 1);

    // 4. Initialize native currencies
    const initProgress = this.createProgressSegment(
      onProgress,
      SEGMENTS.INIT.start,
      SEGMENTS.INIT.end,
    );
    initProgress('Initializing native currencies...', 0);
    await currencyInitService.initialize();
    initProgress('Initializing native currencies...', 1);

    // 5. Insert data using ImportRepository primitives (calculates balances & persists)
    const insertProgress = this.createProgressSegment(
      onProgress,
      SEGMENTS.INSERT.start,
      SEGMENTS.INSERT.end,
    );
    insertProgress('Saving records to database...', 0);

    const dataToInsert = { ...parsedResult.data };
    if (dataToInsert.currencies) {
      delete dataToInsert.currencies;
    }

    await importRepository.batchInsert(workplaceId, dataToInsert, (msg, p) =>
      insertProgress(msg, p ?? 0),
    );

    // 6. Update workplace metadata if provided
    if (
      parsedResult.workplace?.name ||
      parsedResult.workplace?.defaultCurrencyCode ||
      parsedResult.workplace?.icon
    ) {
      await workplaceService.updateWorkplace(workplaceId, {
        name: parsedResult.workplace.name,
        icon: parsedResult.workplace.icon,
        defaultCurrencyCode: parsedResult.workplace.defaultCurrencyCode,
      });
      if (parsedResult.workplace.defaultCurrencyCode) {
        defaultCurrency = parsedResult.workplace.defaultCurrencyCode;
      }
    }

    // 7. Synchronize exchange rates for used currencies
    const ratesProgress = this.createProgressSegment(
      onProgress,
      SEGMENTS.RATES.start,
      SEGMENTS.RATES.end,
    );

    const currencyCodes = this.getUsedCurrencyCodes(parsedResult.data, defaultCurrency);
    if (currencyCodes.length > 0) {
      ratesProgress(`Updating exchange rates for ${currencyCodes.length} currencies...`, 0);

      let syncedCount = 0;
      await Promise.all(
        currencyCodes.map(async code => {
          try {
            await exchangeRateService.syncTodayRates(code);
          } catch (e) {
            logger.warn(`[ImportService] Rate sync failed for ${code}:`, { error: e });
          } finally {
            syncedCount++;
            ratesProgress(
              `Updating exchange rates (${syncedCount}/${currencyCodes.length})...`,
              syncedCount / currencyCodes.length,
            );
          }
        }),
      );
    }

    // 8. Verify data integrity & rebuild balance snapshots
    const integrityProgress = this.createProgressSegment(
      onProgress,
      SEGMENTS.INTEGRITY.start,
      SEGMENTS.INTEGRITY.end,
    );
    integrityProgress('Verifying database integrity...', 0);
    await integrityService.forceRunCheck(workplaceId, (msg, p) => integrityProgress(msg, p * 0.5));

    try {
      const { Q } = await import('@nozbe/watermelondb');
      const accounts = await database.collections
        .get<Account>('accounts')
        .query(Q.where('workplace_id', workplaceId))
        .fetch();

      if (accounts.length > 0) {
        logger.info(
          `[ImportService] Rebuilding balance snapshots for ${accounts.length} accounts...`,
        );
        const { accountingRebuildService } =
          await import('@/src/services/AccountingRebuildService');
        let completed = 0;
        await Promise.all(
          accounts.map(async account => {
            await accountingRebuildService.rebuildAccountBalances(workplaceId, account.id);
            completed++;
            integrityProgress(
              `Rebuilding checkpoints: ${account.name} (${completed}/${accounts.length})`,
              0.5 + (completed / accounts.length) * 0.5,
            );
          }),
        );
      }
    } catch (error) {
      logger.error('[ImportService] Failed to rebuild balance snapshots post-import:', error);
    }

    // 9. Restore preferences & activate workplace
    if (parsedResult.preferences) {
      const sanitizedPrefs = { ...parsedResult.preferences };
      delete (sanitizedPrefs as any).defaultCurrencyCode;
      await preferences.restorePreferences(sanitizedPrefs);
    }

    preferences.setActiveWorkplaceId(workplaceId);
    preferences.setOnboardingCompleted(true);

    logger.info('[ImportService] Import completed successfully.');
    onProgress?.('Import completed successfully.', 1);

    return {
      ...parsedResult.stats,
      ...(preImportBackupPath ? { preImportBackupPath } : {}),
    };
  }
}

export const importService = new ImportService();
