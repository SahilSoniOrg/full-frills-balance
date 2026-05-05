import { IconName } from '@/src/components/core/AppIcon';
import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/data/models/Account';
import Workplace from '@/src/data/models/Workplace';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { accountService } from '@/src/features/accounts';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { distinctUntilChanged, map, Observable } from 'rxjs';

export class WorkplaceService {
  async createWorkplace(
    name: string,
    icon: string,
    options: {
      initialAccounts?: { name: string; type: AccountType; icon: IconName }[];
      initialCategories?: { name: string; type: AccountType; icon: IconName }[];
      currencyCode: string;
    },
  ): Promise<Workplace> {
    const workplace = await workplaceRepository.create({
      name,
      icon,
      defaultCurrencyCode: options.currencyCode,
    });

    await this.bootstrapWorkplace(workplace.id, options);

    return workplace;
  }

  private async bootstrapWorkplace(
    workplaceId: string,
    options: {
      initialAccounts?: { name: string; type: AccountType; icon: IconName }[];
      initialCategories?: { name: string; type: AccountType; icon: IconName }[];
      currencyCode: string;
    },
  ): Promise<void> {
    const { initialAccounts = [], initialCategories = [], currencyCode } = options;

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
      const existing = await accountService.findAccountByName(cat.name, workplaceId);
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

  async ensureDefaultWorkplace(): Promise<Workplace> {
    // First check if there is an active workplace preference
    const activeWorkplaceId = preferences.activeWorkplaceId;

    // If there is an active workplace preference, try to get the workplace
    if (activeWorkplaceId) {
      const workplace = await this.getWorkplace(activeWorkplaceId);
      if (workplace) return workplace;
    }

    // Try to get an existing workplace
    let workplaces = await this.getAllWorkplaces();

    // If none exist, create a default one
    if (workplaces.length === 0) {
      const defaultWorkplace = await this.createWorkplace('Personal', 'briefcase', {
        currencyCode: preferences.defaultCurrencyCode || AppConfig.defaultCurrency,
      });
      workplaces = [defaultWorkplace];
      preferences.setActiveWorkplaceId(defaultWorkplace.id);
    }

    // Migration: If there is a legacy currency in preferences, apply it to all workplaces
    await this.migrateLegacyCurrency();

    return workplaces[0];
  }

  async getWorkplace(id: string): Promise<Workplace | undefined> {
    return await workplaceRepository.find(id);
  }

  async getAllWorkplaces(): Promise<Workplace[]> {
    return await workplaceRepository.findAll();
  }

  async updateWorkplace(
    id: string,
    data: Partial<{ name: string; icon: string; defaultCurrencyCode: string }>,
  ): Promise<void> {
    const workplace = await workplaceRepository.find(id);
    if (!workplace) {
      throw new Error('Workplace not found');
    }
    await workplaceRepository.update(workplace, data);
  }

  async deleteWorkplace(id: string): Promise<void> {
    const workplaces = await this.getAllWorkplaces();
    if (workplaces.length <= 1) {
      throw new Error('Cannot delete the last remaining workplace');
    }

    const { integrityService } = await import('@/src/services/integrity-service');
    await integrityService.resetWorkplace(id);

    // If we just deleted the active one, switch to another
    if (preferences.activeWorkplaceId === id) {
      const remaining = await this.getAllWorkplaces();
      if (remaining.length > 0) {
        preferences.setActiveWorkplaceId(remaining[0].id);
      }
    }
  }

  observeAllWorkplaces(): Observable<Workplace[]> {
    return workplaceRepository.observeAll();
  }

  observeWorkplace(id: string): Observable<Workplace | undefined> {
    return workplaceRepository.observeById(id);
  }

  async getCurrency(id: string): Promise<string> {
    const workplace = await workplaceRepository.find(id);
    if (!workplace) {
      throw new Error(`Could not find workplace with ID ${id}`);
    }
    return workplace.defaultCurrencyCode;
  }
  observeCurrency(id: string): Observable<string> {
    return workplaceRepository.observeById(id).pipe(
      map(w => {
        if (!w) throw new Error(`Could not find workplace with ID ${id}`);
        return w.defaultCurrencyCode;
      }),
      distinctUntilChanged(),
    );
  }

  async migrateLegacyCurrency(): Promise<void> {
    const legacyCurrency = preferences.defaultCurrencyCode;
    if (legacyCurrency) {
      logger.info(
        `[WorkplaceService] Migrating legacy currency ${legacyCurrency} to all workplaces`,
      );
      const workplaces = await this.getAllWorkplaces();
      for (const workplace of workplaces) {
        await workplaceRepository.update(workplace, { defaultCurrencyCode: legacyCurrency });
      }
      preferences.clearDefaultCurrencyCode();
    }
  }
}

export const workplaceService = new WorkplaceService();
