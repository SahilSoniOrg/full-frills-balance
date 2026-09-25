import {
  AccountSubtype,
  AccountType,
  TransactionType,
  JournalDisplayType,
  AuditAction,
} from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
/**
 * Account command lifecycle (integration).
 */

import { database } from '@/src/data/database/Database';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { getBalanceCorrectionAccountInput } from '@/src/data/repositories/account/accountSystemAccountInputs';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { journalListQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { adjustAccountBalance } from '@/src/services/accounts/accountAdjustCommands';
import { createAccount } from '@/src/services/accounts/accountCommands';
import { reconcileAccount } from '@/src/services/accounts/accountReconcileCommands';
import { balanceReadService } from '@/src/services/balance/balanceReadService';

const WP = 'wp-acct-cmd' as WorkplaceId;

describe('account commands (integration)', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  }, 15000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('create persists account, audit log, and initial balance journal', async () => {
    const created = await createAccount(WP, {
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      initialBalance: 500,
      workplaceId: WP,
    });

    expect(created.name).toBe('Checking');
    expect(created.accountSubtype).toBe(AccountSubtype.CASH);

    const balance = await balanceReadService.getAccountBalance(created.id, WP);
    expect(balance.balance).toBe(500);

    const audits = await auditRepository.findByEntity('account', created.id, WP);
    expect(audits.some(a => a.action === AuditAction.CREATE)).toBe(true);

    const journals = await journalListQueryRepository.findAll(WP);
    expect(journals.some(j => j.description?.includes('Initial Balance'))).toBe(true);
  });

  it('create with opening balance uses one write', async () => {
    const writeSpy = jest.spyOn(database, 'write');
    const batchSpy = jest.spyOn(database, 'batch');
    await createAccount(WP, {
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      initialBalance: 500,
      workplaceId: WP,
    });
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy).toHaveBeenCalledTimes(1);
    writeSpy.mockRestore();
    batchSpy.mockRestore();
  });

  it('does not persist account rows or audits when opening-journal validation fails', async () => {
    const putInSession = journalPersistenceRepository.putInSession.bind(
      journalPersistenceRepository,
    );
    const putSpy = jest
      .spyOn(journalPersistenceRepository, 'putInSession')
      .mockImplementation((session, journal, workplaceId) =>
        putInSession(
          session,
          {
            ...journal,
            transactions: (journal.transactions ?? []).map((line, index) =>
              index === 0 ? { ...line, amount: line.amount + 1 } : line,
            ),
          },
          workplaceId,
        ),
      );

    await expect(
      createAccount(WP, {
        name: 'Rejected opening account',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        initialBalance: 500,
        workplaceId: WP,
      }),
    ).rejects.toThrow(/differ by/);
    putSpy.mockRestore();

    expect(await database.collections.get('accounts').query().fetchCount()).toBe(0);
    expect(await database.collections.get('journals').query().fetchCount()).toBe(0);
    expect(await database.collections.get('transactions').query().fetchCount()).toBe(0);
    expect(await database.collections.get('audit_logs').query().fetchCount()).toBe(0);
  });

  it('create stores metadata on the account', async () => {
    const created = await createAccount(WP, {
      name: 'Rewards Card',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      currencyCode: 'USD',
      workplaceId: WP,
      metadata: { creditLimitAmount: 10_000, statementDay: 15 },
    });

    const meta = await accountQueryRepository.findMetadata(WP, created.id);
    expect(meta?.creditLimitAmount).toBe(10_000);
    expect(meta?.statementDay).toBe(15);
  });

  it('assigns omitted sibling positions inside the write owner', async () => {
    const parent = await createAccount(WP, {
      name: 'Concurrent parent',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const created = await Promise.all(
      ['Concurrent A', 'Concurrent B'].map(name =>
        createAccount(WP, {
          name,
          accountType: AccountType.ASSET,
          currencyCode: 'USD',
          parentAccountId: parent.id,
          workplaceId: WP,
        }),
      ),
    );
    expect(created.map(account => account.orderNum).sort()).toEqual([0, 1]);
  });

  it('does not allow ordinary creation to inject an explicit sibling position', async () => {
    await createAccount(WP, {
      name: 'First',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    const second = await createAccount(WP, {
      name: 'Second',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      orderNum: 0,
      workplaceId: WP,
    });

    expect(second.orderNum).toBe(1);
  });

  it('create rejects parent with mismatched type', async () => {
    const expenseParent = await createAccount(WP, {
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    await expect(
      createAccount(WP, {
        name: 'Nested',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        parentAccountId: expenseParent.id,
        workplaceId: WP,
      }),
    ).rejects.toThrow('Parent account must be of the same type');
  });

  it('adjustBalance posts correction journal to reach target', async () => {
    const asset = await createAccount(WP, {
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const equity = await accountWriteRepository.create({
      name: 'Equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    await createJournalFixture(
      {
        description: 'Seed',
        journalDate: Date.now(),
        currencyCode: 'USD',
        totalAmount: 100,
        displayType: JournalDisplayType.INCOME,
        transactions: [
          {
            accountId: asset.id,
            amount: 100,
            transactionType: TransactionType.DEBIT,
          },
          {
            accountId: equity.id,
            amount: 100,
            transactionType: TransactionType.CREDIT,
          },
        ],
        calculatedBalances: new Map([
          [asset.id, 100],
          [equity.id, 100],
        ]),
      },
      WP,
    );
    const writeSpy = jest.spyOn(database, 'write');
    const batchSpy = jest.spyOn(database, 'batch');
    await adjustAccountBalance(WP, asset, 250);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy).toHaveBeenCalledTimes(1);
    const balance = await balanceReadService.getAccountBalance(asset.id, WP);
    expect(balance.balance).toBe(250);
    writeSpy.mockRestore();
    batchSpy.mockRestore();
  });

  it('adjustBalance can pair with an income category counterparty', async () => {
    const asset = await createAccount(WP, {
      name: 'Wallet',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const income = await createAccount(WP, {
      name: 'Salary',
      accountType: AccountType.INCOME,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    await adjustAccountBalance(WP, asset, 75, {
      kind: 'account',
      accountId: income.id,
    });

    const balance = await balanceReadService.getAccountBalance(asset.id, WP);
    expect(balance.balance).toBe(75);
  });

  it('calculates the adjustment from ledger entries instead of stale running-balance cache', async () => {
    const asset = await createAccount(WP, {
      name: 'Stale cache asset',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const equity = await createAccount(WP, {
      name: 'Stale cache equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    await createJournalFixture(
      {
        description: 'Seed with stale cache',
        journalDate: 1_000,
        currencyCode: 'USD',
        totalAmount: 100,
        displayType: JournalDisplayType.TRANSFER,
        transactions: [
          { accountId: asset.id, amount: 100, transactionType: TransactionType.DEBIT },
          { accountId: equity.id, amount: 100, transactionType: TransactionType.CREDIT },
        ],
        calculatedBalances: new Map([
          [asset.id, 900],
          [equity.id, 900],
        ]),
      },
      WP,
    );

    await adjustAccountBalance(WP, asset, 250);

    const adjustment = (await journalListQueryRepository.findAll(WP)).find(journal =>
      journal.description?.startsWith('Balance Adjustment: Stale cache asset'),
    );
    expect(adjustment).toBeTruthy();
    const lines = await transactionQueryRepository.findByJournal(WP, adjustment!.id);
    expect(lines[0].amount).toBe(150);
    expect(
      await transactionRawRepository.getAccountSumRaw(
        WP,
        asset.id,
        Number.MAX_SAFE_INTEGER,
        AccountType.ASSET,
      ),
    ).toBe(250);
  });

  it('serializes concurrent adjustments so only the remaining difference is posted', async () => {
    const asset = await createAccount(WP, {
      name: 'Concurrent adjustment asset',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    await Promise.all([adjustAccountBalance(WP, asset, 250), adjustAccountBalance(WP, asset, 250)]);

    const adjustments = (await journalListQueryRepository.findAll(WP)).filter(journal =>
      journal.description?.startsWith('Balance Adjustment: Concurrent adjustment asset'),
    );
    expect(adjustments).toHaveLength(1);
    expect(
      await transactionRawRepository.getAccountSumRaw(
        WP,
        asset.id,
        Number.MAX_SAFE_INTEGER,
        AccountType.ASSET,
      ),
    ).toBe(250);
    const correctionInput = getBalanceCorrectionAccountInput('USD', WP);
    expect(await accountQueryRepository.findByName(WP, correctionInput.name)).toBeTruthy();
  });

  it('does not leave a correction account when adjustment-journal validation fails', async () => {
    const asset = await createAccount(WP, {
      name: 'Rejected adjustment asset',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const putInSession = journalPersistenceRepository.putInSession.bind(
      journalPersistenceRepository,
    );
    const putSpy = jest
      .spyOn(journalPersistenceRepository, 'putInSession')
      .mockImplementation((session, journal, workplaceId) =>
        putInSession(
          session,
          {
            ...journal,
            transactions: (journal.transactions ?? []).map((line, index) =>
              index === 0 ? { ...line, amount: line.amount + 1 } : line,
            ),
          },
          workplaceId,
        ),
      );
    const batchSpy = jest.spyOn(database, 'batch');

    await expect(adjustAccountBalance(WP, asset, 75)).rejects.toThrow(/differ by/);
    putSpy.mockRestore();

    const correctionInput = getBalanceCorrectionAccountInput('USD', WP);
    expect(await accountQueryRepository.findByName(WP, correctionInput.name)).toBeNull();
    expect(await database.collections.get('journals').query().fetchCount()).toBe(0);
    expect(await database.collections.get('transactions').query().fetchCount()).toBe(0);
    expect(batchSpy).not.toHaveBeenCalled();
  });

  it('reconcileAccount sets reconciledAt and audits update', async () => {
    const account = await createAccount(WP, {
      name: 'Reconcilable',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    const reconcileDate = new Date(2026, 0, 31);
    const updated = await reconcileAccount(account.id, reconcileDate, WP);

    expect(updated.reconciledAt?.getTime()).toBe(reconcileDate.getTime());

    const audits = await auditRepository.findByEntity('account', account.id, WP);
    expect(audits.some(a => a.action === AuditAction.UPDATE)).toBe(true);
  });

  it('reconcile uses one write', async () => {
    const account = await createAccount(WP, {
      name: 'One Write Recon',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const writeSpy = jest.spyOn(database, 'write');
    await reconcileAccount(account.id, new Date(2026, 1, 1), WP);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    writeSpy.mockRestore();
  });
});
