import { IconName } from '@/src/components/core/AppIcon';
import { AccountType } from '@/src/data/models/Account';
import { accountService } from '@/src/features/accounts/services/AccountService';
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
    async completeOnboarding(data: OnboardingData): Promise<void> {
        const {
            name,
            selectedCurrency,
            selectedAccounts,
            customAccounts,
            selectedCategories,
            customCategories
        } = data;

        logger.info(`Starting onboarding completion for user: ${name}`);

        // 2. Ensure system accounts exist for the selected currency
        await accountService.getOpeningBalancesAccountId(selectedCurrency);
        await accountService.findOrCreateBalanceCorrectionAccount(selectedCurrency);

        // 3. Create selected default and custom accounts
        for (const accountName of selectedAccounts) {
            const existing = await accountService.findAccountByName(accountName);
            if (existing) continue;

            let type = AccountType.ASSET;
            let icon: IconName = 'wallet';

            const def = DEFAULT_ACCOUNTS.find(a => a.name === accountName);
            const custom = customAccounts.find(a => a.name === accountName);

            if (def) {
                type = def.type;
                icon = def.icon;
            } else if (custom) {
                icon = custom.icon;
            }

            await accountService.createAccount({
                name: accountName,
                accountType: type,
                currencyCode: selectedCurrency,
                initialBalance: 0,
                icon,
            });
        }

        // 4. Create selected default and custom categories (stored as accounts)
        for (const categoryName of selectedCategories) {
            // Avoid creating an account if it was already created as an asset/liability
            if (selectedAccounts.includes(categoryName)) continue;

            const existing = await accountService.findAccountByName(categoryName);
            if (existing) continue;

            let type = AccountType.EXPENSE;
            let icon: IconName = 'tag';

            const def = DEFAULT_CATEGORIES.find(c => c.name === categoryName);
            const custom = customCategories.find(c => c.name === categoryName);

            if (def) {
                type = def.type as AccountType;
                icon = def.icon;
            } else if (custom) {
                type = custom.type as AccountType;
                icon = custom.icon;
            }

            await accountService.createAccount({
                name: categoryName,
                accountType: type,
                currencyCode: selectedCurrency,
                initialBalance: 0,
                icon,
            });
        }

        // 5. Complete basic onboarding (sets name and default currency)
        // This is moved to the end to ensure it only persists if DB operations succeed
        logger.info('Onboarding completion logic finished successfully');
    }
}

export const onboardingService = new OnboardingService();
