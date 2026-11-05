import { database } from '@/src/data/database/Database';
import DeviceSmsInboxRecord from '@/src/data/models/DeviceSmsInboxRecord';
import Transaction from '@/src/data/models/Transaction';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { createAccount } from '@/src/services/accounts/accountCommands';
import {
  AccountMatcherProposalUnavailableError,
  saveAccountMatcher,
} from '@/src/services/accounts/accountMatcherCommands';
import { loadAccountMatcherDiscovery } from '@/src/services/accounts/accountMatcherDiscoveryQueries';
import { loadAccountMatcherPageData } from '@/src/services/accounts/accountMatcherEvidenceQueries';
import { loadAccountMatcherPreviewData } from '@/src/services/accounts/accountMatcherPreviewQueries';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import {
  AccountType,
  InboxParseStatus,
  InboxProcessingStatus,
  TransactionDirection,
  TransactionType,
} from '@/src/types/enums';
import type { JournalId, WorkplaceId } from '@/src/types/ids';
import {
  ACCOUNT_CMD_WORKPLACE_ID,
  resetAccountsIntegrationDatabase,
} from './accountIntegrationDb.harness';

const WP = ACCOUNT_CMD_WORKPLACE_ID;
const OTHER_WP = 'wp-evidence-other' as WorkplaceId;

async function linkedSms(
  workplaceId: WorkplaceId,
  source: string,
  journalId: JournalId,
  options: { body?: string; sender?: string; date?: number } = {},
) {
  const inputDate = options.date ?? Date.now();
  const sourceId = `device-source-${source}`;
  const device = database.collections
    .get<DeviceSmsInboxRecord>('device_sms_inbox_records')
    .prepareCreate(record => {
      record.deviceSourceId = sourceId;
      record.senderAddress = options.sender ?? 'BANKXYZ';
      record.rawBody = options.body;
      record.inputDate = inputDate;
      record.inputFingerprint = `fingerprint-${source}`;
      record.contentDigest = `digest-${source}`;
      record.parseStatus = InboxParseStatus.PARSED;
      record.direction = TransactionDirection.UNKNOWN;
      record.reviewStatesJson = '{}';
      record.notificationState = 'none';
      record.notificationOrigin = 'manual';
      record.firstSeenAt = inputDate;
      record.lastScannedAt = inputDate;
    });
  const copy = database.collections
    .get<TransactionInboxRecord>('transaction_inbox_records')
    .prepareCreate(record => {
      record.workplaceId = workplaceId;
      record.channel = 'sms';
      record.deviceSourceId = sourceId;
      record.senderAddress = undefined;
      record.rawBody = undefined;
      record.inputDate = inputDate;
      record.inputFingerprint = `fingerprint-${source}`;
      record.parseStatus = InboxParseStatus.PARSED;
      record.direction = TransactionDirection.UNKNOWN;
      record.processingStatus = InboxProcessingStatus.IMPORTED;
      record.linkedJournalId = journalId;
      record.firstSeenAt = inputDate;
      record.lastScannedAt = inputDate;
      record.processedAt = inputDate;
    });
  await database.write(async () => database.batch(device, copy));
  return copy;
}

