import { database } from '@/src/data/database/Database';
import {
  AccountType,
  TransactionType,
  AccountId,
  WorkplaceId,
  AuditAction,
} from '@/src/types/domain';

import AuditLog from '@/src/data/models/AuditLog';
import Transaction from '@/src/data/models/Transaction';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { IntegrityService } from '@/src/services/integrity-service';
import { Q } from '@nozbe/watermelondb';

describe('IntegrityService', () => {
  let service: IntegrityService;
  let cashAccountId: string;
  let equityAccountId: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    service = new IntegrityService();

    const cash = await accountWriteRepository.create({
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    const equity = await accountWriteRepository.create({
      name: 'Equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    cashAccountId = cash.id;
    equityAccountId = equity.id;
  });

  describe('computeBalanceFromTransactions', () => {
    it('should compute correct debit/credit balanced sum', async () => {
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'In',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 1000,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 1000,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Out',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 300,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 300,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const balance = await service.computeBalanceFromTransactions(
        cashAccountId as AccountId,
        'wp-1' as WorkplaceId,
      );
      expect(balance).toBe(700);
    });
  });

  describe('verifyAccountBalance', () => {
    it('should detect when cached running balance is corrupted', async () => {
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Deposit',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 500,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 500,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      // Corrupt it
      const transactions = await database.collections
        .get<Transaction>('transactions')
        .query()
        .fetch();
      await database.write(async () => {
        await transactions[0].update(t => {
          t.runningBalance = 9999;
        });
      });

      const result = await service.verifyAccountBalance(
        cashAccountId as AccountId,
        'wp-1' as WorkplaceId,
      );
      expect(result.matches).toBe(false);
      expect(result.computedBalance).toBe(500);
    });
  });

  describe('repairAccountBalance', () => {
    it('should fix running balance discrepancies', async () => {
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Deposit',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 500,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 500,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      // Corrupt it
      const transactions = await database.collections
        .get<Transaction>('transactions')
        .query()
        .fetch();
      await database.write(async () => {
        await transactions[0].update(t => {
          t.runningBalance = 9999;
        });
      });

      await service.repairAccountBalance('wp-1' as WorkplaceId, cashAccountId as AccountId);

      const result = await service.verifyAccountBalance(
        cashAccountId as AccountId,
        'wp-1' as WorkplaceId,
      );
      expect(result.matches).toBe(true);
      expect(result.computedBalance).toBe(500);

      const auditLogs = await database.collections.get<AuditLog>('audit_logs').query().fetch();
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].entityType).toBe('account');
      expect(auditLogs[0].entityId).toBe(cashAccountId);
      expect(auditLogs[0].action).toBe(AuditAction.UPDATE);
      expect(JSON.parse(auditLogs[0].changes)).toEqual(
        expect.objectContaining({
          before: expect.objectContaining({
            cachedBalance: 9999,
            computedBalance: 500,
          }),
          after: expect.objectContaining({
            repairType: 'running_balance',
            trigger: 'repair',
            balanceAfterRepair: 500,
          }),
        }),
      );
    });
  });

  describe('computeBalanceFromTransactions with snapshot boundaries', () => {
    it('should correctly compute balance when snapshot exists on a boundary with multiple transactions at same timestamp', async () => {
      const now = Date.now();

      // Create two transactions at the exact same timestamp
      // Note: We use manual created_at via update to ensure they match exactly
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'First',
          journalDate: now,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 100,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Second',
          journalDate: now,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: cashAccountId as AccountId,
              amount: 200,
              transactionType: TransactionType.DEBIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const allTxs = await database.collections
        .get<Transaction>('transactions')
        .query(Q.where('account_id', cashAccountId))
        .fetch();

      // Sort to identify first and second reliably by amount
      const sorted = [...allTxs].sort((a, b) => a.amount - b.amount);
      const tx1 = sorted[0];
      const tx2 = sorted[1];

      // Manually align their created_at to be identical
      const sameTime = new Date();
      await database.write(async () => {
        await tx1.update(t => {
          t.createdAt = sameTime;
          t.runningBalance = 100;
          t.transactionDate = now;
        });
        await tx2.update(t => {
          t.createdAt = sameTime;
          t.runningBalance = 300;
          t.transactionDate = now;
        });
      });

      // Re-fetch to ensure we have updated state
      const uTx1 = await database.collections.get<Transaction>('transactions').find(tx1.id);

      // Create a snapshot for the FIRST transaction
      await balanceSnapshotRepository.create('wp-1' as WorkplaceId, {
        accountId: cashAccountId as AccountId,
        transactionId: uTx1!.id,
        transactionDate: uTx1!.transactionDate,
        absoluteBalance: 100,
        transactionCount: 1,
      });

      // The computed balance should be 300 (100 from snapshot + 200 from tx2)
      const balance = await service.computeBalanceFromTransactions(
        cashAccountId as AccountId,
        'wp-1' as WorkplaceId,
      );
      expect(balance).toBe(300);
    });
  });

  describe('forceRunCheck workplace isolation', () => {
    it('does not notify a foreign account when repair output contains its ID', async () => {
      jest.spyOn(service, 'scanForNullAccountTransactions').mockResolvedValue();

      const foreignAccount = await accountWriteRepository.create({
        name: 'Foreign account',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId: 'wp-2' as WorkplaceId,
      });
      await database.write(async () => {
        await foreignAccount.update(account => {
          account.updatedAt = new Date(123);
        });
      });

      jest.spyOn(service, 'verifyAccountBalance').mockImplementation(async accountId => {
        if (accountId === cashAccountId) {
          return {
            accountId: foreignAccount.id,
            accountName: foreignAccount.name,
            cachedBalance: 999,
            computedBalance: 100,
            matches: false,
            discrepancy: 899,
          };
        }
        return {
          accountId,
          accountName: 'Equity',
          cachedBalance: 0,
          computedBalance: 0,
          matches: true,
          discrepancy: 0,
        };
      });
      jest.spyOn(accountingRebuildService, 'rebuildAccountBalancesInternal').mockResolvedValue();

      await service.forceRunCheck('wp-1' as WorkplaceId);

      const unchangedForeignAccount = await accountQueryRepository.find(
        'wp-2' as WorkplaceId,
        foreignAccount.id,
      );
      expect(unchangedForeignAccount?.updatedAt.getTime()).toBe(123);
    });
  });

  describe('scanForNullAccountTransactions workplace isolation', () => {
    it('throws only when null-account transactions belong to the scanned workplace', async () => {
      // Create a transaction in wp-2 with null account_id
      await database.write(async () => {
        await database.collections.get<Transaction>('transactions').create(t => {
          t.workplaceId = 'wp-2' as WorkplaceId;
          t.transactionDate = Date.now();
          t.amount = 100;
          t.transactionType = TransactionType.DEBIT;
          (t as any).accountId = null;
          (t as any)._setRaw('account_id', null);
        });
      });

      // Scanning wp-1 should not throw because the corrupted transaction is in wp-2
      await expect(
        service.scanForNullAccountTransactions('wp-1' as WorkplaceId),
      ).resolves.toBeUndefined();

      // Scanning wp-2 must throw
      await expect(service.scanForNullAccountTransactions('wp-2' as WorkplaceId)).rejects.toThrow(
        /CRITICAL INTEGRITY FAILURE.*Workplace: wp-2/,
      );
    });
  });
});
