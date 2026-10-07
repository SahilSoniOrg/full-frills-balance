import dayjs from 'dayjs';
import { LogBox } from 'react-native';
import { database } from '@/src/data/database/Database';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { preferences } from '@/src/services/preferences';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { FontIds } from '@/src/constants';
import {
  AccountType,
  AuditAction,
  InboxParseStatus,
  InboxProcessingStatus,
  JournalDisplayType,
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  TransactionDirection,
  TransactionType,
} from '@/src/types/enums';
import { asJournalId, asPlannedPaymentId, type WorkplaceId } from '@/src/types/ids';
import { createJournalFixture, type RawJournalFixtureData } from './journalFixtures';
import { assertE2eHarnessEnabled } from './e2eRuntimeGate';

/** Synthetic journals only, on a dedicated E2E install. Stable IDs make screenshot checks repeatable. */
export async function seedJournalDetailsRedesign(workplaceId: WorkplaceId) {
  assertE2eHarnessEnabled();
  // Unsigned simulator builds cannot read notification registration from Keychain.
  // Keep this unrelated native warning out of captures; console logs remain available.
  LogBox.ignoreLogs(['[expo-notifications] Error reading persisted server registration info']);
  rebuildQueueService.stop();
  preferences.update({ theme: 'system', fontId: FontIds.DEEP_SPACE });
  const createAccount = (name: string, accountType: AccountType, currencyCode = 'INR') =>
    accountWriteRepository.create({ name, accountType, currencyCode, workplaceId });
  const bank = await createAccount('Federal Fi', AccountType.ASSET);
  const food = await createAccount('Food & Drinks', AccountType.EXPENSE);
  const subscriptions = await createAccount('Subscriptions', AccountType.EXPENSE);
  const card = await createAccount('HDFC Regalia', AccountType.LIABILITY);
  const usdCard = await createAccount('Amex Gold', AccountType.LIABILITY, 'USD');
  const travel = await createAccount('Travel', AccountType.EXPENSE);
  const receivable = await createAccount('Ana owes me', AccountType.ASSET);
  const salary = await createAccount('Salary INR', AccountType.INCOME);
  const now = dayjs().subtract(2, 'day').hour(8).minute(39).valueOf();
  const old = dayjs(now).subtract(1, 'month').valueOf();
  const credit = TransactionType.CREDIT,
    debit = TransactionType.DEBIT;
  const expenseLines = (amount: number) => [
    { accountId: bank.id, amount, transactionType: credit },
    { accountId: food.id, amount, transactionType: debit },
  ];
  const balances = new Map([
    [bank.id, 18412.5],
    [card.id, 3520],
    [usdCard.id, 1284.1],
    [receivable.id, 7183.97],
  ]);
  const fixture = (
    id: string,
    description: string,
    overrides: Partial<RawJournalFixtureData> = {},
  ) =>
    createJournalFixture(
      {
        id: asJournalId(`qa-journal-${id}`),
        description,
        journalDate: now,
        currencyCode: 'INR',
        totalAmount: 52,
        displayType: JournalDisplayType.EXPENSE,
        calculatedBalances: balances,
        transactions: expenseLines(52),
        ...overrides,
      },
      workplaceId,
    );
  await budgetRepository.create(
    workplaceId,
    {
      name: 'Eating out',
      amount: 6000,
      currencyCode: 'INR',
      startMonth: dayjs(now).format('YYYY-MM'),
    },
    [food.id],
  );
  await budgetRepository.create(
    workplaceId,
    {
      name: 'Subscriptions',
      amount: 2500,
      currencyCode: 'INR',
      startMonth: dayjs(now).format('YYYY-MM'),
    },
    [subscriptions.id],
  );
  await budgetRepository.create(
    workplaceId,
    { name: 'Trips', amount: 30000, currencyCode: 'INR', startMonth: dayjs(now).format('YYYY-MM') },
    [travel.id],
  );
  await fixture('opening', 'Opening balance', {
    journalDate: dayjs(old).subtract(1, 'year').valueOf(),
    totalAmount: 18464.5,
    displayType: JournalDisplayType.INCOME,
    transactions: [
      { accountId: salary.id, amount: 18464.5, transactionType: credit },
      { accountId: bank.id, amount: 18464.5, transactionType: debit },
    ],
  });
  const rawBody =
    'Rs.52.00 debited from A/c XX4821 to VPA thirdwave.blr@okaxis (UPI Ref No 527814093312). Bal: Rs.18,412.50.';
  const coffee = await fixture('simple', 'Coffee', {
    notes: 'Oat flat white before the standup with Rohan',
    metadata: {
      importSource: 'sms',
      originalSmsSender: 'VM-FEDBNK',
      originalSmsBody: rawBody,
    },
  });
  await database.write(async () => {
    await database.collections
      .get<TransactionInboxRecord>('transaction_inbox_records')
      .create(record => {
        record.workplaceId = workplaceId;
        record.channel = 'sms';
        record.deviceSourceId = 'qa-coffee-sms';
        record.senderAddress = 'VM-FEDBNK';
        record.rawBody = rawBody;
        record.inputDate = now;
        record.inputFingerprint = 'qa-coffee-sms';
        record.parseStatus = InboxParseStatus.PARSED;
        record.parsedAmount = 52;
        record.parsedCurrencyCode = 'INR';
        record.parsedMerchant = 'thirdwave.blr@okaxis';
        record.parsedAccountSource = 'XX4821';
        record.referenceNumber = '527814093312';
        record.direction = TransactionDirection.DEBIT;
        record.processingStatus = InboxProcessingStatus.AUTO_POSTED;
        record.linkedJournalId = coffee.id;
        record.firstSeenAt = now;
        record.lastScannedAt = now;
      });
    await database.batch(
      auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: coffee.id,
          action: AuditAction.CREATE,
          eventType: 'journal.sms_auto_posted',
          undoable: false,
          changes: {
            after: {
              currencyCode: 'INR',
              totalAmount: 52,
              transactions: [
                { accountId: bank.id, accountName: bank.name, type: 'CREDIT', amount: 52 },
                { accountId: food.id, accountName: food.name, type: 'DEBIT', amount: 52 },
              ],
            },
          },
        },
        workplaceId,
      ),
    );
  });
  await journalPersistenceService.put(
    { journalId: coffee.id, description: 'Coffee with Rohan' },
    workplaceId,
  );
  await journalPersistenceService.put({ journalId: coffee.id, description: 'Coffee' }, workplaceId);
  await database.write(async () => {
    const messages = await database.collections
      .get<TransactionInboxRecord>('transaction_inbox_records')
      .query()
      .fetch();
    const message = messages.find(
      record => record.workplaceId === workplaceId && record.linkedJournalId === coffee.id,
    );
    if (message)
      await message.update(record => {
        record.processingStatus = InboxProcessingStatus.AUTO_POSTED;
      });
  });
  const future = dayjs().add(5, 'day').startOf('day').valueOf();
  const plan = await plannedPaymentRepository.create(workplaceId, {
    name: 'Netflix plan',
    amount: 649,
    currencyCode: 'INR',
    fromAccountId: card.id,
    toAccountId: subscriptions.id,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: dayjs(future).subtract(8, 'month').valueOf(),
    nextOccurrence: future,
    status: PlannedPaymentStatus.ACTIVE,
    isAutoPost: false,
    recurrenceDay: dayjs(future).date(),
  });
  const scheduled = {
    totalAmount: 649,
    plannedPaymentId: plan.id,
    transactions: [
      { accountId: card.id, amount: 649, transactionType: credit },
      { accountId: subscriptions.id, amount: 649, transactionType: debit },
    ],
  };
  await fixture('planned', 'Netflix', {
    ...scheduled,
    status: JournalStatus.PLANNED,
    journalDate: future,
  });
  await fixture('overdue', 'Overdue Netflix', {
    ...scheduled,
    status: JournalStatus.PLANNED,
    journalDate: old,
  });
  await fixture('skipped', 'Skipped Netflix', { ...scheduled, status: JournalStatus.SKIPPED });
  await fixture('scheduled-posted', 'Posted Netflix', scheduled);
  await fixture('orphaned', 'Orphaned plan', {
    status: JournalStatus.PLANNED,
    plannedPaymentId: asPlannedPaymentId('qa-missing-plan'),
  });
  const split = [
    {
      accountId: usdCard.id,
      currencyCode: 'USD',
      amount: 100,
      exchangeRate: 83.577,
      transactionType: credit,
    },
    { accountId: bank.id, amount: 3510.24, transactionType: credit },
    { accountId: travel.id, amount: 5933.97, transactionType: debit },
    {
      accountId: receivable.id,
      amount: 5933.97,
      transactionType: debit,
      notes: 'Settle after the trip',
    },
  ];
  await fixture('fx', 'Lisbon hotel · split with Ana', {
    totalAmount: 11867.94,
    displayType: JournalDisplayType.MIXED,
    transactions: split,
    notes: '2 nights at Casa do Bairro. Ana pays half.',
  });
  await fixture('missing-fx', 'Missing rate', {
    journalDate: old,
    displayType: JournalDisplayType.MIXED,
    transactions: split.map(line =>
      line.accountId === usdCard.id ? { ...line, exchangeRate: undefined } : line,
    ),
  });
  await fixture('unbalanced', 'Unbalanced journal', {
    journalDate: old,
    transactions: [expenseLines(52)[0], { ...expenseLines(52)[1], amount: 60 }],
  });
  await fixture('income', 'Salary', {
    displayType: JournalDisplayType.INCOME,
    totalAmount: 42000,
    transactions: [
      { accountId: salary.id, amount: 42000, transactionType: credit },
      { accountId: bank.id, amount: 42000, transactionType: debit },
    ],
  });
  await fixture('transfer', 'Card payment', {
    displayType: JournalDisplayType.TRANSFER,
    totalAmount: 1000,
    transactions: [
      { accountId: bank.id, amount: 1000, transactionType: credit },
      { accountId: card.id, amount: 1000, transactionType: debit },
    ],
  });
  await fixture('imported', 'Imported backup', { metadata: { importSource: 'ivy' } });
  await fixture(
    'long',
    'A very long journal description covering the entire family trip, shared meals and reimbursement arrangement',
    {
      notes:
        'Keep the original receipt with the booking confirmation. This long note should wrap at every supported system text size.',
    },
  );
}
