import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { database } from '@/src/data/database/Database';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { registerAuditHandlers } from '@/src/services/audit-handlers';
import { revertEntry } from '@/src/services/audit-service';
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
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/ids';
import { resetDatabase } from '@/src/testing/resetDatabase';

const wp = 'wp-review' as WorkplaceId;
registerAuditHandlers();
beforeEach(async () => {
  await resetDatabase();
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
  expect(await revertEntry(log.id, wp)).toEqual({ success: true });
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
  expect((await revertEntry(log.id, wp)).success).toBe(false);
  expect(a.name).toBe('Latest edit');
  expect(await auditRepository.countByWorkplace(wp)).toBe(count);
});

test('budget amount history captures pre-edit state and undo restores it', async () => {
  const scope = await account('Budget scope');
  const budget = await budgetRepository.create(
    wp,
    { name: 'Food', amount: 100, currencyCode: 'USD', startMonth: '2026-09' },
    [scope.id as AccountId],
  );

  await budgetRepository.update(wp, budget, { amount: 200 }, [scope.id as AccountId]);
  const [log] = (await auditRepository.findByEntity('budget', budget.id, wp)).filter(
    entry => entry.eventType === 'budget.updated',
  );
  expect(log.parsedChanges?.before).toMatchObject({ amount: 100 });
  expect(log.parsedChanges?.after).toMatchObject({ amount: 200 });
  expect(await revertEntry(log.id, wp)).toEqual({ success: true });
  expect((await budgetRepository.find(wp, budget.id as BudgetId))?.amount).toBe(100);
});

test.each([
  [{ name: 'Renamed' }, 'name', 'Old name', 'Renamed'],
  [{ active: false }, 'active', true, false],
  [{ currencyCode: 'EUR' }, 'currencyCode', 'USD', 'EUR'],
  [{ startDate: 1700000000000 }, 'startDate', null, 1700000000000],
  [{ intervalType: 'WEEKLY' }, 'intervalType', 'MONTHLY', 'WEEKLY'],
  [{ intervalN: 2 }, 'intervalN', 1, 2],
  [{ recurrenceDay: 12 }, 'recurrenceDay', null, 12],
  [{ recurrenceMonth: 4 }, 'recurrenceMonth', null, 4],
] as const)(
  'budget scalar edit has truthful %s audit values',
  async (updates, field, beforeValue, afterValue) => {
    const budget = await budgetRepository.create(
      wp,
      {
        name: 'Old name',
        amount: 100,
        currencyCode: 'USD',
        startMonth: '2026-09',
        intervalType: 'MONTHLY',
        intervalN: 1,
      },
      [],
    );
    await budgetRepository.update(wp, budget, updates, []);
    const [log] = (await auditRepository.findByEntity('budget', budget.id, wp)).filter(
      entry => entry.eventType === 'budget.updated',
    );
    expect(log.parsedChanges?.before).toMatchObject({ [field]: beforeValue });
    expect(log.parsedChanges?.after).toMatchObject({ [field]: afterValue });
  },
);

test('budget undo restores combined scalar, scope, and funding edits', async () => {
  const originalScope = await account('Original scope');
  const replacementScope = await account('Replacement scope');
  const budget = await budgetRepository.create(
    wp,
    {
      name: 'Original',
      amount: 100,
      currencyCode: 'USD',
      startMonth: '2026-09',
      assetAccountIds: [originalScope.id as AccountId],
    },
    [originalScope.id as AccountId],
  );
  await budgetRepository.update(
    wp,
    budget,
    { name: 'Edited', amount: 250, assetAccountIds: [replacementScope.id as AccountId] },
    [replacementScope.id as AccountId],
  );
  const [log] = (await auditRepository.findByEntity('budget', budget.id, wp)).filter(
    entry => entry.eventType === 'budget.updated',
  );
  expect(await revertEntry(log.id, wp)).toEqual({ success: true });
  const restored = await budgetRepository.find(wp, budget.id as BudgetId);
  expect(restored?.name).toBe('Original');
  expect(restored?.amount).toBe(100);
  expect(restored?.assetAccountIds).toBe(originalScope.id);
  expect(
    (await budgetRepository.getScopes(wp, budget.id as BudgetId)).map(item => item.accountId),
  ).toEqual([originalScope.id]);
});

test('stale budget undo rejects without changing budget or history', async () => {
  const scope = await account('Scope');
  const budget = await budgetRepository.create(
    wp,
    { name: 'Original', amount: 100, currencyCode: 'USD', startMonth: '2026-09' },
    [scope.id as AccountId],
  );
  await budgetRepository.update(wp, budget, { amount: 200 }, [scope.id as AccountId]);
  const [firstEdit] = (await auditRepository.findByEntity('budget', budget.id, wp)).filter(
    entry => entry.eventType === 'budget.updated',
  );
  await budgetRepository.update(wp, budget, { amount: 300 }, [scope.id as AccountId]);
  const count = await auditRepository.countByWorkplace(wp);
  expect((await revertEntry(firstEdit.id, wp)).success).toBe(false);
  expect((await budgetRepository.find(wp, budget.id as BudgetId))?.amount).toBe(300);
  expect(await auditRepository.countByWorkplace(wp)).toBe(count);
});

