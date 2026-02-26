import { database } from '@/src/data/database/Database'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { accountingService } from '@/src/utils/accountingService'
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus'
import { logger } from '@/src/utils/logger'
import { Q } from '@nozbe/watermelondb'

const CHECKPOINT_INTERVAL = 1000;

export class AccountingRebuildService {
    /**
     * Rebuilds running balances for an account using a segmented snapshot strategy.
     * @param accountId The account ID to rebuild balances for
     * @param fromDate Optional timestamp of the change. Will find the latest checkpoint before this date.
     */
    async rebuildAccountBalances(
        accountId: string,
        fromDate?: number
    ): Promise<void> {
        logger.debug(`[AccountingRebuildService] Rebuilding balances for account ${accountId} from ${fromDate || 'start'}`)

        const account = await accountRepository.find(accountId)
        if (!account) throw new Error(`Account ${accountId} not found during running balance rebuild`)

        const precision = await currencyRepository.getPrecision(account.currencyCode)

        // 1. Find the latest checkpoint strictly before the change
        const snapshot = fromDate
            ? await balanceSnapshotRepository.findLatestForAccount(accountId, fromDate - 1)
            : null;

        let runningBalance = snapshot?.absoluteBalance || 0;
        let runningCount = snapshot?.transactionCount || 0;
        let startDate = snapshot?.transactionDate || 0;

        // 2. Fetch all transactions from the checkpoint forward
        const query = transactionRepository.transactionsQuery(
            Q.experimentalJoinTables(['journals']),
            Q.where('account_id', accountId),
            Q.where('transaction_date', Q.gt(startDate)),
            Q.where('deleted_at', Q.eq(null)),
            Q.on('journals', [
                Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
                Q.where('deleted_at', Q.eq(null))
            ])
        ).extend(Q.sortBy('transaction_date', 'asc'))
            .extend(Q.sortBy('created_at', 'asc'))

        const transactions = await query.fetch();

        const pendingUpdates: { tx: any; newBalance: number }[] = [];
        const snapshotsToCreate: {
            transactionId: string,
            transactionDate: number,
            absoluteBalance: number,
            transactionCount: number
        }[] = [];

        let currentBalance = runningBalance;
        let currentCount = runningCount;

        // 3. Calculate new balances and identify new snapshots
        for (let i = 0; i < transactions.length; i++) {
            const tx = transactions[i];
            currentCount++;

            const newBalance = accountingService.calculateNewBalance(
                currentBalance,
                tx.amount,
                account.accountType,
                tx.transactionType,
                precision
            );

            if (Math.abs((tx.runningBalance || 0) - newBalance) > Number.EPSILON) {
                pendingUpdates.push({ tx, newBalance });
            }

            currentBalance = newBalance;

            // Create a snapshot every 1000 transactions
            if (currentCount % CHECKPOINT_INTERVAL === 0) {
                snapshotsToCreate.push({
                    transactionId: tx.id,
                    transactionDate: tx.transactionDate,
                    absoluteBalance: currentBalance,
                    transactionCount: currentCount
                });
            }
        }

        // 4. Batch updates in chunks
        if (pendingUpdates.length > 0 || snapshotsToCreate.length > 0) {
            await database.write(async () => {
                // Batch update transactions
                const BATCH_SIZE = 500;
                for (let i = 0; i < pendingUpdates.length; i += BATCH_SIZE) {
                    const chunk = pendingUpdates.slice(i, i + BATCH_SIZE);
                    const preparedChunk = chunk.map(({ tx, newBalance }) =>
                        tx.prepareUpdate((txToUpdate: any) => {
                            txToUpdate.runningBalance = newBalance
                        })
                    );
                    await database.batch(...preparedChunk);
                }

                // Delete invalidated snapshots after the starting point
                const invalidatedSnapshots = await database.collections.get('balance_snapshots').query(
                    Q.where('account_id', accountId),
                    Q.where('transaction_date', Q.gt(startDate))
                ).fetch();

                if (invalidatedSnapshots.length > 0) {
                    await database.batch(...invalidatedSnapshots.map(s => s.prepareDestroyPermanently()));
                }

                // Create new snapshots
                if (snapshotsToCreate.length > 0) {
                    const snapshotsCollection = database.collections.get('balance_snapshots');
                    await database.batch(
                        ...snapshotsToCreate.map(data =>
                            snapshotsCollection.prepareCreate((s: any) => {
                                s.accountId = accountId;
                                s.transactionId = data.transactionId;
                                s.transactionDate = data.transactionDate;
                                s.absoluteBalance = data.absoluteBalance;
                                s.transactionCount = data.transactionCount;
                            })
                        )
                    );
                }
            });
        }
    }
}

export const accountingRebuildService = new AccountingRebuildService()
