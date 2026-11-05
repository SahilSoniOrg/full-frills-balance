import { database } from '@/src/data/database/Database';
import * as discoveryQueries from '@/src/services/accounts/accountMatcherDiscoveryQueries';
import { AccountType, InboxParseStatus, TransactionDirection } from '@/src/types/enums';
import DeviceSmsInboxRecord from '@/src/data/models/DeviceSmsInboxRecord';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { accountMatcherRepository } from '@/src/data/repositories/AccountMatcherRepository';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { createAccount } from '@/src/services/accounts/accountCommands';
import { deleteAccount } from '@/src/services/accounts/accountDeleteCommands';
import {
  AccountMatcherProposalUnavailableError,
  forgetAccountMatcher,
  moveAccountMatcher,
  saveAccountMatcher,
  setAccountMatcherEnabled,
} from '@/src/services/accounts/accountMatcherCommands';
import { applyAccountArchiveChanges } from '@/src/services/accounts/accountArchiveCommands';
import { loadAccountMatcherContext } from '@/src/services/accounts/accountMatcherContext';
import { observeAccountMatcherSnapshots } from '@/src/services/accounts/accountMatcherPreviewQueries';
import { preferences } from '@/src/services/preferences';
import { conditionsKeyFor } from '@/src/services/sms/recognition/accountMatcherDefinition';
import type { AccountMatcherDefinitionV1 } from '@/src/types/accountMatcher';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { filter, firstValueFrom } from 'rxjs';
import {
  ACCOUNT_CMD_WORKPLACE_ID,
  resetAccountsIntegrationDatabase,
} from './accountIntegrationDb.harness';

const WP = ACCOUNT_CMD_WORKPLACE_ID;
const OTHER_WP = 'wp-matcher-other' as WorkplaceId;
const DEFINITION: AccountMatcherDefinitionV1 = {
  version: 1,
  sender: { op: 'contains', value: 'VM-FEDBNK' },
  body: { kind: 'fragments', fragments: ['credited to'] },
};

async function asset(name: string, workplaceId: WorkplaceId = WP) {
  return createAccount(workplaceId, {
    name,
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId,
  });
}

