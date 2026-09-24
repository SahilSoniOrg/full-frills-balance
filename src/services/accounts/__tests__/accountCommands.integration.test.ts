import { Icon } from '@/src/types/domainIcons';
import {
  AccountSubtype,
  AccountType,
  TransactionType,
  JournalDisplayType,
  JournalStatus,
  AuditAction,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
/**
 * Account command lifecycle (integration).
 */

import { database } from '@/src/data/database/Database';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';

import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { getBalanceCorrectionAccountInput } from '@/src/data/repositories/account/accountSystemAccountInputs';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { journalListQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { Q } from '@nozbe/watermelondb';
import { adjustAccountBalance } from '@/src/services/accounts/accountAdjustCommands';
import { applyAccountArchiveChanges } from '@/src/services/accounts/accountArchiveCommands';
import { createAccount } from '@/src/services/accounts/accountCommands';
import { mergeAccounts } from '@/src/services/accounts/accountMergeCommands';
import { assertNoLiveAccountReferences } from '@/src/services/accounts/accountReferenceGraph';
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

  it('mergeAccounts rejects incompatible account types', async () => {
    const asset = await createAccount(WP, {
      name: 'Asset',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const expense = await createAccount(WP, {
      name: 'Expense',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    await expect(mergeAccounts(WP, asset.id, [expense.id])).rejects.toThrow('different categories');
  });

  it('rejects cross-currency account merges without changing either account', async () => {
    const target = await createAccount(WP, {
      name: 'USD account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const source = await createAccount(WP, {
      name: 'EUR account',
      accountType: AccountType.ASSET,
      currencyCode: 'EUR',
      workplaceId: WP,
    });

    await expect(mergeAccounts(WP, target.id, [source.id])).rejects.toThrow('different currencies');
    expect(await accountQueryRepository.find(WP, source.id)).toBeTruthy();
    expect(await accountQueryRepository.find(WP, target.id)).toBeTruthy();
  });

  it('rejects merging an ancestor into its descendant', async () => {
    const source = await createAccount(WP, {
      name: 'Parent',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const target = await createAccount(WP, {
      name: 'Child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: source.id,
      workplaceId: WP,
    });
    await createAccount(WP, {
      name: 'Grandchild',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: target.id,
      workplaceId: WP,
    });

    await expect(mergeAccounts(WP, target.id, [source.id])).rejects.toThrow('descendants');
    expect((await accountQueryRepository.find(WP, target.id))?.parentAccountId).toBe(source.id);
  });

  it('reindexes moved children after existing target children', async () => {
    const target = await createAccount(WP, {
      name: 'Target parent',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const source = await createAccount(WP, {
      name: 'Source parent',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const existing = await createAccount(WP, {
      name: 'Existing child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: target.id,
      workplaceId: WP,
    });
    const moved = await createAccount(WP, {
      name: 'Moved child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: source.id,
      workplaceId: WP,
    });

    await mergeAccounts(WP, target.id, [source.id]);

    expect((await accountQueryRepository.find(WP, existing.id))?.orderNum).toBe(0);
    expect((await accountQueryRepository.find(WP, moved.id))?.orderNum).toBe(1);
  });

  it('mergeAccounts rewrites and audits in one write', async () => {
    const target = await createAccount(WP, {
      name: 'Keep',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const source = await createAccount(WP, {
      name: 'Fold',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const writeSpy = jest.spyOn(database, 'write');
    const batchSpy = jest.spyOn(database, 'batch');
    await mergeAccounts(WP, target.id, [source.id]);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy).toHaveBeenCalledTimes(1);
    writeSpy.mockRestore();
    batchSpy.mockRestore();

    const audits = await auditRepository.findByEntity('account', target.id, WP);
    expect(audits.some(a => a.action === AuditAction.UPDATE)).toBe(true);
    const deletedSource = await accountQueryRepository.findWithDeleted(WP, source.id);
    expect(deletedSource?.deletedAt).toBeInstanceOf(Date);
  });

  it('mergeAccounts retargets every live reference before deleting the source', async () => {
    const target = await createAccount(WP, {
      name: 'Keep',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const source = await createAccount(WP, {
      name: 'Fold',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    await createAccount(WP, {
      name: 'Existing target child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: target.id,
      workplaceId: WP,
    });
    const child = await createAccount(WP, {
      name: 'Fold child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: source.id,
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
        description: 'Source transaction',
        journalDate: Date.now(),
        currencyCode: 'USD',
        totalAmount: 25,
        displayType: JournalDisplayType.EXPENSE,
        transactions: [
          {
            accountId: source.id,
            amount: 25,
            transactionType: TransactionType.DEBIT,
          },
          {
            accountId: equity.id,
            amount: 25,
            transactionType: TransactionType.CREDIT,
          },
        ],
        calculatedBalances: new Map([
          [source.id, 25],
          [equity.id, 25],
        ]),
      },
      WP,
    );

    const sourceTransaction = (
      await transactionQueryRepository.findAllByAccountIds(WP, [source.id])
    )[0];
    if (!sourceTransaction) throw new Error('Expected source transaction to exist');
    await database.write(async () => {
      await database.collections.get<AccountMetadata>('account_metadata').create(metadata => {
        metadata.workplaceId = WP;
        metadata.accountId = target.id;
        metadata.payFromAccountId = source.id;
        metadata.createdAt = new Date();
        metadata.updatedAt = new Date();
      });
      await database.collections.get<AccountMetadata>('account_metadata').create(metadata => {
        metadata.workplaceId = WP;
        metadata.accountId = source.id;
        metadata.notes = 'Source-only metadata';
        metadata.createdAt = new Date();
        metadata.updatedAt = new Date();
      });
      await sourceTransaction.update(transaction => {
        transaction.currencyCode = 'EUR';
        transaction.exchangeRate = 0.9;
      });
      await database.collections.get<BalanceSnapshot>('balance_snapshots').create(snapshot => {
        snapshot.workplaceId = WP;
        snapshot.accountId = source.id;
        snapshot.transactionId = sourceTransaction.id;
        snapshot.transactionDate = Date.now();
        snapshot.absoluteBalance = 25;
        snapshot.transactionCount = 1;
      });
    });

    const budget = await budgetRepository.create(
      WP,
      {
        name: 'Source budget',
        amount: 100,
        currencyCode: 'USD',
        startMonth: '2026-08',
        assetAccountIds: [source.id],
      },
      [source.id],
    );
    const plannedPayment = await plannedPaymentRepository.create(WP, {
      name: 'Source planned payment',
      amount: 10,
      currencyCode: 'USD',
      fromAccountId: source.id,
      toAccountId: source.id,
      intervalN: 1,
      intervalType: PlannedPaymentInterval.MONTHLY,
      startDate: Date.now(),
      nextOccurrence: Date.now(),
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: false,
    });
    const smsRule = await transactionAutoPostRuleRepository.save(
      {
        mode: 'regex',
        senderMatch: 'BANK',
        actions: {
          disposition: 'auto_post',
          sourceAccountId: source.id,
          categoryAccountId: source.id,
        },
        isActive: true,
      },
      WP,
    );

    await mergeAccounts(WP, target.id, [source.id]);

    const transactions = await transactionQueryRepository.findAllByAccountIds(WP, [source.id]);
    expect(transactions).toHaveLength(0);
    const targetTransactions = await transactionQueryRepository.findAllByAccountIds(WP, [
      target.id,
    ]);
    expect(targetTransactions).toHaveLength(1);
    expect(targetTransactions[0].currencyCode).toBe('EUR');
    expect(targetTransactions[0].exchangeRate).toBe(0.9);
    expect(targetTransactions[0].runningBalance).toBeNull();

    const refreshedChild = await accountQueryRepository.find(WP, child.id);
    expect(refreshedChild?.parentAccountId).toBe(target.id);

    const scopes = await budgetRepository.getScopes(WP, budget.id);
    expect(scopes.map(scope => scope.accountId)).toEqual([target.id]);
    const refreshedBudget = await budgetRepository.find(WP, budget.id);
    expect(refreshedBudget?.assetAccountIds).toBe(target.id);

    const refreshedPayment = await plannedPaymentRepository.find(WP, plannedPayment.id);
    expect(refreshedPayment?.fromAccountId).toBe(target.id);
    expect(refreshedPayment?.toAccountId).toBe(target.id);

    const refreshedRule = await transactionAutoPostRuleRepository.find(WP, smsRule.id);
    expect(refreshedRule?.sourceAccountId).toBe(target.id);
    expect(refreshedRule?.categoryAccountId).toBe(target.id);
    expect(JSON.parse(refreshedRule?.actionsJson ?? '{}')).toEqual(
      expect.objectContaining({ sourceAccountId: target.id, categoryAccountId: target.id }),
    );

    const metadata = await accountQueryRepository.findMetadata(WP, target.id);
    expect(metadata?.payFromAccountId).toBe(target.id);
    expect(await accountQueryRepository.findMetadata(WP, source.id)).toBeNull();
    const snapshots = await database.collections
      .get<BalanceSnapshot>('balance_snapshots')
      .query(Q.where('workplace_id', WP), Q.where('account_id', Q.oneOf([source.id, target.id])))
      .fetch();
    expect(snapshots).toHaveLength(0);
  });

  it('rejects an unbalanced posted journal before changing any merge references', async () => {
    const target = await createAccount(WP, {
      name: 'Keep unbalanced merge',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const source = await createAccount(WP, {
      name: 'Fold unbalanced merge',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const equity = await accountWriteRepository.create({
      name: 'Unbalanced merge equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    await database.write(async () => {
      const journal = await database.collections.get<Journal>('journals').create(record => {
        record.workplaceId = WP;
        record.journalDate = Date.now();
        record.description = 'Legacy unbalanced posted journal';
        record.currencyCode = 'USD';
        record.status = JournalStatus.POSTED;
        record.totalAmount = 25;
        record.transactionCount = 2;
        record.displayType = JournalDisplayType.TRANSFER;
        record.createdAt = new Date();
        record.updatedAt = new Date();
      });
      const transactions = database.collections.get<Transaction>('transactions');
      await transactions.create(record => {
        record.workplaceId = WP;
        record.journalId = journal.id;
        record.accountId = source.id;
        record.amount = 25;
        record.transactionType = TransactionType.DEBIT;
        record.currencyCode = 'USD';
        record.transactionDate = Date.now();
        record.createdAt = new Date();
        record.updatedAt = new Date();
      });
      await transactions.create(record => {
        record.workplaceId = WP;
        record.journalId = journal.id;
        record.accountId = equity.id;
        record.amount = 24;
        record.transactionType = TransactionType.CREDIT;
        record.currencyCode = 'USD';
        record.transactionDate = Date.now();
        record.createdAt = new Date();
        record.updatedAt = new Date();
      });
    });
    const budget = await budgetRepository.create(
      WP,
      {
        name: 'Merge stays intact on balance failure',
        amount: 100,
        currencyCode: 'USD',
        startMonth: '2026-09',
        assetAccountIds: [source.id],
      },
      [source.id],
    );
    const batchSpy = jest.spyOn(database, 'batch');

    await expect(mergeAccounts(WP, target.id, [source.id])).rejects.toThrow(/differ by/);

    expect(batchSpy).not.toHaveBeenCalled();
    expect(await accountQueryRepository.find(WP, source.id)).toBeTruthy();
    expect(await transactionQueryRepository.findAllByAccountIds(WP, [source.id])).toHaveLength(1);
    expect(await transactionQueryRepository.findAllByAccountIds(WP, [target.id])).toHaveLength(0);
    expect((await budgetRepository.find(WP, budget.id))?.assetAccountIds).toBe(source.id);
    expect((await budgetRepository.getScopes(WP, budget.id)).map(scope => scope.accountId)).toEqual(
      [source.id],
    );
    const targetAudits = await auditRepository.findByEntity('account', target.id, WP);
    expect(targetAudits.some(audit => audit.changes.includes('MERGE_ACCOUNTS'))).toBe(false);
  });

  it('merges multiple sources without duplicating colliding budget scopes or funding ids', async () => {
    const target = await createAccount(WP, {
      name: 'Keep',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const sourceA = await createAccount(WP, {
      name: 'Fold A',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const sourceB = await createAccount(WP, {
      name: 'Fold B',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    const budget = await budgetRepository.create(
      WP,
      {
        name: 'Colliding budget',
        amount: 100,
        currencyCode: 'USD',
        startMonth: '2026-08',
        assetAccountIds: [target.id, sourceA.id, sourceB.id],
      },
      [target.id, sourceA.id, sourceB.id],
    );
    const paymentData = {
      name: 'Shared payment',
      amount: 50,
      currencyCode: 'USD',
      intervalN: 1,
      intervalType: PlannedPaymentInterval.MONTHLY,
      startDate: 1_700_000_000_000,
      nextOccurrence: 1_700_000_000_000,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: true,
    } as const;
    const targetPayment = await plannedPaymentRepository.create(WP, {
      ...paymentData,
      fromAccountId: target.id,
      toAccountId: target.id,
    });
    const sourcePayment = await plannedPaymentRepository.create(WP, {
      ...paymentData,
      fromAccountId: sourceA.id,
      toAccountId: sourceA.id,
    });

    await mergeAccounts(WP, target.id, [sourceA.id, sourceB.id]);

    const scopes = await budgetRepository.getScopes(WP, budget.id);
    expect(scopes).toHaveLength(1);
    expect(scopes[0].accountId).toBe(target.id);
    expect((await budgetRepository.find(WP, budget.id))?.assetAccountIds).toBe(target.id);
    expect((await plannedPaymentRepository.find(WP, targetPayment.id))?.status).toBe(
      PlannedPaymentStatus.ACTIVE,
    );
    expect((await plannedPaymentRepository.find(WP, sourcePayment.id))?.status).toBe(
      PlannedPaymentStatus.PAUSED,
    );
  });

  it('is safe to retry a completed merge without creating new references', async () => {
    const target = await createAccount(WP, {
      name: 'Keep',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const source = await createAccount(WP, {
      name: 'Fold',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    await mergeAccounts(WP, target.id, [source.id]);
    await expect(mergeAccounts(WP, target.id, [source.id])).rejects.toThrow();

    expect(await accountQueryRepository.findWithDeleted(WP, source.id)).toEqual(
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    );
    expect(
      (await auditRepository.findByEntity('account', target.id, WP)).filter(
        audit => audit.action === AuditAction.UPDATE,
      ),
    ).toHaveLength(1);
  });

  it('does not partially mutate when dependent merge preparation fails', async () => {
    const target = await createAccount(WP, {
      name: 'Keep',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const source = await createAccount(WP, {
      name: 'Fold',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const budget = await budgetRepository.create(
      WP,
      {
        name: 'Rollback budget',
        amount: 100,
        currencyCode: 'USD',
        startMonth: '2026-08',
        assetAccountIds: [source.id],
      },
      [source.id],
    );
    const equity = await accountWriteRepository.create({
      name: 'Rollback equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    await createJournalFixture(
      {
        description: 'Rollback transaction',
        journalDate: Date.now(),
        currencyCode: 'USD',
        totalAmount: 25,
        displayType: JournalDisplayType.EXPENSE,
        transactions: [
          { accountId: source.id, amount: 25, transactionType: TransactionType.DEBIT },
          { accountId: equity.id, amount: 25, transactionType: TransactionType.CREDIT },
        ],
        calculatedBalances: new Map([
          [source.id, 25],
          [equity.id, 25],
        ]),
      },
      WP,
    );
    const fetchSpy = jest
      .spyOn(budgetRepository, 'findAllWithAssetAccountIds')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(mergeAccounts(WP, target.id, [source.id])).rejects.toThrow('boom');
    fetchSpy.mockRestore();

    expect(await accountQueryRepository.find(WP, source.id)).toBeTruthy();
    expect(await transactionQueryRepository.findAllByAccountIds(WP, [source.id])).toHaveLength(1);
    expect(await transactionQueryRepository.findAllByAccountIds(WP, [target.id])).toHaveLength(0);
    expect((await budgetRepository.find(WP, budget.id))?.assetAccountIds).toBe(source.id);
    expect(
      (await auditRepository.findByEntity('account', target.id, WP)).filter(
        audit => audit.action === AuditAction.UPDATE,
      ),
    ).toHaveLength(0);
  });

  it('does not corrupt references when the same merge is requested concurrently', async () => {
    const target = await createAccount(WP, {
      name: 'Keep',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const source = await createAccount(WP, {
      name: 'Fold',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    const results = await Promise.allSettled([
      mergeAccounts(WP, target.id, [source.id]),
      mergeAccounts(WP, target.id, [source.id]),
    ]);

    expect(results.some(result => result.status === 'fulfilled')).toBe(true);
    expect(await accountQueryRepository.find(WP, source.id)).toBeNull();
    expect(await assertNoLiveAccountReferences(WP, [source.id])).toBeUndefined();
  });

  it('applyAccountArchiveChanges archives primary + child in one write', async () => {
    const parent = await createAccount(WP, {
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
      icon: Icon.Wallet,
    });
    const child = await createAccount(WP, {
      name: 'Cash Sub',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
      parentAccountId: parent.id,
      icon: Icon.Wallet,
    });

    const applied = await applyAccountArchiveChanges(WP, {
      toArchive: [parent.id, child.id],
      toUnarchive: [],
    });

    expect(applied).toBe(true);
    const updated = await accountQueryRepository.find(WP, parent.id);
    expect(updated?.archivedAt).toBeTruthy();
    const refreshedChild = await accountQueryRepository.find(WP, child.id);
    expect(refreshedChild?.archivedAt).toBeTruthy();
  });
});
