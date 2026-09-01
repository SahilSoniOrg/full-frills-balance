import { AppConfig } from '@/src/constants';
import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import {
  InboxParseStatus,
  InboxProcessingStatus,
  TransactionDirection,
  AccountType,
  TransactionType,
} from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { accountQueryRepository } from '@/src/data/repositories/account';

import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { generator } from '@/src/data/database/idGenerator';
import { saveSetupDraft } from '@/src/features/setup/SetupDraftStore';
import { finishDeviceSetup, finishWorkplaceSetup } from '@/src/features/setup/setupFinishers';
import { rememberPreparedRestore } from '@/src/features/setup/pickRestoreSource';
import { createAccount } from '@/src/services/accounts/accountCommands';
import { ledgerWriteService } from '@/src/services/ledger';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/services/preferences';
import { storage } from '@/src/utils/storage';
import { setE2eSmsInboxMessages } from './e2eSmsInject';
import { E2eSeedProfile } from './e2eConstants';
import { smsMessageFromFixture } from './smsFixtures';
import { files } from '@/src/utils/files';
import { extractIfZip, decodeContent, sanitizeContent } from '@/src/services/import/orchestrator';
import { importService } from '@/src/services/import/ImportService';
import { nativePlugin } from '@/src/services/import/plugins/native-plugin';
import { SETUP_DRAFT_KEY } from '@/src/services/setup/setupDraftIdentity';
import {
  FIRST_RUN_RESTORE_SOURCE_NAME,
  FIRST_RUN_RESTORE_SOURCE_URI,
  prepareFirstRunRestoreFixture,
} from './fixtures/firstRunRestoreBackup';

const DEFAULT_SEED = {
  name: 'E2E User',
  selectedCurrency: 'USD',
  selectedAccounts: ['Cash', 'Bank'],
  selectedCategories: ['Salary', 'Food & Drink', 'Groceries', 'Bills'],
};

const LEGACY_ONBOARDING_DRAFT_KEY = 'onboarding_draft_v1';

async function clearAppStorage(): Promise<void> {
  try {
    storage.clearAll();
    // The draft is a resumable flow artifact. Explicitly remove it so a
    // clean-install E2E launch cannot inherit a prior interrupted setup.
    storage.remove(SETUP_DRAFT_KEY);
    storage.remove(LEGACY_ONBOARDING_DRAFT_KEY);
  } catch (error) {
    logger.warn('[E2E] MMKV clearAll failed', { error });
  }
}

async function applyOnboardingPreferences(userName: string): Promise<void> {
  await preferences.setUserName(userName);
  preferences.device.setAppLockEnabled(false);
  preferences.update({
    isPrivacyMode: false,
  });
}

async function seedWorkplace(name: string): Promise<WorkplaceId> {
  finishDeviceSetup({ displayName: { value: name, source: 'user_entered' } });
  const workplaceId = await finishWorkplaceSetup(generator() as WorkplaceId, {
    name: { value: `${name}'s Personal workplace`, source: 'user_entered' },
    icon: { value: 'briefcase', source: 'defaulted' },
    baseCurrency: { value: DEFAULT_SEED.selectedCurrency, source: 'user_entered' },
    selectedAccounts: DEFAULT_SEED.selectedAccounts.map(accountName => ({
      name: accountName,
      type: AccountType.ASSET,
      icon: 'wallet',
    })),
    selectedCategories: DEFAULT_SEED.selectedCategories.map(categoryName => ({
      name: categoryName,
      type: AccountType.EXPENSE,
      icon: 'tag',
    })),
    acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
  });
  preferences.device.setActiveWorkplaceId(workplaceId);
  return workplaceId;
}

async function seedOnboarded(_profile: E2eSeedProfile): Promise<WorkplaceId> {
  const workplaceId = await seedWorkplace(DEFAULT_SEED.name);
  await applyOnboardingPreferences(DEFAULT_SEED.name);
  return workplaceId;
}

