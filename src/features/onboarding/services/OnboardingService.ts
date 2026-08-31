import type { IconName } from '@/src/types/domainIcons';
import { AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';

import { workplaceService } from '@/src/services/WorkplaceService';
import { analytics } from '@/src/services/analytics';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { preferences } from '@/src/utils/preferences';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { insightService } from '@/src/services/insight/InsightService';
import { safeToSpendReadModel } from '@/src/services/simulation/SafeToSpendReadModel';
import { snapshotService } from '@/src/utils/SnapshotService';
import { logger } from '@/src/utils/logger';
import { generator } from '@/src/data/database/idGenerator';

export interface OnboardingData {
  /** Stable identity retained by the draft so Finish can be retried safely. */
  operationId?: WorkplaceId;
  name: string;
  workplaceName?: string;
  workplaceIcon?: IconName;
  selectedCurrency: string;
  selectedAccounts: string[];
  customAccounts: { name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[];
  selectedCategories: string[];
  customCategories: { name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[];
}

export class OnboardingService {
  claimDevice(name: string): void {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Display name is required');
    preferences.setUserName(trimmedName);
    preferences.device.setOnboardingCompleted(true);
  }

  persistDisplayName(name: string): void {
    const trimmedName = name.trim();
    if (trimmedName) preferences.setUserName(trimmedName);
  }

  /**
   * Completes the onboarding process by persisting user preferences,
   * creating system accounts, selected default accounts, and categories.
   */
  async completeOnboarding(data: OnboardingData): Promise<string> {
    const trimmedName = data.name.trim();
    const defaultName = trimmedName
      ? `${trimmedName}'s Personal workplace`
      : "User's Personal workplace";
    const workplaceName = data.workplaceName?.trim() || defaultName;
    const workplaceIcon = data.workplaceIcon || 'briefcase';

    // Every completion publishes a new Workplace atomically. Existing rows are
    // legacy data, not a signal to rename or reuse a row based on its name.
    return this.completeAtomicWorkplace(data, workplaceName, workplaceIcon);
  }

  private async completeAtomicWorkplace(
    data: OnboardingData,
    workplaceName: string,
    workplaceIcon: IconName,
  ): Promise<string> {
    const deduplicate = (list: string[]) => {
      const seen = new Set<string>();
      return list.filter(item => {
        const key = item.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    const selectedAccounts = deduplicate(data.selectedAccounts);
    const selectedCategories = deduplicate(data.selectedCategories);
    const accountSuggestions = selectedAccounts.map(name => {
      const def = DEFAULT_ACCOUNTS.find(
        candidate => candidate.name.toLowerCase() === name.toLowerCase() || candidate.id === name,
      );
      const custom = data.customAccounts.find(
        candidate => candidate.name.toLowerCase() === name.toLowerCase(),
      );
      return {
        name: def?.name || name.trim(),
        type: (def?.type || custom?.type || AccountType.ASSET) as AccountType,
        icon: def?.icon || custom?.icon || ('wallet' as IconName),
      };
    });
    const categorySuggestions = selectedCategories.map(name => {
      const def = DEFAULT_CATEGORIES.find(
        candidate => candidate.name.toLowerCase() === name.toLowerCase() || candidate.id === name,
      );
      const custom = data.customCategories.find(
        candidate => candidate.name.toLowerCase() === name.toLowerCase(),
      );
      return {
        name: def?.name || name.trim(),
        type: (def?.type || custom?.type || 'EXPENSE') as AccountType,
        icon: def?.icon || custom?.icon || ('tag' as IconName),
      };
    });
    const operationId = data.operationId || (generator() as WorkplaceId);
    preferences.device.setPendingWorkplaceId(operationId);
    const workplace = await workplaceService.createWorkplace(workplaceName, workplaceIcon, {
      id: operationId,
      currencyCode: data.selectedCurrency,
      initialAccounts: accountSuggestions,
      initialCategories: categorySuggestions,
    });
    try {
      preferences.device.setActiveWorkplaceId(workplace.id);
      preferences.device.setPendingWorkplaceId(undefined);
    } catch (error) {
      // The database publication is the commit point. The launch coordinator
      // can repair this pointer on the next boot, so do not report creation as
      // failed after the Workplace has already been committed.
      logger.warn('[Onboarding] Workplace created but active pointer could not be saved', {
        error,
      });
    }
    reactiveDataService.clearCache(workplace.id);
    safeToSpendReadModel.clearCache();
    insightService.clearCache(workplace.id);
    snapshotService.clearSnapshotsForWorkplace(workplace.id);
    analytics.trackOnboardingStep('user_setup', true);
    analytics.logOnboardingComplete(data.selectedCurrency);
    return workplace.id;
  }
}

export const onboardingService = new OnboardingService();
