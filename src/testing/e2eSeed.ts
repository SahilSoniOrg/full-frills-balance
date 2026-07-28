import { IconName } from '@/src/components/core/AppIcon';
import { AccountType } from '@/src/data/models/Account';
import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { onboardingService } from '@/src/features/onboarding/services/OnboardingService';
import { createAccount } from '@/src/services/accounts/accountCommands';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { storage } from '@/src/utils/storage';
import { WorkplaceId } from '@/src/types/domain';
import { E2eSeedProfile } from './e2eConstants';

const DEFAULT_SEED = {
  name: 'E2E User',
  selectedCurrency: 'USD',
  selectedAccounts: ['Cash', 'Bank'],
  customAccounts: [] as { name: string; icon: IconName }[],
  selectedCategories: ['Salary', 'Food & Drink', 'Groceries', 'Bills'],
  customCategories: [] as { name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[],
};

async function clearAppStorage(): Promise<void> {
  try {
    storage.clearAll();
  } catch (error) {
    logger.warn('[E2E] MMKV clearAll failed', { error });
  }
}

async function applyOnboardingPreferences(userName: string): Promise<void> {
  await preferences.setUserName(userName);
  await preferences.setOnboardingCompleted(true);
  preferences.update({
    isAppLockEnabled: false,
    isPrivacyMode: false,
  });
}

async function seedOnboarded(_profile: E2eSeedProfile): Promise<WorkplaceId> {
  const workplaceId = (await onboardingService.completeOnboarding({
    ...DEFAULT_SEED,
    name: DEFAULT_SEED.name,
  })) as WorkplaceId;

  await applyOnboardingPreferences(DEFAULT_SEED.name);
  return workplaceId;
}

async function seedExtraAccounts(workplaceId: WorkplaceId): Promise<void> {
  await createAccount(workplaceId, {
    name: 'Checking Account',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    initialBalance: 0,
    icon: 'bank',
    workplaceId,
  });
  await createAccount(workplaceId, {
    name: 'Landlord',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
    initialBalance: 0,
    icon: 'home',
    workplaceId,
  });
}

export async function runE2eSeedProfile(profile: E2eSeedProfile): Promise<void> {
  logger.info(`[E2E] Seeding profile: ${profile}`);
  const workplaceId = await seedOnboarded(profile);

  if (profile === 'planned-payments') {
    await seedExtraAccounts(workplaceId);
  }
}

export async function executeE2eBootstrap(config: {
  reset: boolean;
  seedProfile?: E2eSeedProfile;
}): Promise<void> {
  if (config.reset) {
    await clearAppStorage();
    await databaseRepository.resetDatabase();
  }

  if (config.seedProfile) {
    await runE2eSeedProfile(config.seedProfile);
  }
}
