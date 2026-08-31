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
import { resolveParsedImportBatchData } from '@/src/services/import/canonicalImportAdapter';
import { beginImportRun } from '@/src/services/import/importRun';
import { validateImportedData } from '@/src/services/import/validateImportedData';
import { rebuildAllAccountBalancesAfterImport } from '@/src/services/import/importAccountBalanceRebuild';
import { integrityService } from '@/src/services/integrity';
import { workplaceService } from '@/src/services/WorkplaceService';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { snapshotService } from '@/src/utils/SnapshotService';
import { Q } from '@nozbe/watermelondb';
import { generator } from '@/src/data/database/idGenerator';

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
    workplaceId?: WorkplaceId,
    onProgress?: (message: string, progress?: number) => void,
    options?: { operationId?: WorkplaceId },
  ): Promise<ImportStats> {
    logger.info(`[ImportService] Executing import for plugin: ${plugin.id}`);

    const run = beginImportRun(onProgress);
    const parseProgress = run.phaseReporter('parse');
    parseProgress(`Parsing ${plugin.name} data...`, 0);

    let defaultCurrency = AppConfig.defaultCurrency as string;
    try {
      const workplace = workplaceId
        ? await database.collections.get<Workplace>('workplaces').find(workplaceId)
        : undefined;
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
    const backupResult = workplaceId
      ? await preImportBackupService.createBackup(workplaceId, (message, p) =>
          backupProgress(message, p),
        )
      : { skipped: true, reason: 'empty_workplace' as const };
    let preImportBackupPath: string | undefined;
    if ('path' in backupResult) {
      preImportBackupPath = backupResult.path;
    } else {
      backupProgress('No existing ledger data to back up', 1);
    }

    const existingTargetlessOperation =
      !workplaceId && options?.operationId
        ? await workplaceService.getWorkplace(options.operationId)
        : undefined;
    const publishedWorkplaceId =
      workplaceId ?? options?.operationId ?? (generator() as WorkplaceId);
    const targetlessOperationAlreadyExists = Boolean(existingTargetlessOperation);
    preferences.device.setPendingWorkplaceId(publishedWorkplaceId);

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

    if (workplaceId && !targetlessOperationAlreadyExists) {
      await importRepository.replaceWorkplace(
        workplaceId,
        dataToInsert,
        (msg, p) => insertProgress(msg, p ?? 0),
        parsedResult.workplace,
      );
    }

    // Targetless imports are structurally validated in memory above. Publish
    // the validated graph and its Workplace shell in one transaction only now.
    if (!workplaceId && !targetlessOperationAlreadyExists) {
      await importRepository.batchInsertNewWorkplace(
        {
          id: publishedWorkplaceId,
          name: parsedResult.workplace?.name || 'Imported workplace',
          icon: parsedResult.workplace?.icon || 'briefcase',
          defaultCurrencyCode: parsedResult.workplace?.defaultCurrencyCode || defaultCurrency,
        },
        dataToInsert,
        (msg, p) => insertProgress(msg, p ?? 0),
      );
    } else if (targetlessOperationAlreadyExists) {
      insertProgress('Restore already published; resuming verification...', 1);
    }

    reactiveDataService.clearCache(publishedWorkplaceId);
    snapshotService.clearSnapshotsForWorkplace(publishedWorkplaceId);

    if (parsedResult.workplace?.defaultCurrencyCode) {
      defaultCurrency = parsedResult.workplace.defaultCurrencyCode;
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
    try {
      await integrityService.forceRunCheck(publishedWorkplaceId, (msg, p) =>
        integrityProgress(msg, p * 0.5),
      );
    } catch (error) {
      logger.warn('[ImportService] Post-import integrity check failed:', { error });
      run.recordWarning('Post-import integrity check failed');
    }

    try {
      const accounts = await database.collections
        .get<Account>('accounts')
        .query(Q.where('workplace_id', publishedWorkplaceId))
        .fetch();

      if (accounts.length > 0) {
        logger.info(
          `[ImportService] Rebuilding balance snapshots for ${accounts.length} accounts...`,
        );
        const rebuildConcurrency = AppConfig.performance.import.postImportAccountRebuildConcurrency;
        await rebuildAllAccountBalancesAfterImport(
          publishedWorkplaceId,
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

    try {
      if (parsedResult.preferences || parsedResult.workplacePreferences) {
        const sanitizedPrefs = { ...(parsedResult.preferences ?? {}) };
        if ('defaultCurrencyCode' in sanitizedPrefs) {
          delete (sanitizedPrefs as { defaultCurrencyCode?: string }).defaultCurrencyCode;
        }
        preferences.restoreImportedPreferences(
          { ...sanitizedPrefs, ...parsedResult.workplacePreferences },
          publishedWorkplaceId,
          workplaceId ? 'workplace' : 'all',
        );
      }
    } catch (error) {
      // Database publication is already durable. Preference restoration is a
      // recoverable follow-up and must not turn a successful import into a
      // misleading failure.
      logger.warn('[ImportService] Imported preferences could not be restored', { error });
      run.recordWarning('Imported preferences could not be restored');
    }

    try {
      preferences.device.setActiveWorkplaceId(publishedWorkplaceId);
    } catch (error) {
      logger.warn('[ImportService] Active Workplace pointer could not be saved', { error });
      run.recordWarning('Active Workplace pointer could not be saved');
    }

    try {
      preferences.device.setOnboardingCompleted(true);
    } catch (error) {
      logger.warn('[ImportService] Device completion state could not be saved', { error });
      run.recordWarning('Device completion state could not be saved');
    }

    logger.info('[ImportService] Import completed successfully.');
    run.complete('Import completed successfully.');

    return {
      ...parsedResult.stats,
      ...(preImportBackupPath ? { preImportBackupPath } : {}),
    };
  }
}

export const importService = new ImportService();
