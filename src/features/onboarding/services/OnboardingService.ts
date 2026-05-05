import { IconName } from '@/src/components/core/AppIcon';
import { AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { accountService } from '@/src/features/accounts';
import { workplaceService } from '@/src/services/WorkplaceService';
import { analytics } from '@/src/services/analytics-service';
import { logger } from '@/src/utils/logger';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '../constants';

export interface OnboardingData {
  name: string;
  selectedCurrency: string;
  selectedAccounts: string[];
  customAccounts: { name: string; icon: IconName }[];
  selectedCategories: string[];
  customCategories: { name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[];
}

export class OnboardingService {
  /**
   * Completes the onboarding process by persisting user preferences,
   * creating system accounts, selected default accounts, and categories.
   */
  async completeOnboarding(data: OnboardingData): Promise<string> {
    const {
      name,
      selectedCurrency,
      selectedAccounts,
      customAccounts,
      selectedCategories,
      customCategories,
    } = data;

    // 1. Create the target workplace with selected currency
    const targetWorkplace = await workplaceService.createWorkplace(
      name || 'Personal',
      'briefcase',
      {
        currencyCode: selectedCurrency,
      },
    );

    const targetWorkplaceId = targetWorkplace.id;

    logger.info(`Starting onboarding completion for user: ${name}`);

    // 1. Truly deduplicate input lists case-insensitively
    const deduplicate = (list: string[]) => {
      const seen = new Set<string>();
      return list.filter(item => {
        const lower = item.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
    };

    const uniqueAccounts = deduplicate(selectedAccounts);
    const uniqueCategories = deduplicate(selectedCategories);

    // Track names we've already created or seen in this session to avoid DB collisions
    const seenNames = new Set<string>();
    const allAccounts = await accountRepository.findAll(targetWorkplaceId!);
    allAccounts.forEach(a => seenNames.add(a.name.toLowerCase()));

    // 2. Ensure system accounts exist for the selected currency
    await accountService.getOpeningBalancesAccountId(selectedCurrency, targetWorkplaceId!);
    await accountService.findOrCreateBalanceCorrectionAccount(selectedCurrency, targetWorkplaceId!);

    // Refresh seen names after system accounts are created
    const updatedAccounts = await accountRepository.findAll(targetWorkplaceId!);
    updatedAccounts.forEach(a => seenNames.add(a.name.toLowerCase()));

    // 3. Create selected default and custom accounts
    for (const accountName of uniqueAccounts) {
      if (seenNames.has(accountName.toLowerCase())) continue;

      let type = AccountType.ASSET;
      let icon: IconName = 'wallet';

      const def = DEFAULT_ACCOUNTS.find(
        a =>
          a.name.toLowerCase() === accountName.toLowerCase() ||
          a.id.toLowerCase() === accountName.toLowerCase(),
      );
      const custom = customAccounts.find(a => a.name.toLowerCase() === accountName.toLowerCase());

      if (def) {
        type = def.type;
        icon = def.icon;
      } else if (custom) {
        icon = custom.icon;
      }

      await accountService.createAccount(
        {
          name: def?.name || accountName,
          accountType: type,
          currencyCode: selectedCurrency,
          initialBalance: 0,
          icon,
          workplaceId: targetWorkplaceId,
        },
        targetWorkplaceId,
      );
      seenNames.add((def?.name || accountName).toLowerCase());
    }

    // 4. Create selected default and custom categories
    for (const categoryName of uniqueCategories) {
      if (seenNames.has(categoryName.toLowerCase())) continue;

      let type = AccountType.EXPENSE;
      let icon: IconName = 'tag';

      const def = DEFAULT_CATEGORIES.find(
        c =>
          c.name.toLowerCase() === categoryName.toLowerCase() ||
          c.id.toLowerCase() === categoryName.toLowerCase(),
      );
      const custom = customCategories.find(
        c => c.name.toLowerCase() === categoryName.toLowerCase(),
      );

      if (def) {
        type = def.type as AccountType;
        icon = def.icon;
      } else if (custom) {
        type = custom.type as AccountType;
        icon = custom.icon;
      }

      await accountService.createAccount(
        {
          name: def?.name || categoryName,
          accountType: type,
          currencyCode: selectedCurrency,
          initialBalance: 0,
          icon,
          workplaceId: targetWorkplaceId,
        },
        targetWorkplaceId,
      );
      seenNames.add((def?.name || categoryName).toLowerCase());
    }

    // 5. Complete basic onboarding (sets name and default currency)
    // This is moved to the end to ensure it only persists if DB operations succeed
    analytics.trackOnboardingStep('user_setup', true);
    analytics.logOnboardingComplete(selectedCurrency);

    // Update user properties for better segmentation
    analytics.updateUserProperties({
      completed_onboarding: true,
      onboarding_currency: selectedCurrency,
      accounts_created: selectedAccounts.length + customAccounts.length,
      categories_created: selectedCategories.length + customCategories.length,
      onboarding_date: new Date().toISOString(),
    });

    logger.info('Onboarding completion logic finished successfully');
    return targetWorkplaceId!;
  }
}

export const onboardingService = new OnboardingService();
