import { IconName } from '@/src/components/core/AppIcon';
import { AppConfig } from '@/src/constants';
import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import {
  InboxParseStatus,
  InboxProcessingStatus,
  TransactionDirection,
  AccountType,
  TransactionType,
  WorkplaceId,
} from '@/src/types/domain';
import { accountRepository } from '@/src/data/repositories/AccountRepository';

import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { onboardingService } from '@/src/features/onboarding/services/OnboardingService';
import { createAccount } from '@/src/services/accounts/accountCommands';
import { ledgerWriteService } from '@/src/services/ledger';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { storage } from '@/src/utils/storage';
import { setE2eSmsInboxMessages } from './e2eSmsInject';
import { E2eSeedProfile } from './e2eConstants';
import { smsMessageFromFixture } from './smsFixtures';

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

async function seedSmsReadyData(workplaceId: WorkplaceId): Promise<void> {
  rebuildQueueService.stop();
  const bank = await accountRepository.findByName(workplaceId, 'Bank');
  const food = await accountRepository.findByName(workplaceId, 'Food & Drink');
  if (!bank || !food) {
    throw new Error('[E2E] sms-ready seed requires Bank and Food & Drink accounts');
  }

  const journalDate = Date.now() - 60 * 60 * 1000;
  const journal = await ledgerWriteService.createJournal(
    {
      description: 'UPI Payment',
      journalDate,
      currencyCode: 'USD',
      metadata: {
        importSource: 'sms',
        originalSmsSender: 'HDFCBK',
        metadataJson: JSON.stringify({ referenceNumber: '121554846690' }),
      },
      transactions: [
        {
          accountId: bank.id,
          amount: 250,
          transactionType: TransactionType.CREDIT,
        },
        {
          accountId: food.id,
          amount: 250,
          transactionType: TransactionType.DEBIT,
        },
      ],
    },
    workplaceId,
  );
  await rebuildQueueService.flush();

  const inbox = database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
  const now = Date.now();
  await database.write(async () => {
    await inbox.create(record => {
      record.workplaceId = workplaceId;
      record.channel = 'sms';
      record.deviceSourceId = 'e2e-dup-seeded';
      record.senderAddress = 'HDFCBK';
      record.rawBody = 'INR 250.00 debited (UPI Ref No 121554846690) on 07-Mar.';
      record.inputDate = now;
      record.inputFingerprint = 'e2e-dup-fingerprint';
      record.parseStatus = InboxParseStatus.PARSED;
      record.parsedAmount = 250;
      record.parsedCurrencyCode = 'USD';
      record.parsedMerchant = 'Merchant';
      record.referenceNumber = '121554846690';
      record.direction = TransactionDirection.DEBIT;
      record.processingStatus = InboxProcessingStatus.DUPLICATE_FLAGGED;
      record.duplicateJournalId = journal.id;
      record.duplicateConfidence = AppConfig.input.sms.duplicateDetection.referenceMatchScore;
      record.metadataJson = JSON.stringify({
        duplicateReasons: ['Matching reference number (121554846690)'],
      });
      record.firstSeenAt = now;
      record.lastScannedAt = now;
    });

    await inbox.create(record => {
      record.workplaceId = workplaceId;
      record.channel = 'sms';
      record.deviceSourceId = 'e2e-pending-seeded';
      record.senderAddress = 'HDFCBK';
      record.rawBody = 'Rs.500 debited at SWIGGY on 07-Mar. Avbl bal Rs.5000';
      record.inputDate = now;
      record.inputFingerprint = 'e2e-pending-fingerprint';
      record.parseStatus = InboxParseStatus.PARSED;
      record.parsedAmount = 500;
      record.parsedCurrencyCode = 'USD';
      record.parsedMerchant = 'SWIGGY';
      record.direction = TransactionDirection.DEBIT;
      record.processingStatus = InboxProcessingStatus.PENDING;
      record.firstSeenAt = now;
      record.lastScannedAt = now;
    });
  });
}

async function seedSmsSyncHarness(workplaceId: WorkplaceId): Promise<void> {
  rebuildQueueService.stop();
  const bank = await accountRepository.findByName(workplaceId, 'Bank');
  const food = await accountRepository.findByName(workplaceId, 'Food & Drink');
  if (!bank || !food) {
    throw new Error('[E2E] sms-sync seed requires Bank and Food & Drink accounts');
  }

  await ledgerWriteService.createJournal(
    {
      description: 'UPI Payment',
      journalDate: Date.now() - 30 * 60 * 1000,
      currencyCode: 'USD',
      metadata: {
        importSource: 'sms',
        metadataJson: JSON.stringify({ referenceNumber: '121554846690' }),
      },
      transactions: [
        {
          accountId: bank.id,
          amount: 250,
          transactionType: TransactionType.CREDIT,
        },
        {
          accountId: food.id,
          amount: 250,
          transactionType: TransactionType.DEBIT,
        },
      ],
    },
    workplaceId,
  );
  await rebuildQueueService.flush();

  setE2eSmsInboxMessages([
    smsMessageFromFixture('upiRef121554846690', {
      id: 'e2e-sync-sms-1',
      date: Date.now(),
    }),
  ]);
}

export async function runE2eSeedProfile(profile: E2eSeedProfile): Promise<void> {
  logger.info(`[E2E] Seeding profile: ${profile}`);
  const workplaceId = await seedOnboarded(profile);

  if (profile === 'planned-payments') {
    await seedExtraAccounts(workplaceId);
  }

  if (profile === 'sms-ready') {
    await seedSmsReadyData(workplaceId);
  }

  if (profile === 'sms-sync') {
    await seedSmsSyncHarness(workplaceId);
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
