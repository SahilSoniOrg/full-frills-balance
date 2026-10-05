import { IconName } from '@/src/types/domainIcons';
import { AccountType } from '@/src/types/enums';
import { PlainWorkplace } from '@/src/types/plainDtos';
import { WorkplaceId } from '@/src/types/ids';

import Workplace, { toPlainWorkplace } from '@/src/data/models/Workplace';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { analytics } from '@/src/services/analytics';
import { preferences, preferencesMigration } from '@/src/services/preferences';
import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { generator } from '@/src/data/database/idGenerator';
import { WORKPLACE_SCOPED_TABLE_NAMES } from '@/src/services/workplace/workplaceDataTables';
import { countAccountsVsCategories } from '@/src/utils/accountCategory';
import { logger } from '@/src/utils/logger';
import { snapshotService } from '@/src/utils/SnapshotService';
import { reactiveCacheCoordinator } from '@/src/services/reactive/ReactiveCacheCoordinator';
import { widgetProjectionService } from '@/src/services/widgets/WidgetProjectionService';
import { distinctUntilChanged, map, Observable } from 'rxjs';

export class WorkplaceService {
  private transitionQueue: Promise<void> = Promise.resolve();

  private serializeTransition<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.transitionQueue.then(operation, operation);
    this.transitionQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /**
   * Publish a Workplace and every starter account as one database batch.
   * Supplying an id makes retries idempotent.
   */
  async createWorkplace(
    name: string,
    icon: string,
    options: {
      id?: WorkplaceId;
      initialAccounts?: { name: string; type: AccountType; icon: IconName }[];
      initialCategories?: { name: string; type: AccountType; icon: IconName }[];
      currencyCode: string;
    },
  ): Promise<Workplace> {
    const workplaceId = options.id ?? (generator() as WorkplaceId);
    const existing = await this.getWorkplace(workplaceId);
    if (existing) {
      snapshotService.resumeSnapshotsForWorkplace(workplaceId);
      widgetProjectionService.resumeWorkplace(workplaceId);
      return existing;
    }

    let workplace: Workplace;
    try {
      workplace = await workplaceRepository.createWithStarterAccounts({
        id: workplaceId,
        name,
        icon,
        defaultCurrencyCode: options.currencyCode,
        accounts: options.initialAccounts ?? [],
        categories: options.initialCategories ?? [],
      });
    } catch (error) {
      // A concurrent retry can pass the preflight lookup before the first
      // transaction publishes the same operation ID. Re-read after the
      // collision so retries remain idempotent without hiding real failures.
      const published = await this.getWorkplace(workplaceId);
      if (published) return published;
      throw error;
    }
    snapshotService.resumeSnapshotsForWorkplace(workplaceId);
    widgetProjectionService.resumeWorkplace(workplaceId);
    analytics.trackFeatureUsage('settings', 'workplace_created', {
      name_length: name.length,
      icon,
    });
    return workplace;
  }

  /** Validate the destination before publishing the Device active pointer. */
  async switchWorkplace(id: WorkplaceId): Promise<void> {
    return this.serializeTransition(async () => {
      if (!id) throw new Error('Invalid workplaceId');
      const target = await this.getWorkplace(id);
      if (!target) throw new Error(`Workplace not found: ${id}`);
      snapshotService.resumeSnapshotsForWorkplace(id);
      widgetProjectionService.resumeWorkplace(id);
      const previousId = preferences.device.activeWorkplaceId;
      if (previousId === id) return;
      this.publishActiveWorkplace(id);
      if (previousId) {
        analytics.trackFeatureUsage('settings', 'workplace_switched', {
          fromId: previousId,
          toId: id,
        });
      }
    });
  }

  publishActiveWorkplace(id: WorkplaceId): void {
    preferences.device.setActiveWorkplaceId(id);
  }

  async getWorkplace(id: WorkplaceId): Promise<Workplace | undefined> {
    return await workplaceRepository.find(id);
  }

  /** Asset/liability vs income/expense counts. Restore UI reads this only through loadRestoreSummary. */
  async getPublishedBookStats(workplaceId: WorkplaceId): Promise<{
    readonly accounts: number;
    readonly categories: number;
    readonly journals: number;
  }> {
    const accounts = await accountQueryRepository.findAll(workplaceId);
    return {
      ...countAccountsVsCategories(accounts),
      journals: await journalQueryRepository.countNonDeleted(workplaceId),
    };
  }

  async getAllWorkplaces(): Promise<Workplace[]> {
    return await workplaceRepository.findAll();
  }

  async updateWorkplace(
    id: WorkplaceId,
    data: Partial<{ name: string; icon: string; defaultCurrencyCode: string }>,
  ): Promise<void> {
    const workplace = await workplaceRepository.find(id);
    if (!workplace) {
      throw new Error('Workplace not found');
    }
    await workplaceRepository.update(workplace, data);
  }

