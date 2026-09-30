import { database } from '@/src/data/database/Database';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { registerAuditHandlers } from '@/src/services/audit-handlers';
import { auditService } from '@/src/services/audit-service';
import { updateAccount, saveAccount } from '@/src/services/accounts/accountHierarchyCommands';
import { deleteAccount } from '@/src/services/accounts/accountDeleteCommands';
import {
  AccountType,
  AuditAction,
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  TransactionType,
} from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';

const wp = 'wp-review' as WorkplaceId;
registerAuditHandlers();
beforeEach(async () => {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
});
async function account(name: string, color?: string) {
  return accountWriteRepository.create({
    name,
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId: wp,
    color,
  });
}

test('schedule advancement records the old and new occurrence', async () => {
  const a = await account('A');
  const b = await account('B');
  const payment = await plannedPaymentRepository.create(wp, {
    name: 'Rent',
    amount: 10,
    currencyCode: 'USD',
    fromAccountId: a.id,
    toAccountId: b.id,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: 1000,
    nextOccurrence: 1000,
    status: PlannedPaymentStatus.ACTIVE,
    isAutoPost: false,
  });
  await runAccountingWriteSession(session =>
    plannedPaymentRepository.updateInSession(
      session,
      wp,
      payment.id,
      { nextOccurrence: 2000 },
      undefined,
      { eventType: 'planned_payment.schedule_advanced' },
    ),
  );
  const logs = await auditRepository.findByEntity('planned_payment', payment.id, wp);
  const log = logs.find(log => log.eventType === 'planned_payment.schedule_advanced')!;
  expect(log.parsedChanges?.before).toEqual({ nextOccurrence: 1000 });
  expect(log.parsedChanges?.after).toEqual({ nextOccurrence: 2000 });
});

test('account undo records the state that it changed', async () => {
  const a = await account('Original');
  await updateAccount(wp, a.id, { name: 'Edited' });
  const [log] = await auditRepository.findByEntity('account', a.id, wp);
  expect(await auditService.revertEntry(log.id, wp)).toEqual({ success: true });
  expect(a.name).toBe('Original');
  const reverted = (await auditRepository.findByEntity('account', a.id, wp)).find(
    log => log.eventType === 'account.reverted',
  )!;
  expect(reverted.parsedChanges?.before).toEqual({ name: 'Edited' });
  expect(reverted.parsedChanges?.after).toEqual({ name: 'Original' });
  expect(reverted.parsedChanges?.revertsLogId).toBe(log.id);
});

test('a stale account undo leaves the account and history untouched', async () => {
  const a = await account('Original');
  await updateAccount(wp, a.id, { name: 'First edit' });
  const [log] = await auditRepository.findByEntity('account', a.id, wp);
  await updateAccount(wp, a.id, { name: 'Latest edit' });
  const count = await auditRepository.countByWorkplace(wp);
  expect((await auditService.revertEntry(log.id, wp)).success).toBe(false);
  expect(a.name).toBe('Latest edit');
  expect(await auditRepository.countByWorkplace(wp)).toBe(count);
});

test('undo form color change restores original color', async () => {
  const a = await account('Colored', '#112233');
  await saveAccount(wp, a.id, { color: '#445566' });
  const [log] = await auditRepository.findByEntity('account', a.id, wp);
  expect(await auditService.revertEntry(log.id, wp)).toEqual({ success: true });
  expect(a.color).toBe('#112233');
});

test.each([
  [JournalStatus.PLANNED, JournalStatus.POSTED],
  [JournalStatus.POSTED, JournalStatus.PLANNED],
  [JournalStatus.PLANNED, JournalStatus.PAUSED],
])(
  'undo a combined %s to %s edit restores all changed fields',
  async (beforeStatus, afterStatus) => {
    const a = await account('Cash');
    const b = await account('Other');
    const journal = await journalPersistenceService.put(
      {
        journalDate: 1700000000000,
        currencyCode: 'USD',
        description: 'Old',
        status: beforeStatus,
        transactions: [
          { accountId: a.id, amount: 10, transactionType: TransactionType.DEBIT },
          { accountId: b.id, amount: 10, transactionType: TransactionType.CREDIT },
        ],
      },
      wp,
    );
    await journalPersistenceService.put(
      {
        journalId: journal.id,
        status: afterStatus,
        description: 'New',
        journalDate: 1700000060000,
      },
      wp,
    );
    const log = (await auditRepository.findByEntity('journal', journal.id, wp)).find(
      log => log.action === AuditAction.UPDATE,
    )!;
    expect(await auditService.revertEntry(log.id, wp)).toEqual({ success: true });
    expect(journal.status).toBe(beforeStatus);
    expect(journal.description).toBe('Old');
    expect(journal.journalDate).toBe(1700000000000);
  },
);

