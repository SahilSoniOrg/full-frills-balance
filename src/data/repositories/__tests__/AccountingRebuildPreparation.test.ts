import Account from '@/src/data/models/Account';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { transactionWriteRepository } from '@/src/data/repositories/transaction';
import { AccountId, TransactionId, WorkplaceId } from '@/src/types/ids';

describe('Accounting rebuild repository preparation', () => {
  const workplaceId = 'wp-local' as WorkplaceId;
  const accountId = 'account-local' as AccountId;

  it('prepares a running-balance update through the transaction repository', () => {
    const updated: { runningBalance?: number } = {};
    const transaction = {
      id: 'transaction-local' as TransactionId,
      workplaceId,
      prepareUpdate: jest.fn((mutate: (record: typeof updated) => void) => {
        mutate(updated);
        return updated;
      }),
    } as unknown as Transaction;

    transactionWriteRepository.prepareRunningBalanceUpdate(workplaceId, transaction, 125);

    expect(transaction.prepareUpdate).toHaveBeenCalledTimes(1);
    expect(updated.runningBalance).toBe(125);
  });

  it('rejects running-balance preparation for a foreign transaction', () => {
    const transaction = {
      workplaceId: 'wp-foreign' as WorkplaceId,
      prepareUpdate: jest.fn(),
    } as unknown as Transaction;

    expect(() =>
      transactionWriteRepository.prepareRunningBalanceUpdate(workplaceId, transaction, 125),
    ).toThrow('Transaction does not belong to the specified workplace');
    expect(transaction.prepareUpdate).not.toHaveBeenCalled();
  });

  it('prepares invalidated snapshot deletion through the snapshot repository', () => {
    const snapshot = {
      workplaceId,
      accountId,
      prepareDestroyPermanently: jest.fn(() => 'delete-op'),
    } as unknown as BalanceSnapshot;

    expect(
      balanceSnapshotRepository.prepareDeleteForAccount(workplaceId, accountId, snapshot),
    ).toBe('delete-op');
    expect(snapshot.prepareDestroyPermanently).toHaveBeenCalledTimes(1);
  });

  it('rejects invalidated snapshot deletion outside the scoped account', () => {
    const snapshot = {
      workplaceId,
      accountId: 'account-foreign' as AccountId,
      prepareDestroyPermanently: jest.fn(),
    } as unknown as BalanceSnapshot;

    expect(() =>
      balanceSnapshotRepository.prepareDeleteForAccount(workplaceId, accountId, snapshot),
    ).toThrow('Balance snapshot does not belong to the specified account and workplace');
    expect(snapshot.prepareDestroyPermanently).not.toHaveBeenCalled();
  });

  it('rejects invalidated snapshot deletion from a foreign workplace', () => {
    const snapshot = {
      workplaceId: 'wp-foreign' as WorkplaceId,
      accountId,
      prepareDestroyPermanently: jest.fn(),
    } as unknown as BalanceSnapshot;

    expect(() =>
      balanceSnapshotRepository.prepareDeleteForAccount(workplaceId, accountId, snapshot),
    ).toThrow('Balance snapshot does not belong to the specified account and workplace');
    expect(snapshot.prepareDestroyPermanently).not.toHaveBeenCalled();
  });

  it('prepares account refresh through the account repository', () => {
    const updated: { updatedAt?: Date } = {};
    const account = {
      workplaceId,
      prepareUpdate: jest.fn((mutate: (record: typeof updated) => void) => {
        mutate(updated);
        return updated;
      }),
    } as unknown as Account;

    accountWriteRepository.prepareRefresh(workplaceId, account);

    expect(account.prepareUpdate).toHaveBeenCalledTimes(1);
    expect(updated.updatedAt).toEqual(expect.any(Date));
  });

  it('rejects account refresh outside the scoped workplace', () => {
    const account = {
      workplaceId: 'wp-foreign' as WorkplaceId,
      prepareUpdate: jest.fn(),
    } as unknown as Account;

    expect(() => accountWriteRepository.prepareRefresh(workplaceId, account)).toThrow(
      'Account does not belong to the specified workplace',
    );
    expect(account.prepareUpdate).not.toHaveBeenCalled();
  });
});
