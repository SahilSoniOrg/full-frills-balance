import { database } from '@/src/data/database/Database'
import Transaction, { TransactionType } from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository'
import { RebuildTransaction } from '@/src/data/repositories/TransactionTypes'
import { accountingService } from '@/src/utils/accountingService'
import { logger } from '@/src/utils/logger'
import { amountsAreEqual } from '@/src/utils/money'
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

        // 2. Fetch minimal raw transaction data for calculation
        // This is significantly faster than fetching full models (O(1) memory per row vs O(Model))
        let rawTransactions: RebuildTransaction[] = await transactionRawRepository.getRebuildDataRaw(accountId, startDate);

        // Precise Anchor: If we have a snapshot, find its transaction and skip everything up to it.
        if (snapshot) {
            const snapshotIdx = rawTransactions.findIndex(tx => tx.id === snapshot.transactionId);
            if (snapshotIdx !== -1) {
                rawTransactions = rawTransactions.slice(snapshotIdx + 1);
            } else {
                // Fallback: exclude snapshot date purely by timestamp if ID not found
                rawTransactions = rawTransactions.filter(tx => tx.transactionDate > startDate);
            }
        }

        const idsNeedingUpdate = new Map<string, number>(); // id -> newBalance
        const snapshotsToCreate: {
            transactionId: string,
            transactionDate: number,
            absoluteBalance: number,
            transactionCount: number
        }[] = [];

        let currentBalance = runningBalance;
        let currentCount = runningCount;

        // 3. Calculate new balances and identify new snapshots using plain objects
        for (let i = 0; i < rawTransactions.length; i++) {
            const tx = rawTransactions[i];
            currentCount++;

            const newBalance = accountingService.calculateNewBalance(
                currentBalance,
                tx.amount,
                account.accountType,
                tx.transactionType as TransactionType,
                precision
            );

            const isSnapshotPoint = currentCount % CHECKPOINT_INTERVAL === 0;

            // Only mark for update if the DB value differs from calculated
            if (!amountsAreEqual(tx.runningBalance || 0, newBalance, precision) || isSnapshotPoint) {
                idsNeedingUpdate.set(tx.id, newBalance);
            }

            currentBalance = newBalance;

            if (isSnapshotPoint) {
                snapshotsToCreate.push({
                    transactionId: tx.id,
                    transactionDate: tx.transactionDate,
                    absoluteBalance: currentBalance,
                    transactionCount: currentCount
                });
            }
        }

        // 4. Batch updates
        if (idsNeedingUpdate.size > 0 || snapshotsToCreate.length > 0) {
            await database.write(async () => {
                // Fetch ONLY the models that actually need updating
                const idsArray = Array.from(idsNeedingUpdate.keys());
                const BATCH_SIZE = 500;

                for (let i = 0; i < idsArray.length; i += BATCH_SIZE) {
                    const chunkIds = idsArray.slice(i, i + BATCH_SIZE);
                    const modelsToUpdate = await database.collections.get<Transaction>('transactions')
                        .query(Q.where('id', Q.oneOf(chunkIds)))
                        .fetch();

                    const preparedUpdates = modelsToUpdate.map(m =>
                        m.prepareUpdate((record: Transaction) => {
                            record.runningBalance = idsNeedingUpdate.get(m.id) || 0;
                        })
                    );
                    await database.batch(...preparedUpdates);
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

                // Trigger lightweight reactive refreshes for account-centric views
                // without observing the full transactions table.
                if (idsNeedingUpdate.size > 0) {
                    await database.batch(
                        account.prepareUpdate((a) => {
                            a.updatedAt = new Date();
                        })
                    );
                }
            });
        }
    }
}

export const accountingRebuildService = new AccountingRebuildService()
