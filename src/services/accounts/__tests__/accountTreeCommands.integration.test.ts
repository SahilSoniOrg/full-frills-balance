import { database } from '@/src/data/database/Database';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import {
  moveAccount,
  moveAccounts,
  restoreAccountTreeMove,
  saveAccountTreeDraft,
  saveAccount,
} from '../accountHierarchyCommands';
import { planAccountTreeMove } from '../accountTree';

const workplaceId = 'tree-command-workplace' as WorkplaceId;

describe('moveAccount', () => {
  beforeEach(async () => {
    await database.write(async () => database.unsafeResetDatabase());
  }, 15_000);

  it('persists a cross-parent move and normalizes both sibling lists in one command', async () => {
    const firstRoot = await accountWriteRepository.create({
      name: 'First root',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 0,
      workplaceId,
    });
    const secondRoot = await accountWriteRepository.create({
      name: 'Second root',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 1,
      workplaceId,
    });
    const child = await accountWriteRepository.create({
      name: 'Child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 0,
      parentAccountId: firstRoot.id,
      workplaceId,
    });

    await moveAccount(workplaceId, child.id, { parentId: secondRoot.id, siblingIndex: 0 });

    const accounts = await accountQueryRepository.findAll(workplaceId);
    expect(accounts.find(account => account.id === child.id)).toMatchObject({
      parentAccountId: secondRoot.id,
      orderNum: 0,
    });
    expect(accounts.find(account => account.id === firstRoot.id)?.orderNum).toBe(0);
    expect(accounts.find(account => account.id === secondRoot.id)?.orderNum).toBe(1);
  });

  it('rejects archived destinations before writing', async () => {
    const child = await accountWriteRepository.create({
      name: 'Child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 0,
      workplaceId,
    });
    const archivedParent = await accountWriteRepository.create({
      name: 'Archived parent',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 1,
      archivedAt: new Date(),
      workplaceId,
    });

    await expect(
      moveAccount(workplaceId, child.id, { parentId: archivedParent.id, siblingIndex: 0 }),
    ).rejects.toThrow('Archived accounts cannot have new children');
    expect((await accountQueryRepository.find(workplaceId, child.id))?.parentAccountId).toBeNull();
  });

  it('reorders the same sibling list repeatedly without losing the parent', async () => {
    const first = await accountWriteRepository.create({
      name: 'First',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 0,
      workplaceId,
    });
    const second = await accountWriteRepository.create({
      name: 'Second',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 1,
      workplaceId,
    });
    const third = await accountWriteRepository.create({
      name: 'Third',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 2,
      workplaceId,
    });

    await moveAccount(workplaceId, second.id, { parentId: null, siblingIndex: 0 });
    await moveAccount(workplaceId, second.id, { parentId: null, siblingIndex: 2 });

    const accounts = await accountQueryRepository.findAll(workplaceId);
    expect(
      accounts.sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0)).map(account => account.id),
    ).toEqual([first.id, third.id, second.id]);
    expect(accounts.every(account => !account.parentAccountId)).toBe(true);
  });

  it('returns a receipt and atomically restores sparse same-parent selections', async () => {
    const accounts = await Promise.all(
      ['A', 'B', 'C', 'D'].map((name, orderNum) =>
        accountWriteRepository.create({
          name,
          accountType: AccountType.ASSET,
          currencyCode: 'USD',
          orderNum,
          workplaceId,
        }),
      ),
    );

    const receipt = await moveAccounts(workplaceId, [accounts[1].id, accounts[3].id], {
      parentId: null,
      siblingIndex: 0,
    });
    expect(receipt.before).toHaveLength(4);
    expect(receipt.after.some(row => row.accountId === accounts[1].id)).toBe(true);

    await restoreAccountTreeMove(workplaceId, receipt);
    const restored = await accountQueryRepository.findAll(workplaceId);
    expect(restored.sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0)).map(a => a.name)).toEqual(
      ['A', 'B', 'C', 'D'],
    );
    const audits = await auditRepository.findByEntity('account', accounts[1].id, workplaceId);
    expect(audits).toHaveLength(2);
    expect(audits.some(audit => audit.changes.includes('account_tree_restore'))).toBe(true);
  });

  it('restores sparse cross-parent selections and rejects stale receipts', async () => {
    const source = await accountWriteRepository.create({
      name: 'Source',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 0,
      workplaceId,
    });
    const destination = await accountWriteRepository.create({
      name: 'Destination',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 1,
      workplaceId,
    });
    await accountWriteRepository.create({
      name: 'First',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: source.id,
      orderNum: 0,
      workplaceId,
    });
    const second = await accountWriteRepository.create({
      name: 'Second',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: source.id,
      orderNum: 1,
      workplaceId,
    });
    const third = await accountWriteRepository.create({
      name: 'Third',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: source.id,
      orderNum: 2,
      workplaceId,
    });

    const receipt = await moveAccounts(workplaceId, [second.id, third.id], {
      parentId: destination.id,
      siblingIndex: 0,
    });
    await restoreAccountTreeMove(workplaceId, receipt);
    const restoredSource = await accountQueryRepository.findAll(workplaceId);
    expect(
      restoredSource
        .filter(account => account.parentAccountId === source.id)
        .sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0))
        .map(account => account.name),
    ).toEqual(['First', 'Second', 'Third']);

    const staleReceipt = await moveAccounts(workplaceId, [second.id, third.id], {
      parentId: destination.id,
      siblingIndex: 0,
    });
    await accountWriteRepository.create({
      name: 'Added after move',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: source.id,
      workplaceId,
    });
    await expect(restoreAccountTreeMove(workplaceId, staleReceipt)).rejects.toThrow(
      'undo is no longer available',
    );
    expect((await accountQueryRepository.find(workplaceId, second.id))?.parentAccountId).toBe(
      destination.id,
    );
  });
});

