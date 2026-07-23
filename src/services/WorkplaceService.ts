import { IconName } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/data/models/Account';
import Workplace from '@/src/data/models/Workplace';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { analytics } from '@/src/services/analytics-service';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { preferences, preferencesMigration } from '@/src/utils/preferences';
import { distinctUntilChanged, map, Observable } from 'rxjs';

export class WorkplaceService {
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
    const workplace = await workplaceRepository.create({
      id: options.id,
      name,
      icon,
      defaultCurrencyCode: options.currencyCode,
    });

    await this.bootstrapWorkplace(workplace.id as WorkplaceId, options);
    analytics.logWorkplaceCreated(name, icon);
    return workplace;
  }

  private async bootstrapWorkplace(
    workplaceId: WorkplaceId,
    options: {
      initialAccounts?: { name: string; type: AccountType; icon: IconName }[];
      initialCategories?: { name: string; type: AccountType; icon: IconName }[];
      currencyCode: string;
    },
  ): Promise<void> {
    const { initialAccounts = [], initialCategories = [], currencyCode } = options;

    const { accountService } = await import('@/src/features/accounts');
    // 1. Ensure system accounts exist
    await accountService.getOpeningBalancesAccountId(currencyCode, workplaceId);
    await accountService.findOrCreateBalanceCorrectionAccount(currencyCode, workplaceId);

    // 2. Create initial accounts
    for (const acc of initialAccounts) {
      await accountService.createAccount(
        {
          name: acc.name,
          accountType: acc.type,
          currencyCode: currencyCode,
          initialBalance: 0,
          icon: acc.icon,
          workplaceId,
        },
        workplaceId,
      );
    }
    // 3. Create initial categories
    for (const cat of initialCategories) {
      // Avoid duplicates if already created as account
      const existing = await accountService.findAccountByName(workplaceId, cat.name);
      if (existing) continue;

      await accountService.createAccount(
        {
          name: cat.name,
          accountType: cat.type,
          currencyCode: currencyCode,
          initialBalance: 0,
          icon: cat.icon,
          workplaceId,
        },
        workplaceId,
      );
    }
  }

  private ensuringPromises = new Map<string, Promise<Workplace>>();
  async ensureDefaultWorkplace(forceId?: WorkplaceId): Promise<Workplace> {
    const key = forceId ? `force:${forceId}` : 'default';
    const existing = this.ensuringPromises.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        let result: Workplace | undefined;

        // 1. Check preference first (unless forcing a specific ID)
        if (!forceId) {
          const activeId = preferences.activeWorkplaceId;
          if (activeId) {
            result = await this.getWorkplace(activeId);
          }
        }

        // 2. Fallback to any existing workplace (only if not forcing a specific ID recovery)
        if (!result && !forceId) {
          const workplaces = await this.getAllWorkplaces();
          if (workplaces.length > 0) {
            result = workplaces[0];
            preferences.setActiveWorkplaceId(result.id as WorkplaceId);
          }
        }

        // 3. Create a default one if none exist
        if (!result) {
          result = await this.createWorkplace('Personal workplace', 'briefcase', {
            id: forceId,
            currencyCode: preferencesMigration.legacyCurrencyCode || AppConfig.defaultCurrency,
          });
          preferences.setActiveWorkplaceId(result.id as WorkplaceId);
        }

        // 4. Migration: Ensure legacy currency is applied to ALL workplaces if found
        await this.migrateLegacyCurrency();

        return result!;
      } finally {
        this.ensuringPromises.delete(key);
      }
    })();

    this.ensuringPromises.set(key, promise);
    return promise;
  }

  getActiveWorkplaceId(): string {
    const id = preferences.activeWorkplaceId;
    if (!id) {
      throw new Error('No active workplace ID found in preferences');
    }
    return id;
  }

  async getWorkplace(id: WorkplaceId): Promise<Workplace | undefined> {
    return await workplaceRepository.find(id);
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

  async deleteWorkplace(id: WorkplaceId): Promise<void> {
    const workplaces = await this.getAllWorkplaces();
    if (workplaces.length <= 1) {
      throw new Error('Cannot delete the last remaining workplace');
    }

    const { integrityService } = await import('@/src/services/integrity-service');
    await integrityService.resetWorkplace(id as WorkplaceId);
    analytics.logWorkplaceDeleted();

    // If we just deleted the active one, switch to another
    if (preferences.activeWorkplaceId === id) {
      const remaining = await this.getAllWorkplaces();
      if (remaining.length > 0) {
        preferences.setActiveWorkplaceId(remaining[0].id as WorkplaceId);
      }
    }
  }

  observeAllWorkplaces(): Observable<Workplace[]> {
    return workplaceRepository.observeAll();
  }

  observeWorkplace(id: WorkplaceId): Observable<Workplace> {
    return workplaceRepository.observeById(id).pipe(
      map(w => {
        if (!w) throw new Error(`Workplace not found: ${id}`);
        return w;
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

  async migrateLegacyCurrency(): Promise<void> {
    const legacyCurrency = preferencesMigration.legacyCurrencyCode;
    if (legacyCurrency) {
      logger.info(
        `[WorkplaceService] Migrating legacy currency ${legacyCurrency} to all workplaces`,
      );
      const workplaces = await this.getAllWorkplaces();
      for (const workplace of workplaces) {
        await workplaceRepository.update(workplace, { defaultCurrencyCode: legacyCurrency });
      }
      preferencesMigration.clearLegacyCurrencyCode();
    }
  }
}

export const workplaceService = new WorkplaceService();
