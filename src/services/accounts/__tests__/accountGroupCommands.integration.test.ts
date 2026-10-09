import { database } from '@/src/data/database/Database';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { AccountType, TransactionType } from '@/src/types/enums';
import { asWorkplaceId, type AccountId } from '@/src/types/ids';
import { disbandAccountGroup } from '../accountGroupCommands';

const workplaceId = asWorkplaceId('group-commands');
const make = (name: string, orderNum: number, parentAccountId?: AccountId) =>
  accountWriteRepository.create({
    name,
    orderNum,
    parentAccountId,
    workplaceId,
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  });

beforeEach(async () => {
  await resetDatabase();
}, 15000);
afterEach(() => jest.restoreAllMocks());

it('replaces a root group with its children in one write, preserving journal lines and archive state', async () => {
  const before = await make('Before', 0);
  const group = await make('Group', 1);
  const after = await make('After', 2);
  const first = await make('First child', 0, group.id);
  const second = await make('Second child', 1, group.id);
  const archivedAt = new Date();
  await accountWriteRepository.update(second, { archivedAt }, workplaceId);
  await createJournalFixture(
    {
      description: 'Child transfer',
      journalDate: Date.now(),
      currencyCode: 'USD',
      transactions: [
        { accountId: first.id, amount: 25, transactionType: TransactionType.DEBIT },
        { accountId: before.id, amount: 25, transactionType: TransactionType.CREDIT },
      ],
    },
    workplaceId,
  );
  const linesBefore = (
    await transactionQueryRepository.findAllByAccountIds(workplaceId, [first.id])
  ).map(line => ({ id: line.id, accountId: line.accountId, amount: line.amount }));
  const writeSpy = jest.spyOn(database, 'write');
  const batchSpy = jest.spyOn(database, 'batch');

  await disbandAccountGroup(workplaceId, group.id);

  expect(writeSpy).toHaveBeenCalledTimes(1);
  expect(batchSpy).toHaveBeenCalledTimes(1);
  const roots = (await accountQueryRepository.findAll(workplaceId)).filter(a => !a.parentAccountId);
  expect(roots.map(a => a.id)).toEqual([before.id, first.id, second.id, after.id]);
  expect(roots.map(a => a.orderNum)).toEqual([0, 1, 2, 3]);
  expect(
    (await accountQueryRepository.findWithDeleted(workplaceId, group.id))?.deletedAt,
  ).toBeInstanceOf(Date);
  expect((await accountQueryRepository.find(workplaceId, second.id))?.archivedAt).toEqual(
    archivedAt,
  );
  expect(
    (await transactionQueryRepository.findAllByAccountIds(workplaceId, [first.id])).map(line => ({
      id: line.id,
      accountId: line.accountId,
      amount: line.amount,
    })),
  ).toEqual(linesBefore);
  const audits = await auditRepository.findByEntity('account', first.id, workplaceId);
  const moved = audits.find(log => log.eventType === 'account.hierarchy_retargeted');
  expect(JSON.parse(moved!.changes)).toMatchObject({
    before: { parentAccountId: group.id, orderNum: 0 },
    after: { orderNum: 1 },
  });
  const groupAudits = await auditRepository.findByEntity('account', group.id, workplaceId);
  expect(groupAudits.some(log => log.eventType === 'account.group_disbanded')).toBe(true);
});

it('promotes nested children one level and preserves their own subtrees', async () => {
  const root = await make('Root', 0);
  const before = await make('Before', 0, root.id);
  const group = await make('Nested group', 1, root.id);
  const after = await make('After', 2, root.id);
  const subgroup = await make('Subgroup', 0, group.id);
  const grandchild = await make('Grandchild', 0, subgroup.id);
  await disbandAccountGroup(workplaceId, group.id);
  const siblings = await accountQueryRepository.queryByParentId(workplaceId, root.id).fetch();
  expect(siblings.map(a => a.id)).toEqual([before.id, subgroup.id, after.id]);
  expect(siblings.map(a => a.orderNum)).toEqual([0, 1, 2]);
  expect((await accountQueryRepository.find(workplaceId, grandchild.id))?.parentAccountId).toBe(
    subgroup.id,
  );
});

it('blocks group references before changing children or the group', async () => {
  const group = await make('Budget group', 0);
  const child = await make('Child', 0, group.id);
  const budget = await budgetRepository.create(
    workplaceId,
    {
      name: 'Group budget',
      amount: 100,
      currencyCode: 'USD',
      startMonth: '2026-10',
      assetAccountIds: [group.id],
    },
    [group.id],
  );
  const batchSpy = jest.spyOn(database, 'batch');
  await expect(disbandAccountGroup(workplaceId, group.id)).rejects.toThrow(
    'cannot be disbanded while referenced',
  );
  expect(batchSpy).not.toHaveBeenCalled();
  expect(await accountQueryRepository.find(workplaceId, group.id)).toBeTruthy();
  expect((await accountQueryRepository.find(workplaceId, child.id))?.parentAccountId).toBe(
    group.id,
  );
  expect((await budgetRepository.getScopes(workplaceId, budget.id))[0].accountId).toBe(group.id);
});

it('rejects legacy direct transactions on a group without changing its hierarchy', async () => {
  const group = await make('Legacy group', 0);
  const child = await make('Child', 0, group.id);
  const counterparty = await make('Counterparty', 1);
  await createJournalFixture(
    {
      description: 'Legacy parent line',
      journalDate: Date.now(),
      currencyCode: 'USD',
      transactions: [
        { accountId: group.id, amount: 10, transactionType: TransactionType.DEBIT },
        { accountId: counterparty.id, amount: 10, transactionType: TransactionType.CREDIT },
      ],
    },
    workplaceId,
  );
  await expect(disbandAccountGroup(workplaceId, group.id)).rejects.toThrow('transaction(s)');
  expect((await accountQueryRepository.find(workplaceId, child.id))?.parentAccountId).toBe(
    group.id,
  );
  expect(await accountQueryRepository.find(workplaceId, group.id)).toBeTruthy();
});

it('rechecks whether the account is still a group and enforces workplace scope', async () => {
  const leaf = await make('Leaf', 0);
  await expect(disbandAccountGroup(workplaceId, leaf.id)).rejects.toThrow('no longer a group');
  await expect(disbandAccountGroup(asWorkplaceId('other'), leaf.id)).rejects.toThrow(
    'Group not found',
  );
  expect(await accountQueryRepository.find(workplaceId, leaf.id)).toBeTruthy();
});
