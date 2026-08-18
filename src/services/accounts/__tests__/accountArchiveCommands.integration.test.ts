import { database } from '@/src/data/database/Database';
import { AuditAction, AccountSubtype, AccountType, WorkplaceId } from '@/src/types/domain';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { applyAccountArchiveChanges } from '@/src/services/accounts/accountArchiveCommands';
import { createAccount } from '@/src/services/accounts/accountCommands';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { balanceService } from '@/src/services/BalanceService';
import { filterAccountsForDisplay } from '@/src/utils/accountArchive';
import { firstValueFrom } from 'rxjs';

const WP = 'wp-archive-cmd' as WorkplaceId;

describe('applyAccountArchiveChanges (integration)', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  }, 15000);

  it('returns false when no account ids are provided', async () => {
    const applied = await applyAccountArchiveChanges(WP, { toArchive: [], toUnarchive: [] });
    expect(applied).toBe(false);
  });

  it('returns false when archiving an already-archived account', async () => {
    const account = await createAccount(WP, {
      name: 'Vault',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    expect(
      await applyAccountArchiveChanges(WP, {
        toArchive: [account.id],
        toUnarchive: [],
      }),
    ).toBe(true);

    expect(
      await applyAccountArchiveChanges(WP, {
        toArchive: [account.id],
        toUnarchive: [],
      }),
    ).toBe(false);
  });

  it('returns false when unarchiving an active account', async () => {
    const account = await createAccount(WP, {
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    expect(
      await applyAccountArchiveChanges(WP, {
        toArchive: [],
        toUnarchive: [account.id],
      }),
    ).toBe(false);
  });

  it('archives an account, writes audit log, and preserves balance', async () => {
    const account = await createAccount(WP, {
      name: 'Savings',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      initialBalance: 500,
      workplaceId: WP,
    });

    const balanceBefore = await balanceService.getAccountBalance(account.id, WP);
    const applied = await applyAccountArchiveChanges(WP, {
      toArchive: [account.id],
      toUnarchive: [],
    });

    expect(applied).toBe(true);

    const refreshed = await accountRepository.find(WP, account.id);
    expect(refreshed?.archivedAt).toBeTruthy();

    const balanceAfter = await balanceService.getAccountBalance(account.id, WP);
    expect(balanceAfter.balance).toBe(balanceBefore.balance);

    const audits = await auditRepository.findByEntity('account', account.id, WP);
    expect(audits.some(a => a.action === AuditAction.UPDATE)).toBe(true);
  });

  it('unarchives a previously archived account', async () => {
    const account = await createAccount(WP, {
      name: 'Hidden',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    await applyAccountArchiveChanges(WP, {
      toArchive: [account.id],
      toUnarchive: [],
    });

    const applied = await applyAccountArchiveChanges(WP, {
      toArchive: [],
      toUnarchive: [account.id],
    });

    expect(applied).toBe(true);
    const refreshed = await accountRepository.find(WP, account.id);
    expect(refreshed?.archivedAt == null).toBe(true);
  });

  it('archives parent and child independently in one batch', async () => {
    const parent = await createAccount(WP, {
      name: 'Cash',
      accountType: AccountType.ASSET,
      accountSubtype: AccountSubtype.CASH,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const child = await createAccount(WP, {
      name: 'Cash Sub',
      accountType: AccountType.ASSET,
      accountSubtype: AccountSubtype.CASH,
      currencyCode: 'USD',
      workplaceId: WP,
      parentAccountId: parent.id,
    });

    const applied = await applyAccountArchiveChanges(WP, {
      toArchive: [parent.id, child.id],
      toUnarchive: [],
    });

    expect(applied).toBe(true);

    const refreshedParent = await accountRepository.find(WP, parent.id);
    const refreshedChild = await accountRepository.find(WP, child.id);
    expect(refreshedParent?.archivedAt).toBeTruthy();
    expect(refreshedChild?.archivedAt).toBeTruthy();
  });

  it('archives only parent when child is omitted from the change set', async () => {
    const parent = await createAccount(WP, {
      name: 'Parent',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const child = await createAccount(WP, {
      name: 'Child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
      parentAccountId: parent.id,
    });

    await applyAccountArchiveChanges(WP, {
      toArchive: [parent.id],
      toUnarchive: [],
    });

    const refreshedParent = await accountRepository.find(WP, parent.id);
    const refreshedChild = await accountRepository.find(WP, child.id);
    expect(refreshedParent?.archivedAt).toBeTruthy();
    expect(refreshedChild?.archivedAt == null).toBe(true);
  });

  it('observeArchivedAt emits null then timestamp then null across archive lifecycle', async () => {
    const account = await createAccount(WP, {
      name: 'Reactive',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const accountId = account.id;

    expect(await firstValueFrom(accountQueries.observeArchivedAt(WP, accountId))).toBeNull();

    await applyAccountArchiveChanges(WP, { toArchive: [accountId], toUnarchive: [] });
    const archivedAtMs = await firstValueFrom(accountQueries.observeArchivedAt(WP, accountId));
    expect(archivedAtMs).not.toBeNull();

    await applyAccountArchiveChanges(WP, { toArchive: [], toUnarchive: [accountId] });
    expect(await firstValueFrom(accountQueries.observeArchivedAt(WP, accountId))).toBeNull();
  });

  it('hides archived accounts from display filter unless pinned', async () => {
    const active = await createAccount(WP, {
      name: 'Active',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const archived = await createAccount(WP, {
      name: 'Archived',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    await applyAccountArchiveChanges(WP, {
      toArchive: [archived.id],
      toUnarchive: [],
    });

    const all = await accountRepository.findAll(WP);
    const hiddenIds = filterAccountsForDisplay(all, false).map(a => a.id);
    expect(hiddenIds).toContain(active.id);
    expect(hiddenIds).not.toContain(archived.id);

    const pinnedIds = filterAccountsForDisplay(all, false, new Set([archived.id])).map(a => a.id);
    expect(pinnedIds).toEqual(expect.arrayContaining([active.id, archived.id]));
  });
});