test('posting and reverting-to-planned lifecycle events remain undoable', async () => {
  const a = await account('Cash');
  const b = await account('Other');
  const plannedAt = 1700000000000;
  const postedAt = plannedAt + 60000;
  const journal = await journalPersistenceService.put(
    {
      journalDate: plannedAt,
      currencyCode: 'USD',
      status: JournalStatus.PLANNED,
      transactions: [
        { accountId: a.id, amount: 10, transactionType: TransactionType.DEBIT },
        { accountId: b.id, amount: 10, transactionType: TransactionType.CREDIT },
      ],
    },
    wp,
  );
  await journalPersistenceService.post(journal.id, wp, postedAt);
  const post = (await auditRepository.findByEntity('journal', journal.id, wp)).find(
    log => log.eventType === 'journal.posted',
  )!;
  expect(await auditService.revertEntry(post.id, wp)).toEqual({ success: true });
  expect(journal.status).toBe(JournalStatus.PLANNED);
  expect(journal.journalDate).toBe(plannedAt);
  const revert = (await auditRepository.findByEntity('journal', journal.id, wp)).find(
    log => log.eventType === 'journal.reverted_to_planned',
  )!;
  expect(await auditService.revertEntry(revert.id, wp)).toEqual({ success: true });
  expect(journal.status).toBe(JournalStatus.POSTED);
  expect(journal.journalDate).toBe(postedAt);
});

test('undo metadata cannot restore a deleted payment source', async () => {
  const a = await account('Source A');
  const b = await account('Source B');
  const card = await accountWriteRepository.create({
    name: 'Card',
    accountType: AccountType.LIABILITY,
    currencyCode: 'USD',
    workplaceId: wp,
    metadata: { payFromAccountId: a.id },
  });
  await updateAccount(wp, card.id, { metadata: { payFromAccountId: b.id } });
  const [log] = await auditRepository.findByEntity('account', card.id, wp);
  await deleteAccount(a.id, wp);
  expect(await accountQueryRepository.find(wp, a.id)).toBeNull();
  const result = await auditService.revertEntry(log.id, wp);
  expect(result.success).toBe(false);
  expect(result.error).toContain('missing or deleted');
  expect((await accountQueryRepository.findMetadata(wp, card.id))?.payFromAccountId).toBe(b.id);
});

test('undo metadata restores a payment source that is still live', async () => {
  const a = await account('Source A');
  const b = await account('Source B');
  const card = await accountWriteRepository.create({
    name: 'Card',
    accountType: AccountType.LIABILITY,
    currencyCode: 'USD',
    workplaceId: wp,
    metadata: { payFromAccountId: a.id },
  });
  await updateAccount(wp, card.id, { metadata: { payFromAccountId: b.id } });
  const [log] = await auditRepository.findByEntity('account', card.id, wp);
  expect(await auditService.revertEntry(log.id, wp)).toEqual({ success: true });
  expect((await accountQueryRepository.findMetadata(wp, card.id))?.payFromAccountId).toBe(a.id);
});

test('journal amount undo accepts serialized null optional line fields', async () => {
  const a = await account('Cash');
  const b = await account('Other');
  const journal = await journalPersistenceService.put(
    {
      journalDate: 1700000000000,
      currencyCode: 'USD',
      transactions: [
        { accountId: a.id, amount: 10, transactionType: TransactionType.DEBIT },
        { accountId: b.id, amount: 10, transactionType: TransactionType.CREDIT },
      ],
    },
    wp,
  );
  await journalPersistenceService.put(
    {
      journalId: journal.id,
      transactions: [
        { accountId: a.id, amount: 20, transactionType: TransactionType.DEBIT },
        { accountId: b.id, amount: 20, transactionType: TransactionType.CREDIT },
      ],
    },
    wp,
  );
  const log = (await auditRepository.findByEntity('journal', journal.id, wp)).find(
    log => log.action === AuditAction.UPDATE,
  )!;
  expect(await auditService.revertEntry(log.id, wp)).toEqual({ success: true });
  expect(journal.totalAmount).toBe(10);
});