describe('saveAccountTreeDraft', () => {
  beforeEach(async () => {
    await database.write(async () => database.unsafeResetDatabase());
  }, 15_000);

  it('persists composed placements atomically from a complete baseline', async () => {
    const source = await accountWriteRepository.create({
      name: 'Source',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 0,
      workplaceId,
    });
    const destination = await accountWriteRepository.create({
      name: 'Destination',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 1,
      workplaceId,
    });
    const child = await accountWriteRepository.create({
      name: 'Child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: source.id,
      orderNum: 0,
      workplaceId,
    });
    const baselineAccounts = await accountQueryRepository.findAll(workplaceId);
    const baseline = baselineAccounts.map(account => ({
      accountId: account.id,
      parentAccountId: account.parentAccountId || undefined,
      orderNum: account.orderNum ?? 0,
    }));
    const placements = planAccountTreeMove(baselineAccounts, {
      accountId: child.id,
      parentId: destination.id,
      siblingIndex: 0,
    });

    await saveAccountTreeDraft(workplaceId, baseline, placements);

    expect((await accountQueryRepository.find(workplaceId, child.id))?.parentAccountId).toBe(
      destination.id,
    );
  });

  it('saves a valid touched list when an unrelated sibling list has legacy gaps', async () => {
    const firstAsset = await accountWriteRepository.create({
      name: 'First asset',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 0,
      workplaceId,
    });
    const secondAsset = await accountWriteRepository.create({
      name: 'Second asset',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 1,
      workplaceId,
    });
    await accountWriteRepository.create({
      name: 'Legacy expense one',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      orderNum: 4,
      workplaceId,
    });
    await accountWriteRepository.create({
      name: 'Legacy expense two',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      orderNum: 9,
      workplaceId,
    });
    const baselineAccounts = await accountQueryRepository.findAll(workplaceId);
    const baseline = baselineAccounts.map(account => ({
      accountId: account.id,
      accountType: account.accountType,
      parentAccountId: account.parentAccountId || undefined,
      orderNum: account.orderNum ?? 0,
    }));
    const placements = planAccountTreeMove(baselineAccounts, {
      accountId: firstAsset.id,
      parentId: null,
      siblingIndex: 2,
    });

    await saveAccountTreeDraft(workplaceId, baseline, placements);

    const assets = (await accountQueryRepository.findAll(workplaceId))
      .filter(account => account.accountType === AccountType.ASSET)
      .sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0));
    expect(assets.map(account => account.id)).toEqual([secondAsset.id, firstAsset.id]);
  });

  it('rejects a stale baseline before writing any placement', async () => {
    const first = await accountWriteRepository.create({
      name: 'First',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 0,
      workplaceId,
    });
    const second = await accountWriteRepository.create({
      name: 'Second',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 1,
      workplaceId,
    });
    const baselineAccounts = await accountQueryRepository.findAll(workplaceId);
    const baseline = baselineAccounts.map(account => ({
      accountId: account.id,
      parentAccountId: account.parentAccountId || undefined,
      orderNum: account.orderNum ?? 0,
    }));
    const planningAccounts = baselineAccounts.map(account => ({
      id: account.id,
      accountType: account.accountType,
      parentAccountId: account.parentAccountId || undefined,
      orderNum: account.orderNum ?? 0,
    }));
    await moveAccount(workplaceId, second.id, { parentId: null, siblingIndex: 0 });
    const placements = planAccountTreeMove(planningAccounts, {
      accountId: first.id,
      parentId: null,
      siblingIndex: 1,
    });

    await expect(saveAccountTreeDraft(workplaceId, baseline, placements)).rejects.toThrow(
      'staged changes are no longer current',
    );
    expect((await accountQueryRepository.find(workplaceId, second.id))?.orderNum).toBe(0);
  });

  it('rejects a sibling added to a touched list after the baseline was captured', async () => {
    const destination = await accountWriteRepository.create({
      name: 'Destination',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 0,
      workplaceId,
    });
    await accountWriteRepository.create({
      name: 'Existing child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: destination.id,
      orderNum: 0,
      workplaceId,
    });
    const moving = await accountWriteRepository.create({
      name: 'Moving',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 1,
      workplaceId,
    });
    const baselineAccounts = await accountQueryRepository.findAll(workplaceId);
    const baseline = baselineAccounts.map(account => ({
      accountId: account.id,
      parentAccountId: account.parentAccountId || undefined,
      orderNum: account.orderNum ?? 0,
    }));
    const placements = planAccountTreeMove(baselineAccounts, {
      accountId: moving.id,
      parentId: destination.id,
      siblingIndex: 1,
    });

    await accountWriteRepository.create({
      name: 'Concurrent child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: destination.id,
      orderNum: 1,
      workplaceId,
    });

    await expect(saveAccountTreeDraft(workplaceId, baseline, placements)).rejects.toThrow(
      'staged changes are no longer current',
    );
    expect((await accountQueryRepository.find(workplaceId, moving.id))?.parentAccountId).toBeNull();
  });

  it('persists a staged move back to the root', async () => {
    const parent = await accountWriteRepository.create({
      name: 'Parent',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 0,
      workplaceId,
    });
    const child = await accountWriteRepository.create({
      name: 'Child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: parent.id,
      orderNum: 0,
      workplaceId,
    });
    const baselineAccounts = await accountQueryRepository.findAll(workplaceId);
    const baseline = baselineAccounts.map(account => ({
      accountId: account.id,
      parentAccountId: account.parentAccountId || undefined,
      orderNum: account.orderNum ?? 0,
    }));
    const placements = planAccountTreeMove(
      baselineAccounts.map(account => ({
        id: account.id,
        accountType: account.accountType,
        parentAccountId: account.parentAccountId || undefined,
        orderNum: account.orderNum ?? 0,
      })),
      { accountId: child.id, parentId: null, siblingIndex: 1 },
    );

    await saveAccountTreeDraft(workplaceId, baseline, placements);

    expect((await accountQueryRepository.find(workplaceId, child.id))?.parentAccountId).toBeNull();
  });
});

