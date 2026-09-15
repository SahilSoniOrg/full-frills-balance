import { AppConfig } from '@/src/constants/app-config';
import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import type { BatchImportData, CanonicalTransactionInboxRecord } from '@/src/types/importContracts';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { currencyInitService } from '@/src/services/currency-init-service';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { rebuildAllAccountBalancesAfterImport } from '@/src/services/import/importAccountBalanceRebuild';
import { resolveParsedImportBatchData } from '@/src/services/import/canonicalImportAdapter';
import { backfillHistoricalExchangeRates } from '@/src/services/import/historicalExchangeRateBackfill';
import { forceRunCheck } from '@/src/services/integrity';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { snapshotService } from '@/src/utils/SnapshotService';
import { preferences } from '@/src/services/preferences';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { logger } from '@/src/utils/logger';
import { restorePublicationClaims } from './restorePublicationClaims';
import type { WorkplaceId } from '@/src/types/ids';
import type {
  PreparedRestore,
  PublishRestoreOptions,
  RestoreHandoff,
  RestorePublicationCorrections,
} from './restoreTypes';

function usedCurrencyCodes(data: BatchImportData, defaultCurrency: string): string[] {
  const codes = new Set<string>();
  if (defaultCurrency) codes.add(defaultCurrency);
  data.accounts?.forEach(record => record.currencyCode && codes.add(record.currencyCode));
  data.journals?.forEach(record => record.currencyCode && codes.add(record.currencyCode));
  data.transactions?.forEach(record => record.currencyCode && codes.add(record.currencyCode));
  data.budgets?.forEach(record => record.currencyCode && codes.add(record.currencyCode));
  data.plannedPayments?.forEach(record => record.currencyCode && codes.add(record.currencyCode));
  data.transactionInboxRecords?.forEach((record: CanonicalTransactionInboxRecord) => {
    if (record.parsedCurrencyCode) codes.add(record.parsedCurrencyCode);
  });
  return [...codes].filter(Boolean);
}

function report(
  callback: PublishRestoreOptions['onProgress'],
  message: string,
  progress: number,
): void {
  callback?.(message, Math.min(1, Math.max(0, progress)));
}

function assertCorrections(corrections: RestorePublicationCorrections): void {
  if (!corrections.name.trim()) throw new Error('Restore publication requires a Workplace name');
  if (!corrections.icon.trim()) throw new Error('Restore publication requires a Workplace icon');
  if (!corrections.defaultCurrencyCode.trim()) {
    throw new Error('Restore publication requires a base currency');
  }
}

function assertOperationMatch(
  existing: { name: string; icon: string; defaultCurrencyCode: string },
  corrections: RestorePublicationCorrections,
): void {
  if (
    existing.name !== corrections.name.trim() ||
    existing.icon !== corrections.icon.trim() ||
    existing.defaultCurrencyCode !== corrections.defaultCurrencyCode.trim().toUpperCase()
  ) {
    throw new Error('Restore operation ID is already owned by a different Workplace');
  }
}

async function runPostPublicationChecks(
  workplaceId: WorkplaceId,
  data: BatchImportData,
  defaultCurrency: string,
  callback: PublishRestoreOptions['onProgress'],
  warnings: string[],
): Promise<void> {
  reactiveDataService.clearCache(workplaceId);
  snapshotService.clearSnapshotsForWorkplace(workplaceId);

  const currencies = usedCurrencyCodes(data, defaultCurrency);
  if (currencies.length > 0) {
    let completed = 0;
    await Promise.all(
      currencies.map(async code => {
        try {
          await exchangeRateService.syncTodayRates(code);
        } catch (error) {
          logger.warn(`[RestorePublication] Exchange rate sync failed for ${code}`, { error });
          warnings.push(`Exchange rate sync failed for ${code}`);
        } finally {
          completed += 1;
          report(
            callback,
            `Updating exchange rates (${completed}/${currencies.length})...`,
            0.72 + (completed / currencies.length) * 0.14,
          );
        }
      }),
    );
  }

  try {
    await forceRunCheck(workplaceId, (message, progress) =>
      report(callback, message, 0.86 + progress * 0.07),
    );
  } catch (error) {
    logger.warn('[RestorePublication] Integrity check failed after publication', { error });
    warnings.push('Post-import integrity check failed');
  }

  try {
    const accounts = await database.collections.get<Account>('accounts').query().fetch();
    const workplaceAccounts = accounts.filter(account => account.workplaceId === workplaceId);
    if (workplaceAccounts.length > 0) {
      await rebuildAllAccountBalancesAfterImport(
        workplaceId,
        workplaceAccounts,
        AppConfig.performance.import.postImportAccountRebuildConcurrency,
        (_account, completedAccounts, total) =>
          report(
            callback,
            `Rebuilding checkpoints (${completedAccounts}/${total})...`,
            0.93 + (completedAccounts / total) * 0.07,
          ),
      );
    }
  } catch (error) {
    logger.warn('[RestorePublication] Balance rebuild failed after publication', { error });
    warnings.push('Post-import balance rebuild failed');
  }
}