  async deleteWorkplace(
    id: WorkplaceId,
  ): Promise<{ status: 'committed' | 'committed_with_warnings'; warnings: string[] }> {
    return this.serializeTransition(async () => {
      const workplaces = await this.getAllWorkplaces();
      const target = workplaces.find(workplace => workplace.id === id);
      if (!target) return { status: 'committed', warnings: [] };

      // Remove scoped data and the shell together. The resolver will expose the
      // creation gate when this was the last Workplace.
      const wasActive = preferences.device.activeWorkplaceId === id;
      await databaseRepository.destroyWorkplace(id, WORKPLACE_SCOPED_TABLE_NAMES);
      const warnings: string[] = [];
      try {
        reactiveCacheCoordinator.clearAll(id);
      } catch (error) {
        logger.warn('[WorkplaceService] Projection cache cleanup failed after deletion', { error });
        warnings.push('Projection cache cleanup failed');
      }
      if (!snapshotService.clearSnapshotsForWorkplace(id)) warnings.push('Snapshot cleanup failed');

      // Repair the pointer only after the database publication succeeds. Never
      // point at a deleted Workplace, including when the last one is removed.
      if (wasActive) {
        try {
          preferences.device.setActiveWorkplaceId(undefined);
        } catch (error) {
          logger.warn('[WorkplaceService] Active Workplace pointer cleanup failed', { error });
          warnings.push('Active Workplace pointer cleanup failed');
        }
      }
      const activeWorkplaceId = preferences.device.activeWorkplaceId;
      try {
        await widgetProjectionService.clearWorkplace(id, wasActive ? id : activeWorkplaceId);
      } catch (error) {
        logger.warn('[WorkplaceService] Widget cleanup failed after deletion', { error });
        warnings.push('Widget cleanup failed');
      }
      try {
        preferences.workplace.clear(id);
      } catch (error) {
        logger.warn('[WorkplaceService] Workplace preference cleanup failed', { error });
        warnings.push('Workplace preference cleanup failed');
      }
      try {
        analytics.trackFeatureUsage('settings', 'workplace_deleted');
      } catch (error) {
        logger.warn('[WorkplaceService] Workplace deletion analytics failed', { error });
        warnings.push('Workplace deletion analytics failed');
      }
      return {
        status: warnings.length > 0 ? 'committed_with_warnings' : 'committed',
        warnings,
      };
    });
  }

  observeAllWorkplaces(): Observable<PlainWorkplace[]> {
    return workplaceRepository
      .observeAll()
      .pipe(map(workplaces => workplaces.map(toPlainWorkplace)));
  }

  observeWorkplace(id: WorkplaceId): Observable<PlainWorkplace> {
    return workplaceRepository.observeById(id).pipe(
      map(w => {
        if (!w) throw new Error(`Workplace not found: ${id}`);
        return toPlainWorkplace(w);
      }),
    );
  }

  async getCurrency(id: WorkplaceId): Promise<string> {
    const workplace = await workplaceRepository.find(id);
    if (!workplace) {
      throw new Error(`Could not find workplace with ID ${id}`);
    }
    return workplace.defaultCurrencyCode;
  }
  observeCurrency(id: WorkplaceId): Observable<string> {
    return workplaceRepository.observeById(id).pipe(
      map(w => {
        if (!w) throw new Error(`Could not find workplace with ID ${id}`);
        return w.defaultCurrencyCode;
      }),
      distinctUntilChanged(),
    );
  }

  /** Apply the pre-workplace global currency to every existing Workplace once. */
  async migrateLegacyCurrency(initialWorkplaceIds?: readonly WorkplaceId[]): Promise<void> {
    const legacyCurrency = preferencesMigration.legacyCurrencyCode;
    if (!legacyCurrency) return;

    const workplaceIds =
      initialWorkplaceIds ?? (await this.getAllWorkplaces()).map(workplace => workplace.id);
    if (workplaceIds.length === 0) return;

    const initialIds = new Set(workplaceIds);
    const workplaces = (await this.getAllWorkplaces()).filter(workplace =>
      initialIds.has(workplace.id),
    );
    if (workplaces.length === 0) return;

    logger.info(`[WorkplaceService] Migrating legacy currency ${legacyCurrency} to workplaces`);
    for (const workplace of workplaces) {
      if (workplace.defaultCurrencyCode === legacyCurrency) continue;
      await workplaceRepository.update(
        workplace,
        { defaultCurrencyCode: legacyCurrency },
        { source: 'system', eventType: 'workplace.currency_migrated', undoable: false },
      );
    }
    preferencesMigration.clearLegacyCurrencyCode();
  }
}

export const workplaceService = new WorkplaceService();