describe('account matcher commands (integration)', () => {
  beforeEach(async () => {
    await resetAccountsIntegrationDatabase();
    preferences.workplace.clear(WP);
    preferences.workplace.clear(OTHER_WP);
  }, 15000);

  afterEach(() => {
    preferences.workplace.clear(WP);
    preferences.workplace.clear(OTHER_WP);
  });

  it('refreshes recognition beyond the first 200 messages when a matcher is disabled', async () => {
    const account = await asset('Many messages');
    await database.write(async () => {
      const collection = database.get<DeviceSmsInboxRecord>('device_sms_inbox_records');
      const messages = Array.from({ length: 201 }, (_, index) =>
        collection.prepareCreate(record => {
          record.deviceSourceId = `device-${index}`;
          record.senderAddress = 'VM-FEDBNK';
          record.rawBody = 'credited to account';
          record.inputDate = index + 1;
          record.inputFingerprint = `fingerprint-${index}`;
          record.parseStatus = InboxParseStatus.PARSED;
          record.direction = TransactionDirection.CREDIT;
          record.reviewStatesJson = '{}';
          record.notificationState = 'none';
          record.notificationOrigin = 'manual';
          record.firstSeenAt = 1;
          record.lastScannedAt = 1;
        }),
      );
      await database.batch(...messages);
    });
    const matcher = await saveAccountMatcher(WP, { accountId: account.id, definition: DEFINITION });
    const messages = await database
      .get<DeviceSmsInboxRecord>('device_sms_inbox_records')
      .query()
      .fetch();
    expect(messages).toHaveLength(201);
    expect(
      messages.every(message =>
        JSON.parse(message.reviewStatesJson)[WP]?.recognition?.accountIds.includes(account.id),
      ),
    ).toBe(true);
    await setAccountMatcherEnabled(WP, matcher.id, false);
    expect(
      messages.every(
        message => JSON.parse(message.reviewStatesJson)[WP]?.recognition?.status === 'none',
      ),
    ).toBe(true);
  });

  it('scopes matcher ownership and reads to the requested workplace', async () => {
    const account = await asset('Checking');
    const matcher = await saveAccountMatcher(WP, { accountId: account.id, definition: DEFINITION });

    expect(preferences.workplace.getSnapshot(WP).accountMatcherRefreshPending).toBe(false);
    expect(await accountMatcherRepository.find(WP, matcher.id)).toBe(matcher);
    expect(await accountMatcherRepository.find(OTHER_WP, matcher.id)).toBeNull();
    expect(await accountMatcherRepository.findForAccount(OTHER_WP, account.id)).toEqual([]);
  });

  it('emits immutable snapshots when a saved matcher changes', async () => {
    const account = await asset('Checking');
    const matcher = await saveAccountMatcher(WP, { accountId: account.id, definition: DEFINITION });
    const observed = observeAccountMatcherSnapshots(WP, account.id);
    const before = await firstValueFrom(observed);
    const updated = firstValueFrom(observed.pipe(filter(rows => rows[0]?.isEnabled === false)));
    await setAccountMatcherEnabled(WP, matcher.id, false);
    expect((await updated)[0]).toMatchObject({ id: matcher.id, isEnabled: false });
    expect(before[0].isEnabled).toBe(true);
  });

  it('rejects categories, parent accounts, and cross-workplace owners', async () => {
    const category = await createAccount(WP, {
      name: 'Income',
      accountType: AccountType.INCOME,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const parent = await asset('Parent');
    await createAccount(WP, {
      name: 'Child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: parent.id,
      workplaceId: WP,
    });
    const otherWorkplaceAccount = await asset('Other workplace', OTHER_WP);

    await expect(
      saveAccountMatcher(WP, { accountId: category.id, definition: DEFINITION }),
    ).rejects.toThrow('leaf asset or liability');
    await expect(
      saveAccountMatcher(WP, { accountId: parent.id, definition: DEFINITION }),
    ).rejects.toThrow('leaf asset or liability');
    await expect(
      saveAccountMatcher(WP, {
        accountId: otherWorkplaceAccount.id as AccountId,
        definition: DEFINITION,
      }),
    ).rejects.toThrow('not found in workplace');
  });

  it('validates definitions and returns an existing matcher for duplicate normalized conditions', async () => {
    const account = await asset('Checking');
    const first = await saveAccountMatcher(WP, { accountId: account.id, definition: DEFINITION });
    const duplicate = await saveAccountMatcher(WP, {
      accountId: account.id,
      definition: {
        version: 1,
        sender: { op: 'contains', value: ' vm-fedbnk ' },
        body: { kind: 'fragments', fragments: ['CREDITED   TO'] },
      },
    });

    expect(duplicate.id).toBe(first.id);
    expect(await accountMatcherRepository.findForAccount(WP, account.id)).toHaveLength(1);
    await expect(
      saveAccountMatcher(WP, { accountId: account.id, definition: { version: 1 } }),
    ).rejects.toThrow('At least one condition');
  });

  it('forgets both the declared flow and its discovery text pattern', async () => {
    const account = await asset('Flow-aware checking');
    const definition = { ...DEFINITION, flow: 'outgoing' as const };
    const matcher = await saveAccountMatcher(WP, { accountId: account.id, definition });
    await forgetAccountMatcher(WP, matcher.id);
    const suppressions = preferences.accountMatchers.list(WP, account.id);
    expect(suppressions.map(item => item.conditionsKey)).toEqual(
      expect.arrayContaining([conditionsKeyFor(definition), conditionsKeyFor(DEFINITION)]),
    );
    expect(suppressions.every(item => item.reason === 'forgotten')).toBe(true);
    expect(await accountMatcherRepository.findForAccount(WP, account.id)).toHaveLength(0);
  });

  it('supports enable, disable, move, and forget with ID-only audit details', async () => {
    const firstAccount = await asset('Checking');
    const secondAccount = await asset('Savings');
    const matcher = await saveAccountMatcher(WP, {
      accountId: firstAccount.id,
      definition: DEFINITION,
    });

    await setAccountMatcherEnabled(WP, matcher.id, false);
    await setAccountMatcherEnabled(WP, matcher.id, true);
    const moved = await moveAccountMatcher(WP, matcher.id, secondAccount.id);
    expect(moved.accountId).toBe(secondAccount.id);
    await forgetAccountMatcher(WP, matcher.id);

    expect(await accountMatcherRepository.find(WP, matcher.id)).toBeNull();
    expect(preferences.accountMatchers.list(WP)).toEqual([
      {
        accountId: secondAccount.id,
        conditionsKey: conditionsKeyFor(DEFINITION),
        reason: 'forgotten',
      },
    ]);
    const audits = await auditRepository.findByEntity('account_matcher', matcher.id, WP);
    expect(audits.map(audit => audit.eventType)).toEqual(
      expect.arrayContaining([
        'account_matcher.created',
        'account_matcher.disabled',
        'account_matcher.enabled',
        'account_matcher.moved',
        'account_matcher.forgotten',
      ]),
    );
    for (const audit of audits) {
      expect(audit.changes).not.toContain('VM-FEDBNK');
      expect(audit.changes).not.toContain('credited to');
    }
  });

  it('allows archived owners and marks parented or soft-deleted owners ineligible in context', async () => {
    const archived = await asset('Archived');
    await applyAccountArchiveChanges(WP, { toArchive: [archived.id], toUnarchive: [] });
    await saveAccountMatcher(WP, { accountId: archived.id, definition: DEFINITION });

    const becomesParent = await asset('Will be parent');
    const parentMatcher = await saveAccountMatcher(WP, {
      accountId: becomesParent.id,
      definition: { version: 1, sender: { op: 'contains', value: 'BANK-PARENT' } },
    });
    await createAccount(WP, {
      name: 'New child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: becomesParent.id,
      workplaceId: WP,
    });

    const softDeleted = await asset('Soft deleted');
    const softDeletedMatcher = await saveAccountMatcher(WP, {
      accountId: softDeleted.id,
      definition: { version: 1, sender: { op: 'contains', value: 'BANK-DELETED' } },
    });
    await deleteAccount(softDeleted.id, WP);

    const context = await loadAccountMatcherContext(WP);
    expect(context.matchers.find(row => row.accountId === archived.id)?.eligible).toBe(true);
    expect(context.matchers.find(row => row.id === parentMatcher.id)?.eligible).toBe(false);
    expect(context.matchers.find(row => row.id === softDeletedMatcher.id)?.eligible).toBe(false);
    expect(await accountMatcherRepository.find(WP, softDeletedMatcher.id)).toBe(softDeletedMatcher);
  });

  it('can disable, repair, and forget a malformed stored definition', async () => {
    const account = await asset('Checking');
    const matcher = await saveAccountMatcher(WP, { accountId: account.id, definition: DEFINITION });
    await database.write(async () =>
      database.batch(
        matcher.prepareUpdate(row => {
          row.definitionJson = '{broken';
        }),
      ),
    );
    await setAccountMatcherEnabled(WP, matcher.id, false);
    expect(matcher.isEnabled).toBe(false);
    await expect(setAccountMatcherEnabled(WP, matcher.id, true)).rejects.toThrow('invalid');
    await saveAccountMatcher(WP, { id: matcher.id, accountId: account.id, definition: DEFINITION });
    expect(JSON.parse(matcher.definitionJson)).toEqual(DEFINITION);
    await database.write(async () =>
      database.batch(
        matcher.prepareUpdate(row => {
          row.definitionJson = '{broken again';
        }),
      ),
    );
    await forgetAccountMatcher(WP, matcher.id);
    expect(await accountMatcherRepository.find(WP, matcher.id)).toBeNull();
  });

  it('reports an edit collision without changing either matcher', async () => {
    const account = await asset('Checking');
    const first = await saveAccountMatcher(WP, { accountId: account.id, definition: DEFINITION });
    const secondDefinition = { version: 1, sender: { op: 'contains', value: 'OTHERBANK' } };
    const second = await saveAccountMatcher(WP, {
      accountId: account.id,
      definition: secondDefinition,
    });
    await expect(
      saveAccountMatcher(WP, {
        id: first.id,
        accountId: account.id,
        definition: secondDefinition,
      }),
    ).rejects.toThrow('already has these conditions');
    expect(JSON.parse(first.definitionJson)).toEqual(DEFINITION);
    expect(await accountMatcherRepository.find(WP, second.id)).toBe(second);
  });

  it('does not prepare matcher changes when a write session is aborted', async () => {
    const account = await asset('Checking');
    const matcher = await saveAccountMatcher(WP, { accountId: account.id, definition: DEFINITION });
    const replacement: AccountMatcherDefinitionV1 = {
      version: 1,
      sender: { op: 'contains', value: 'OTHERBANK' },
    };
    await expect(
      runAccountingWriteSession(async session => {
        await accountMatcherRepository.saveInSession(
          session,
          WP,
          {
            accountId: account.id,
            definition: replacement,
            conditionsKey: conditionsKeyFor(replacement),
            isEnabled: true,
            provenance: matcher.provenance,
          },
          matcher,
          null,
        );
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(JSON.parse(matcher.definitionJson)).toEqual(DEFINITION);
    await setAccountMatcherEnabled(WP, matcher.id, false);
    expect(matcher.isEnabled).toBe(false);
  });

  it('coalesces a move collision and preserves a disabled choice', async () => {
    const source = await asset('Checking');
    const target = await asset('Savings');
    const moving = await saveAccountMatcher(WP, { accountId: source.id, definition: DEFINITION });
    const kept = await saveAccountMatcher(WP, {
      accountId: target.id,
      definition: DEFINITION,
      isEnabled: false,
    });
    const moved = await moveAccountMatcher(WP, moving.id, target.id);
    expect(moved.id).toBe(kept.id);
    expect(moved.isEnabled).toBe(false);
    expect(await accountMatcherRepository.findForAccount(WP, source.id)).toEqual([]);
    expect(await accountMatcherRepository.findForAccount(WP, target.id)).toHaveLength(1);
  });

  it('validates a proposal once before atomically moving its covering matcher', async () => {
    const source = await asset('Checking');
    const target = await asset('Savings');
    const moving = await saveAccountMatcher(WP, { accountId: source.id, definition: DEFINITION });
    const key = conditionsKeyFor(DEFINITION);
    const discovery = jest
      .spyOn(discoveryQueries, 'loadAccountMatcherDiscovery')
      .mockResolvedValue({
        evidence: [],
        comparisonMessages: [],
        latestLinkTime: 0,
        matchers: [],
        suppressions: [],
        suppressedProposals: [],
        proposals: [
          {
            proposalKey: key,
            accountId: target.id,
            definition: DEFINITION,
            examples: [],
            supportJournalIds: [],
            overlaps: [],
            allExamplesAutoPosted: false,
          },
        ],
      });
    try {
      const saved = await saveAccountMatcher(WP, {
        accountId: target.id,
        definition: DEFINITION,
        proposalKey: key,
        moveMatcherId: moving.id,
        provenance: 'discovered',
      });
      expect(discovery).toHaveBeenCalledTimes(1);
      expect(saved.id).toBe(moving.id);
      expect(saved.accountId).toBe(target.id);
      expect(await accountMatcherRepository.findForAccount(WP, target.id)).toHaveLength(1);
    } finally {
      discovery.mockRestore();
    }
  });

  it('leaves an overlap move untouched when proposal validation fails', async () => {
    const source = await asset('Checking');
    const target = await asset('Savings');
    const moving = await saveAccountMatcher(WP, { accountId: source.id, definition: DEFINITION });
    preferences.accountMatchers.forget(WP, target.id, conditionsKeyFor(DEFINITION));
    await expect(
      saveAccountMatcher(WP, {
        accountId: target.id,
        definition: DEFINITION,
        proposalKey: 'missing-proposal',
        moveMatcherId: moving.id,
        provenance: 'selected_message',
      }),
    ).rejects.toThrow(AccountMatcherProposalUnavailableError);
    expect(moving.accountId).toBe(source.id);
    expect(await accountMatcherRepository.findForAccount(WP, target.id)).toEqual([]);
    expect(preferences.accountMatchers.list(WP, target.id)).toEqual([
      {
        accountId: target.id,
        conditionsKey: conditionsKeyFor(DEFINITION),
        reason: 'forgotten',
      },
    ]);
  });

  it('restores forgotten suppressions only after a new selected-message matcher is saved', async () => {
    const account = await asset('Checking');
    const definition = { ...DEFINITION, flow: 'incoming' as const };
    const withFlow = conditionsKeyFor(definition);
    const withoutFlow = conditionsKeyFor({ ...definition, flow: undefined });
    preferences.accountMatchers.forget(WP, account.id, withFlow);
    preferences.accountMatchers.forget(WP, account.id, withoutFlow);
    preferences.accountMatchers.forget(WP, account.id, 'other-forgotten');
    preferences.accountMatchers.dismiss(WP, account.id, 'dismissed-key');

    const created = await saveAccountMatcher(WP, {
      accountId: account.id,
      definition,
      provenance: 'selected_message',
    });
    expect(preferences.accountMatchers.list(WP, account.id)).toEqual([
      { accountId: account.id, conditionsKey: 'other-forgotten', reason: 'forgotten' },
      { accountId: account.id, conditionsKey: 'dismissed-key', reason: 'dismissed' },
    ]);

    preferences.accountMatchers.forget(WP, account.id, withFlow);
    await saveAccountMatcher(WP, {
      id: created.id,
      accountId: account.id,
      definition,
      provenance: 'selected_message',
    });
    await saveAccountMatcher(WP, {
      accountId: account.id,
      definition: { version: 1, sender: { op: 'contains', value: 'OTHERBANK' } },
      provenance: 'manual',
    });
    await saveAccountMatcher(WP, {
      accountId: account.id,
      definition: { version: 1, sender: { op: 'contains', value: 'THIRDBANK' } },
      provenance: 'discovered',
    });
    expect(preferences.accountMatchers.list(WP, account.id)).toEqual([
      { accountId: account.id, conditionsKey: 'other-forgotten', reason: 'forgotten' },
      { accountId: account.id, conditionsKey: 'dismissed-key', reason: 'dismissed' },
      { accountId: account.id, conditionsKey: withFlow, reason: 'forgotten' },
    ]);
  });
});
