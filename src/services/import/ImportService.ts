import { AppConfig } from '@/src/constants/app-config';
import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import Workplace from '@/src/data/models/Workplace';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import type {
  BatchImportData,
  ImportedTransactionInboxRecord,
} from '@/src/data/repositories/importTypes';
import { currencyInitService } from '@/src/services/currency-init-service';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { ImportFileContext, ImportPlugin, ImportStats } from '@/src/services/import/types';
import { preImportBackupService } from '@/src/services/import/preImportBackupService';
import {
  commitStagedImport,
  createImportStagingWorkplace,
  discardImportStagingWorkplace,
} from '@/src/services/import/importStaging';
import { resolveParsedImportBatchData } from '@/src/services/import/canonicalImportAdapter';
import { beginImportRun } from '@/src/services/import/importRun';
import { validateImportedData } from '@/src/services/import/validateImportedData';
import { rebuildAllAccountBalancesAfterImport } from '@/src/services/import/importAccountBalanceRebuild';
import { integrityService } from '@/src/services/integrity';
import { workplaceService } from '@/src/services/WorkplaceService';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { Q } from '@nozbe/watermelondb';

export class ImportService {
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

    const run = beginImportRun(onProgress);
    const parseProgress = run.phaseReporter('parse');
    parseProgress(`Parsing ${plugin.name} data...`, 0);

    let defaultCurrency = AppConfig.defaultCurrency as string;
    try {
      const workplace = await database.collections.get<Workplace>('workplaces').find(workplaceId);
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

    // Resolve once, then validate the same object that will be inserted.
    const importBatchData = resolveParsedImportBatchData(parsedResult);
    validateImportedData(importBatchData);

    const backupProgress = run.phaseReporter('backup');
    const backupResult = await preImportBackupService.createBackup(workplaceId, (message, p) =>
      backupProgress(message, p),
    );
    let preImportBackupPath: string | undefined;
    if ('path' in backupResult) {
      preImportBackupPath = backupResult.path;
    } else {
      backupProgress('No existing ledger data to back up', 1);
    }

    const stageProgress = run.phaseReporter('stage');
    stageProgress('Preparing staged import...', 0);
    const stagingWorkplaceId = await createImportStagingWorkplace(workplaceId, defaultCurrency);
    stageProgress('Preparing staged import...', 1);

    const initProgress = run.phaseReporter('init');
    initProgress('Initializing native currencies...', 0);
    await currencyInitService.initialize();
    initProgress('Initializing native currencies...', 1);

    const insertProgress = run.phaseReporter('insert');
    insertProgress('Saving records to database...', 0);

    const dataToInsert = { ...importBatchData };
    if (dataToInsert.currencies) {
      delete dataToInsert.currencies;
    }

    try {
      await importRepository.batchInsert(stagingWorkplaceId, dataToInsert, (msg, p) =>
        insertProgress(msg, p ?? 0),
      );

      const stagingCheckProgress = run.phaseReporter('staging_check');
      stagingCheckProgress('Verifying staged import...', 0);
      await integrityService.forceRunCheck(stagingWorkplaceId, (msg, p) =>
        stagingCheckProgress(msg, p),
      );
      stagingCheckProgress('Verifying staged import...', 1);

      const swapProgress = run.phaseReporter('swap');
      swapProgress('Applying import to workplace...', 0);
      await commitStagedImport(workplaceId, stagingWorkplaceId);
      swapProgress('Applying import to workplace...', 1);
    } catch (error) {
      await discardImportStagingWorkplace(stagingWorkplaceId).catch(cleanupError => {
        logger.error('[ImportService] Staging cleanup after failed import:', cleanupError);
      });
      throw error;
    }

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

    const ratesProgress = run.phaseReporter('rates');

    const currencyCodes = this.getUsedCurrencyCodes(importBatchData, defaultCurrency);
    if (currencyCodes.length > 0) {
      ratesProgress(`Updating exchange rates for ${currencyCodes.length} currencies...`, 0);

      let syncedCount = 0;
      await Promise.all(
        currencyCodes.map(async code => {
          try {
            await exchangeRateService.syncTodayRates(code);
          } catch (e) {
            const message = `Exchange rate sync failed for ${code}`;
            logger.warn(`[ImportService] ${message}:`, { error: e });
            run.recordWarning(message);
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

    const integrityProgress = run.phaseReporter('integrity');
    integrityProgress('Verifying database integrity...', 0);
    await integrityService.forceRunCheck(workplaceId, (msg, p) => integrityProgress(msg, p * 0.5));

    try {
      const accounts = await database.collections
        .get<Account>('accounts')
        .query(Q.where('workplace_id', workplaceId))
        .fetch();

      if (accounts.length > 0) {
        logger.info(
          `[ImportService] Rebuilding balance snapshots for ${accounts.length} accounts...`,
        );
        const rebuildConcurrency = AppConfig.performance.import.postImportAccountRebuildConcurrency;
        await rebuildAllAccountBalancesAfterImport(
          workplaceId,
          accounts,
          rebuildConcurrency,
          (account, completed, total) => {
            integrityProgress(
              `Rebuilding checkpoints: ${account.name} (${completed}/${total})`,
              0.5 + completed / total / 2,
            );
          },
        );
      }
    } catch (error) {
      logger.error('[ImportService] Failed to rebuild balance snapshots post-import:', error);
      run.recordWarning('Post-import balance rebuild failed');
    }

    if (parsedResult.preferences) {
      const sanitizedPrefs = { ...parsedResult.preferences };
      if ('defaultCurrencyCode' in sanitizedPrefs) {
        delete (sanitizedPrefs as { defaultCurrencyCode?: string }).defaultCurrencyCode;
      }
      // Import target workplace is authoritative; never adopt a backup's workplace id.
      if ('activeWorkplaceId' in sanitizedPrefs) {
        delete (sanitizedPrefs as { activeWorkplaceId?: string }).activeWorkplaceId;
      }
      // App-lock state is device-local security configuration, never backup data.
      if ('isAppLockEnabled' in sanitizedPrefs) {
        delete (sanitizedPrefs as { isAppLockEnabled?: boolean }).isAppLockEnabled;
      }
      await preferences.restorePreferences(sanitizedPrefs);
    }

    preferences.setActiveWorkplaceId(workplaceId);
    preferences.setOnboardingCompleted(true);

    logger.info('[ImportService] Import completed successfully.');
    run.complete('Import completed successfully.');

    return {
      ...parsedResult.stats,
      ...(preImportBackupPath ? { preImportBackupPath } : {}),
    };
  }
}

export const importService = new ImportService();