/**
 * Publish a prepared restore under a stable operation ID.
 *
 * The only durable import write here is the atomic Workplace/books transaction. This
 * function deliberately does not register the Device, activate a Workplace, or write
 * User preferences; those belong to Setup finishers. Repeating the operation ID returns
 * the already-published shell after verifying its identity.
 */
export async function publishRestore(
  prepared: PreparedRestore,
  options: PublishRestoreOptions,
): Promise<RestoreHandoff> {
  const { operationId, corrections, onProgress } = options;
  assertCorrections(corrections);
  if (!operationId) throw new Error('Restore publication requires an operation ID');

  const normalizedCorrections = {
    name: corrections.name.trim(),
    icon: corrections.icon.trim(),
    defaultCurrencyCode: corrections.defaultCurrencyCode.trim().toUpperCase(),
  };
  // Claim before publication so interruption cannot create books whose source
  // identity was never recorded.
  restorePublicationClaims.claim(operationId, prepared.fingerprint);
  const warnings = [...prepared.warnings];
  const existing = await workplaceRepository.find(operationId);
  let published = existing;

  if (existing) {
    assertOperationMatch(existing, normalizedCorrections);
    report(onProgress, 'Restore already published; verifying Workplace...', 0.72);
  } else {
    const sourceData = resolveParsedImportBatchData({ canonical: prepared.canonicalData });
    const backfilled = await backfillHistoricalExchangeRates(
      sourceData,
      normalizedCorrections.defaultCurrencyCode,
    );
    warnings.push(...backfilled.warnings);
    // The repository owns the database transaction and balance preparation. Keeping this
    // call as one operation is what prevents a partially published Workplace graph.
    report(onProgress, 'Saving restored Workplace...', 0.28);
    try {
      await currencyInitService.initialize();
      published = await importRepository.batchInsertNewWorkplace(
        {
          id: operationId,
          name: normalizedCorrections.name,
          icon: normalizedCorrections.icon,
          defaultCurrencyCode: normalizedCorrections.defaultCurrencyCode,
        },
        backfilled.data,
        (message, progress) => report(onProgress, message, 0.28 + (progress ?? 0) * 0.44),
      );
    } catch (error) {
      // A concurrent invocation may have won the same operation ID between our read and
      // insert. Re-read before surfacing failure so retries remain idempotent.
      const published = await workplaceRepository.find(operationId);
      if (!published) throw error;
      assertOperationMatch(published, normalizedCorrections);
    }
  }

  published ??= await workplaceRepository.find(operationId);
  if (!published) throw new Error(`Restore Workplace was not published: ${operationId}`);
  assertOperationMatch(published, normalizedCorrections);

  // Workplace preferences are intentionally isolated from User preferences. Optional
  // chaining also keeps this seam easy to exercise with a minimal test double.
  const workplacePreferences = prepared.facts.workplacePreferences;
  if (workplacePreferences && Object.keys(workplacePreferences).length > 0) {
    preferences.workplace?.replace(operationId, workplacePreferences);
  }

  const data = resolveParsedImportBatchData({ canonical: prepared.canonicalData });
  await runPostPublicationChecks(
    operationId,
    data,
    normalizedCorrections.defaultCurrencyCode,
    onProgress,
    warnings,
  );
  report(onProgress, 'Restore published successfully.', 1);

  return {
    operationId,
    workplaceId: operationId,
    fingerprint: prepared.fingerprint,
    stats: { ...prepared.stats, workplaceId: operationId },
    facts: prepared.facts,
    warnings,
  };
}
