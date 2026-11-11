import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { saveAccountMatcher } from '@/src/services/accounts/accountMatcherCommands';
import { createPlannedPayment } from '@/src/services/planned-payment/plannedPaymentCommands';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { smsSyncPipeline } from '@/src/services/sms/pipeline/smsSyncPipeline';
import { transactionCaptureService } from '@/src/services/transaction-intelligence/transactionCaptureService';
import { E2E_EVIDENCE_SETTLE } from '@/src/testing/e2eConstants';
import { seedBasicAssetExpenseAccounts } from '@/src/testing/accountTestFixtures';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { setE2eSmsInboxMessages } from '@/src/testing/e2eSmsInject';
import { smsMessageFromFixture } from '@/src/testing/smsFixtures';
import {
  AccountType,
  InboxProcessingStatus,
  JournalStatus,
  PlannedPaymentInterval,
} from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';

const WP = 'wp-evidence-settle-e2e-seed' as WorkplaceId;

describe('evidence settle e2e seed shape', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedBasicAssetExpenseAccounts(WP, {
      assetName: 'Bank',
      expenseName: 'Bills',
    });
    await accountWriteRepository.create({
      name: 'Uncategorized Expense',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: WP,
    });
  }, 20_000);

  it('unique SMS settles the ACTIVE monthly PLANNED occurrence', async () => {
    const bank = await accountQueryRepository.findByName(WP, 'Bank');
    const bills = await accountQueryRepository.findByName(WP, 'Bills');
    if (!bank || !bills) throw new Error('missing accounts');

    const occurrenceDay = normalizeToStartOfDay(Date.now());
    const plan = await createPlannedPayment(WP, {
      name: E2E_EVIDENCE_SETTLE.planName,
      amount: E2E_EVIDENCE_SETTLE.amount,
      currencyCode: bank.currencyCode,
      fromAccountId: bank.id,
      toAccountId: bills.id,
      intervalN: 1,
      intervalType: PlannedPaymentInterval.MONTHLY,
      startDate: occurrenceDay,
      recurrenceDay: new Date(occurrenceDay).getDate(),
      isAutoPost: false,
    });
    expect(plan.status).toBe('ACTIVE');

    await saveAccountMatcher(WP, {
      accountId: bank.id,
      definition: {
        version: 1,
        body: { kind: 'fragments', fragments: [E2E_EVIDENCE_SETTLE.accountToken] },
        flow: 'outgoing',
      },
    });
    await transactionCaptureService.setEnabled(WP, true);
    const { enabledAt } = await transactionCaptureService.getSettings(WP);
    const smsDate = Math.max((enabledAt ?? Date.now()) + 1, occurrenceDay + 60 * 60 * 1000);
    const messages = [
      smsMessageFromFixture('swiggyNoRef', {
        id: E2E_EVIDENCE_SETTLE.smsId,
        date: smsDate,
        body: `${bank.currencyCode} ${E2E_EVIDENCE_SETTLE.amount}.00 spent on Card ${E2E_EVIDENCE_SETTLE.accountToken} at LANDLORD.`,
      }),
    ];
    setE2eSmsInboxMessages(messages);
    await smsSyncPipeline.scanMessages(WP, messages, undefined, { origin: 'arrival' });

    const inbox = await database.collections
      .get<TransactionInboxRecord>('transaction_inbox_records')
      .query(Q.where('workplace_id', WP), Q.where('device_source_id', E2E_EVIDENCE_SETTLE.smsId))
      .fetch();
    expect(inbox).toHaveLength(1);
    expect([InboxProcessingStatus.AUTO_POSTED, InboxProcessingStatus.IMPORTED]).toContain(
      inbox[0].processingStatus,
    );
    expect(inbox[0].linkedJournalId).toBeTruthy();

    const journals = await database.collections
      .get<Journal>('journals')
      .query(Q.where('workplace_id', WP), Q.where('deleted_at', null))
      .fetch();
    const linked = journals.find(j => j.id === inbox[0].linkedJournalId);
    expect(linked?.status).toBe(JournalStatus.POSTED);
    expect(linked?.plannedPaymentId).toBe(plan.id);
    expect(journals.filter(j => j.status === JournalStatus.PLANNED)).toHaveLength(0);
  }, 60_000);
});