describe('account matcher evidence query (integration)', () => {
  beforeEach(async () => resetAccountsIntegrationDatabase(), 15000);

  it('scopes linked SMS, follows current links, excludes deleted transactions, and projects missing bodies', async () => {
    const account = await createAccount(WP, {
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const counter = await createAccount(WP, {
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const unrelated = await createAccount(WP, {
      name: 'Savings',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const journal = (
      await createJournalFixture(
        {
          journalDate: 1_800_000_000_000,
          currencyCode: 'USD',
          transactions: [
            { accountId: account.id, amount: 30, transactionType: TransactionType.CREDIT },
            { accountId: counter.id, amount: 30, transactionType: TransactionType.DEBIT },
          ],
        },
        WP,
      )
    ).id;
    const deletedJournal = (
      await createJournalFixture(
        {
          journalDate: 1_800_000_000_100,
          currencyCode: 'USD',
          transactions: [
            { accountId: account.id, amount: 40, transactionType: TransactionType.CREDIT },
            { accountId: counter.id, amount: 40, transactionType: TransactionType.DEBIT },
          ],
        },
        WP,
      )
    ).id;
    const unrelatedJournal = (
      await createJournalFixture(
        {
          journalDate: 1_800_000_000_200,
          currencyCode: 'USD',
          transactions: [
            { accountId: unrelated.id, amount: 50, transactionType: TransactionType.CREDIT },
            { accountId: counter.id, amount: 50, transactionType: TransactionType.DEBIT },
          ],
        },
        WP,
      )
    ).id;

    const projectedBody = await linkedSms(WP, 'body', journal, {
      body: 'Card ending 1234',
      date: 1_800_000_001_000,
    });
    await linkedSms(WP, 'missing-body', journal, { date: 1_800_000_001_100 });
    await linkedSms(WP, 'deleted-tx', deletedJournal, { body: 'Deleted evidence' });
    const relinked = await linkedSms(WP, 'relinked', journal, { body: 'Relinked away' });
    await linkedSms(OTHER_WP, 'other-workplace', journal, { body: 'Other workplace' });
    await linkedSms(WP, 'newer-unrelated', unrelatedJournal, {
      body: 'Savings account notice',
      date: 1_800_000_002_000,
    });

    const deletedTransaction = (
      await database.collections.get<Transaction>('transactions').query().fetch()
    ).find(
      transaction =>
        transaction.journalId === deletedJournal && transaction.accountId === account.id,
    )!;
    const relinkedModel = await database.collections
      .get<TransactionInboxRecord>('transaction_inbox_records')
      .find(relinked.id);
    await database.write(async () => {
      await database.batch(
        deletedTransaction.prepareUpdate(record => {
          record.deletedAt = new Date();
        }),
        relinkedModel.prepareUpdate(record => {
          record.linkedJournalId = unrelatedJournal;
        }),
      );
    });

    const data = await loadAccountMatcherPageData(WP, account.id);
    expect(data.evidence.map(message => message.deviceSourceId)).toEqual(
      expect.arrayContaining(['device-source-body', 'device-source-missing-body']),
    );
    expect(data.evidence).toHaveLength(2);
    expect(
      data.evidence.find(message => message.deviceSourceId === 'device-source-body')?.rawBody,
    ).toBe('Card ending 1234');
    expect(
      data.evidence.find(message => message.deviceSourceId === 'device-source-missing-body')
        ?.rawBody,
    ).toBeUndefined();
    expect(data.evidence.map(message => message.deviceSourceId)).not.toEqual(
      expect.arrayContaining([
        'device-source-deleted-tx',
        'device-source-relinked',
        'device-source-other-workplace',
      ]),
    );
    const newestOnly = await loadAccountMatcherPageData(WP, account.id, 1);
    expect(newestOnly.evidence.map(message => message.deviceSourceId)).toEqual([
      'device-source-missing-body',
    ]);
    expect(projectedBody.id).toBeTruthy();
    const preview = await loadAccountMatcherPreviewData(WP, account.id);
    const previewMessage = preview.messages.find(
      message => message.deviceSourceId === 'device-source-body',
    );
    expect(previewMessage?.linkedAccountIds).toEqual([account.id]);
    expect(previewMessage?.linkedAccountNames).toEqual(['Checking']);
    expect(
      data.evidence.find(message => message.deviceSourceId === 'device-source-body')
        ?.linkedAccountIds,
    ).toEqual(previewMessage?.linkedAccountIds);
  });

  it('revalidates linked evidence before confirming a proposal', async () => {
    const account = await createAccount(WP, {
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const counter = await createAccount(WP, {
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const other = await createAccount(WP, {
      name: 'Savings',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const journalOne = (
      await createJournalFixture(
        {
          journalDate: 1_800_000_000_000,
          currencyCode: 'USD',
          transactions: [
            { accountId: account.id, amount: 20, transactionType: TransactionType.CREDIT },
            { accountId: counter.id, amount: 20, transactionType: TransactionType.DEBIT },
          ],
        },
        WP,
      )
    ).id;
    const journalTwo = (
      await createJournalFixture(
        {
          journalDate: 1_800_000_001_000,
          currencyCode: 'USD',
          transactions: [
            { accountId: account.id, amount: 25, transactionType: TransactionType.CREDIT },
            { accountId: counter.id, amount: 25, transactionType: TransactionType.DEBIT },
          ],
        },
        WP,
      )
    ).id;
    const unrelatedJournal = (
      await createJournalFixture(
        {
          journalDate: 1_800_000_002_000,
          currencyCode: 'USD',
          transactions: [
            { accountId: other.id, amount: 30, transactionType: TransactionType.CREDIT },
            { accountId: counter.id, amount: 30, transactionType: TransactionType.DEBIT },
          ],
        },
        WP,
      )
    ).id;
    await linkedSms(WP, 'proposal-1', journalOne, {
      body: 'Card ending 1234 confirmed',
      date: 1_800_000_003_000,
    });
    const secondSms = await linkedSms(WP, 'proposal-2', journalTwo, {
      body: 'Card ending 1234 confirmed',
      date: 1_800_000_004_000,
    });

    const discovery = await loadAccountMatcherDiscovery(WP, account.id);
    expect(discovery.proposals).toHaveLength(1);
    const proposal = discovery.proposals[0];
    const secondRecord = await database.collections
      .get<TransactionInboxRecord>('transaction_inbox_records')
      .find(secondSms.id);
    await database.write(async () => {
      await database.batch(
        secondRecord.prepareUpdate(record => {
          record.linkedJournalId = unrelatedJournal;
        }),
      );
    });

    await expect(
      saveAccountMatcher(WP, {
        accountId: account.id,
        definition: proposal.definition,
        proposalKey: proposal.proposalKey,
        provenance: 'discovered',
      }),
    ).rejects.toThrow(AccountMatcherProposalUnavailableError);
    expect(await database.collections.get('account_matchers').query().fetchCount()).toBe(0);
  });
});
