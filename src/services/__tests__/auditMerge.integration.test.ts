import { database } from '@/src/data/database/Database';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { mergeAccounts } from '@/src/services/accounts/accountMergeCommands';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import {
  AccountType,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  TransactionType,
} from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

const workplaceId = 'wp-audit-merge' as WorkplaceId;
beforeEach(async () => {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
});

async function createAccount(name: string, parentAccountId?: AccountId, orderNum?: number) {
  return accountWriteRepository.create({
    name,
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId,
    parentAccountId,
    orderNum,
  });
}

test('account merge audits retain the original journal, payment, and budget references', async () => {
  const source = await createAccount('Source');
  const target = await createAccount('Target');
  const other = await createAccount('Other');
  const journal = await journalPersistenceService.put(
    {
      journalDate: 1700000000000,
      currencyCode: 'USD',
      transactions: [
        { accountId: source.id, amount: 10, transactionType: TransactionType.DEBIT },
        { accountId: other.id, amount: 10, transactionType: TransactionType.CREDIT },
      ],
    },
    workplaceId,
  );
  const payment = await plannedPaymentRepository.create(workplaceId, {
    name: 'Payment',
    amount: 10,
    currencyCode: 'USD',
    fromAccountId: source.id,
    toAccountId: other.id,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: 1000,
    nextOccurrence: 1000,
    status: PlannedPaymentStatus.ACTIVE,
    isAutoPost: false,
  });
  const budgets = await Promise.all(
    [false, true].map(withFunding =>
      budgetRepository.create(
        workplaceId,
        {
          name: withFunding ? 'Funded' : 'Scope only',
          amount: 100,
          currencyCode: 'USD',
          startMonth: '2026-09',
          ...(withFunding ? { assetAccountIds: [source.id] } : {}),
        },
        [source.id],
      ),
    ),
  );

  await mergeAccounts(workplaceId, target.id, [source.id]);

  const journalLog = (await auditRepository.findByEntity('journal', journal.id, workplaceId)).find(
    log => log.eventType === 'journal.accounts_retargeted',
  )!;
  expect(journalLog.parsedChanges?.before?.transactions).toEqual(
    expect.arrayContaining([expect.objectContaining({ accountId: source.id })]),
  );
  expect(journalLog.parsedChanges?.after?.transactions).toEqual(
    expect.arrayContaining([expect.objectContaining({ accountId: target.id })]),
  );
  const paymentLog = (
    await auditRepository.findByEntity('planned_payment', payment.id, workplaceId)
  ).find(log => log.eventType === 'planned_payment.accounts_retargeted')!;
  expect(paymentLog.parsedChanges?.before?.fromAccountId).toBe(source.id);
  expect(paymentLog.parsedChanges?.after?.fromAccountId).toBe(target.id);
  for (const budget of budgets) {
    const log = (await auditRepository.findByEntity('budget', budget.id, workplaceId)).find(
      log => log.eventType === 'budget.accounts_retargeted',
    )!;
    expect(log.parsedChanges?.before?.scopedAccountIds).toEqual([source.id]);
    expect(log.parsedChanges?.after?.scopedAccountIds).toEqual([target.id]);
  }
});

test('parent account merge audits retain the original child placement', async () => {
  const source = await createAccount('Source parent');
  const target = await createAccount('Target parent');
  const moved = await createAccount('Moved child', source.id, 3);
  await createAccount('Existing child', target.id, 9);
  await mergeAccounts(workplaceId, target.id, [source.id]);
  const log = (await auditRepository.findByEntity('account', moved.id, workplaceId)).find(
    log => log.eventType === 'account.hierarchy_retargeted',
  )!;
  expect(log.parsedChanges?.before).toEqual({ parentAccountId: source.id, orderNum: 3 });
  expect(log.parsedChanges?.after).toEqual({ parentAccountId: target.id, orderNum: 10 });
});