async function seedPickerReady(): Promise<void> {
  await seedWorkplace('Second E2E User');
  // Picker state requires multiple workplaces with no active pointer.
  preferences.device.setActiveWorkplaceId(undefined);
}

const FIRST_RUN_RESTORE_CANDIDATE = 'E2E Restore User';

/** Prepare the fixture and persist a pre-publication draft. Setup owns publishRestore. */
async function seedFirstRunRestore(): Promise<WorkplaceId> {
  const prepared = await prepareFirstRunRestoreFixture();
  const workplaceFacts = prepared.facts.workplace;
  if (!workplaceFacts.name || !workplaceFacts.icon || !workplaceFacts.defaultCurrencyCode) {
    throw new Error('[E2E] Restore fixture is missing Workplace identity');
  }
  rememberPreparedRestore(prepared);
  const operationId = generator() as WorkplaceId;
  saveSetupDraft({
    schemaVersion: 1,
    kind: 'restore',
    journeyId: 'first_run_restore',
    entryPolicy: 'blocking',
    operationId,
    presentedHistory: ['restore_source'],
    acceptedSlices: ['restore_source', 'workplace'],
    workplace: {
      name: { value: workplaceFacts.name, source: 'imported' },
      icon: { value: 'briefcase', source: 'imported' },
      baseCurrency: { value: workplaceFacts.defaultCurrencyCode, source: 'imported' },
      selectedAccounts: [],
      selectedCategories: [],
      acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
    },
    restore: {
      source: {
        source: {
          uri: FIRST_RUN_RESTORE_SOURCE_URI,
          name: FIRST_RUN_RESTORE_SOURCE_NAME,
          fingerprint: prepared.fingerprint,
        },
        facts: prepared.facts,
      },
      deviceCandidate: { value: FIRST_RUN_RESTORE_CANDIDATE, source: 'user_entered' },
    },
  });
  return operationId;
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
  const bank = await accountQueryRepository.findByName(workplaceId, 'Bank');
  const food = await accountQueryRepository.findByName(workplaceId, 'Food & Drink');
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
  const bank = await accountQueryRepository.findByName(workplaceId, 'Bank');
  const food = await accountQueryRepository.findByName(workplaceId, 'Food & Drink');
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

export async function runE2eSeedProfile(profile: E2eSeedProfile): Promise<WorkplaceId> {
  logger.info(`[E2E] Seeding profile: ${profile}`);
  if (profile === 'first-run-restore') {
    return seedFirstRunRestore();
  }

  const workplaceId = await seedOnboarded(profile);

  if (profile === 'picker-ready') {
    await seedPickerReady();
    return workplaceId;
  }

  if (profile === 'planned-payments') {
    await seedExtraAccounts(workplaceId);
  }

  if (profile === 'sms-ready') {
    await seedSmsReadyData(workplaceId);
  }

  if (profile === 'sms-sync') {
    await seedSmsSyncHarness(workplaceId);
  }

  return workplaceId;
}

export async function executeE2eBootstrap(config: {
  reset: boolean;
  seedProfile?: E2eSeedProfile;
  backupPath?: string;
}): Promise<void> {
  if (config.reset) {
    await clearAppStorage();
    await databaseRepository.resetDatabase();
  }

  if (config.seedProfile) {
    const workplaceId = await runE2eSeedProfile(config.seedProfile);
    if (config.backupPath) {
      let rawBytes = await files.readBytes(config.backupPath);
      rawBytes = await extractIfZip(rawBytes);
      const text = sanitizeContent(decodeContent(rawBytes));
      const stats = await importService.executeImport(
        nativePlugin,
        { uri: config.backupPath, name: 'e2e-backup.json', rawBytes, text, json: JSON.parse(text) },
        workplaceId,
      );
      console.log(
        `[E2E-BACKUP] imported accounts=${stats.accounts} journals=${stats.journals} transactions=${stats.transactions}`,
      );
    }
  }
}