test('undo form color change restores original color', async () => {
  const a = await account('Colored', '#112233');
  await saveAccount(wp, a.id, { color: '#445566' });
  const [log] = await auditRepository.findByEntity('account', a.id, wp);
  expect(await revertEntry(log.id, wp)).toEqual({ success: true });
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
    expect(await revertEntry(log.id, wp)).toEqual({ success: true });
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
  expect(await revertEntry(post.id, wp)).toEqual({ success: true });
  expect(journal.status).toBe(JournalStatus.PLANNED);
  expect(journal.journalDate).toBe(plannedAt);
  const revert = (await auditRepository.findByEntity('journal', journal.id, wp)).find(
    log => log.eventType === 'journal.reverted_to_planned',
  )!;
  expect(await revertEntry(revert.id, wp)).toEqual({ success: true });
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
  const result = await revertEntry(log.id, wp);
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
  expect(await revertEntry(log.id, wp)).toEqual({ success: true });
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
  expect(await revertEntry(log.id, wp)).toEqual({ success: true });
  expect(journal.totalAmount).toBe(10);
});

test('journal edits undo one at a time, newest first', async () => {
  const a = await account('Stack cash');
  const b = await account('Stack other');
  const lines = (amount: number) => [
    { accountId: a.id, amount, transactionType: TransactionType.DEBIT },
    { accountId: b.id, amount, transactionType: TransactionType.CREDIT },
  ];
  const journal = await journalPersistenceService.put(
    { journalDate: 1700000000000, currencyCode: 'USD', transactions: lines(10) },
    wp,
  );
  const updates = async () =>
    (await auditRepository.findByEntity('journal', journal.id, wp)).filter(
      log => log.action === AuditAction.UPDATE,
    );
  await journalPersistenceService.put({ journalId: journal.id, transactions: lines(20) }, wp);
  const [first] = await updates();
  await journalPersistenceService.put({ journalId: journal.id, transactions: lines(30) }, wp);
  const second = (await updates()).find(log => log.id !== first.id)!;

  expect(await revertEntry(second.id, wp)).toEqual({ success: true });
  expect(journal.totalAmount).toBe(20);
  expect(await revertEntry(first.id, wp)).toEqual({ success: true });
  expect(journal.totalAmount).toBe(10);
});

test('journal edit undo can cross an indicative import marker when it still matches current data', async () => {
  const a = await account('Imported cash');
  const b = await account('Imported category');
  const journalDate = 1700000000000;
  const journal = await journalPersistenceService.put(
    {
      journalDate,
      currencyCode: 'USD',
      description: 'Imported state',
      transactions: [
        { accountId: a.id, amount: 30, transactionType: TransactionType.DEBIT },
        { accountId: b.id, amount: 30, transactionType: TransactionType.CREDIT },
      ],
    },
    wp,
  );
  const currentLines = await transactionQueryRepository.findByJournal(wp, journal.id);
  const importedSnapshot = {
    description: journal.description,
    notes: journal.notes ?? null,
    journalDate,
    currencyCode: journal.currencyCode,
    status: journal.status,
    totalAmount: journal.totalAmount,
    transactions: currentLines.map(line => ({
      accountId: line.accountId,
      amount: line.amount,
      transactionType: line.transactionType,
      notes: line.notes ?? undefined,
      exchangeRate: line.exchangeRate ?? undefined,
      currencyCode: line.currencyCode ?? undefined,
    })),
  };
  const oldSnapshot = (amount: number, description: string) => ({
    ...importedSnapshot,
    description,
    totalAmount: amount,
    transactions: importedSnapshot.transactions.map(line => ({ ...line, amount })),
  });
  const edited = auditRepository.prepareLog(
    {
      entityType: 'journal',
      entityId: journal.id,
      action: AuditAction.UPDATE,
      eventType: 'journal.updated',
      changes: { before: oldSnapshot(10, 'Original'), after: oldSnapshot(20, 'Edited') },
      undoable: true,
    },
    wp,
  );
  const imported = auditRepository.prepareLog(
    {
      entityType: 'journal',
      entityId: journal.id,
      action: AuditAction.CREATE,
      eventType: 'journal.imported',
      source: 'import',
      changes: { after: importedSnapshot },
      undoable: false,
    },
    wp,
  );
  await database.write(() => database.batch(edited, imported));
  const [created] = await auditRepository
    .findByEntity('journal', journal.id, wp, 10)
    .then(logs => logs.filter(log => log.id !== edited.id && log.id !== imported.id));
  // Same-millisecond logs sort by random id, so the creation log could land after the edit.
  await database.write(async () => {
    await edited.update(record => {
      record.timestamp = created.timestamp + 1;
    });
    await imported.update(record => {
      record.timestamp = created.timestamp + 2;
    });
  });

  expect(await revertEntry(edited.id, wp)).toEqual({ success: true });
  expect(journal.description).toBe('Original');
  expect(journal.totalAmount).toBe(10);
});