describe('saveAccount', () => {
  beforeEach(async () => {
    await database.write(async () => database.unsafeResetDatabase());
  }, 15_000);

  it('atomically saves details, parent placement, and sibling normalization', async () => {
    const parent = await accountWriteRepository.create({
      name: 'Parent',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 0,
      workplaceId,
    });
    const firstChild = await accountWriteRepository.create({
      name: 'First child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: parent.id,
      orderNum: 4,
      workplaceId,
    });
    const moving = await accountWriteRepository.create({
      name: 'Moving',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 1,
      workplaceId,
    });

    await saveAccount(workplaceId, moving.id, {
      name: 'Moved and renamed',
      parentAccountId: parent.id,
    });

    const accounts = await accountQueryRepository.findAll(workplaceId);
    expect(accounts.find(account => account.id === moving.id)).toMatchObject({
      name: 'Moved and renamed',
      parentAccountId: parent.id,
      orderNum: 1,
    });
    expect(accounts.find(account => account.id === firstChild.id)?.orderNum).toBe(0);
  });

  it('leaves details untouched when hierarchy validation fails', async () => {
    const account = await accountWriteRepository.create({
      name: 'Original',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 0,
      workplaceId,
    });
    const wrongTypeParent = await accountWriteRepository.create({
      name: 'Liability parent',
      accountType: AccountType.LIABILITY,
      currencyCode: 'USD',
      orderNum: 0,
      workplaceId,
    });

    await expect(
      saveAccount(workplaceId, account.id, {
        name: 'Must not persist',
        parentAccountId: wrongTypeParent.id,
      }),
    ).rejects.toThrow('Parent account must be of the same type');

    expect((await accountQueryRepository.find(workplaceId, account.id))?.name).toBe('Original');
  });

  it('moves a leaf between type-scoped root lists in the same save', async () => {
    const changing = await accountWriteRepository.create({
      name: 'Changing',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 0,
      workplaceId,
    });
    const remainingAsset = await accountWriteRepository.create({
      name: 'Remaining asset',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 8,
      workplaceId,
    });
    await accountWriteRepository.create({
      name: 'Existing liability',
      accountType: AccountType.LIABILITY,
      currencyCode: 'USD',
      orderNum: 3,
      workplaceId,
    });

    await saveAccount(workplaceId, changing.id, {
      accountType: AccountType.LIABILITY,
      parentAccountId: null,
    });

    const accounts = await accountQueryRepository.findAll(workplaceId);
    expect(accounts.find(account => account.id === changing.id)).toMatchObject({
      accountType: AccountType.LIABILITY,
      orderNum: 1,
    });
    expect(accounts.find(account => account.id === remainingAsset.id)?.orderNum).toBe(0);
  });
});
