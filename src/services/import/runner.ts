import { AppConfig } from '@/src/constants/app-config';
import { database } from '@/src/data/database/Database';
import { BatchImportData, importRepository } from '@/src/data/repositories/ImportRepository';
import { currencyInitService } from '@/src/services/currency-init-service';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { ImportFileContext, ImportPlugin, ImportStats } from '@/src/services/import/types';
import { integrityService } from '@/src/services/integrity-service';
import { workplaceService } from '@/src/services/WorkplaceService';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';

export class ImportRunner {
  /**
   * Helper to create a progress reporter that scales progress into a specific segment of the overall 0-1 range.
   */
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

    // Always include default currency
    codes.add(defaultCurrency);

    // Extract from various data types
    data.accounts?.forEach(a => a.currencyCode && codes.add(a.currencyCode));
    data.journals?.forEach(j => j.currencyCode && codes.add(j.currencyCode));
    data.transactions?.forEach(t => t.currencyCode && codes.add(t.currencyCode));
    data.budgets?.forEach(b => b.currencyCode && codes.add(b.currencyCode));
    data.plannedPayments?.forEach(p => p.currencyCode && codes.add(p.currencyCode));
    data.smsInboxRecords?.forEach(s => s.parsedCurrencyCode && codes.add(s.parsedCurrencyCode));

    return [...codes].filter(Boolean);
  }

  async runImport(
    plugin: ImportPlugin,
    context: ImportFileContext,
    workplaceId: WorkplaceId,
    onProgress?: (message: string, progress?: number) => void,
  ): Promise<ImportStats> {
    logger.info(`[ImportRunner] Starting import orchestration for plugin: ${plugin.id}`);

    // Progress segments definition
    const SEGMENTS = {
      PARSE: { start: 0, end: 0.15 },
      WIPE: { start: 0.15, end: 0.25 },
      INIT: { start: 0.25, end: 0.3 },
      INSERT: { start: 0.3, end: 0.8 }, // Increased segment for insertion
      RATES: { start: 0.8, end: 0.9 },
      INTEGRITY: { start: 0.9, end: 1.0 },
    };

    // 1. Parse data using plugin
    const parseProgress = this.createProgressSegment(
      onProgress,
      SEGMENTS.PARSE.start,
      SEGMENTS.PARSE.end,
    );
    parseProgress(`Parsing ${plugin.name} data...`, 0);

    // Fetch current workplace context for the plugin
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

    // 2. Wipe existing data for this workplace
    const wipeProgress = this.createProgressSegment(
      onProgress,
      SEGMENTS.WIPE.start,
      SEGMENTS.WIPE.end,
    );
    wipeProgress('Resetting workplace storage...', 0);
    logger.info(`[ImportRunner] Resetting workplace ${workplaceId}...`);
    await integrityService.resetWorkplace(workplaceId, true);
    wipeProgress('Resetting workplace storage...', 1);

    // 3. Initialize supported currencies
    const initProgress = this.createProgressSegment(
      onProgress,
      SEGMENTS.INIT.start,
      SEGMENTS.INIT.end,
    );
    initProgress('Initializing native currencies...', 0);
    await currencyInitService.initialize();
    initProgress('Initializing native currencies...', 1);

    // 4. Batch insert data
    const insertProgress = this.createProgressSegment(
      onProgress,
      SEGMENTS.INSERT.start,
      SEGMENTS.INSERT.end,
    );
    insertProgress('Saving records to database...', 0);

    // Filter out currencies from the parsed data to avoid pollution
    const dataToInsert = { ...parsedResult.data };
    if (dataToInsert.currencies) {
      logger.info(
        `[ImportRunner] Ignoring ${dataToInsert.currencies.length} currencies from import file.`,
      );
      delete dataToInsert.currencies;
    }

    await importRepository.batchInsert(workplaceId, dataToInsert, (msg, p) =>
      insertProgress(msg, p ?? 0),
    );

    // 5. Update workplace defaults if provided
    if (parsedResult.workplace?.defaultCurrencyCode) {
      await workplaceService.updateWorkplace(workplaceId, {
        defaultCurrencyCode: parsedResult.workplace.defaultCurrencyCode,
      });
      defaultCurrency = parsedResult.workplace.defaultCurrencyCode;
    }

    // 6. Synchronize exchange rates for used currencies
    const ratesProgress = this.createProgressSegment(
      onProgress,
      SEGMENTS.RATES.start,
      SEGMENTS.RATES.end,
    );

    const currencyCodes = this.getUsedCurrencyCodes(parsedResult.data, defaultCurrency);

    if (currencyCodes.length > 0) {
      ratesProgress(`Updating exchange rates for ${currencyCodes.length} currencies...`, 0);

      // Use Promise.all to sync rates in parallel. syncTodayRates handles internal de-duplication.
      let syncedCount = 0;
      await Promise.all(
        currencyCodes.map(async code => {
          try {
            await exchangeRateService.syncTodayRates(code);
          } catch (e) {
            logger.warn(`[ImportRunner] Rate sync failed for ${code}:`, { error: e });
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

    // 7. Verify data integrity (Running balances, etc.)
    const integrityProgress = this.createProgressSegment(
      onProgress,
      SEGMENTS.INTEGRITY.start,
      SEGMENTS.INTEGRITY.end,
    );
    integrityProgress('Verifying database integrity...', 0);
    await integrityService.forceRunCheck(workplaceId, (msg, p) => integrityProgress(msg, p));

    // 8. Finalize preferences and set active workplace
    if (parsedResult.preferences) {
      const sanitizedPrefs = { ...parsedResult.preferences };
      // Prevent default currency from being overridden by legacy import files
      delete (sanitizedPrefs as any).defaultCurrencyCode;
      await preferences.restorePreferences(sanitizedPrefs);
    }

    // Ensure active workplace is set to the one we just imported into
    preferences.setActiveWorkplaceId(workplaceId);

    logger.info('[ImportRunner] Import completed successfully.');
    onProgress?.('Import completed successfully.', 1);

    return parsedResult.stats;
  }
}

export const importRunner = new ImportRunner();
