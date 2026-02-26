import { database } from '@/src/data/database/Database'
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot'
import { Q } from '@nozbe/watermelondb'

export class BalanceSnapshotRepository {
    private get snapshots() {
        return database.collections.get<BalanceSnapshot>('balance_snapshots')
    }

    /**
     * Finds the latest snapshot for an account as of a given date.
     */
    async findLatestForAccount(
        accountId: string,
        date: number = Date.now()
    ): Promise<BalanceSnapshot | null> {
        const snapshots = await this.snapshots
            .query(
                Q.where('account_id', accountId),
                Q.where('transaction_date', Q.lte(date)),
                Q.sortBy('transaction_date', Q.desc),
                Q.take(1)
            )
            .fetch()
        return snapshots[0] || null
    }

    /**
     * Creates a new balance snapshot.
     */
    async create(data: {
        accountId: string
        transactionId: string
        transactionDate: number
        absoluteBalance: number
        transactionCount: number
    }): Promise<BalanceSnapshot> {
        return database.write(async () => {
            return this.snapshots.create((snapshot) => {
                snapshot.accountId = data.accountId
                snapshot.transactionId = data.transactionId
                snapshot.transactionDate = data.transactionDate
                snapshot.absoluteBalance = data.absoluteBalance
                snapshot.transactionCount = data.transactionCount
            })
        })
    }

    /**
     * Deletes all snapshots for an account after a certain date.
     * Useful when segments are invalidated.
     */
    async deleteAfterDate(accountId: string, date: number): Promise<void> {
        const snapshotsToDelete = await this.snapshots
            .query(
                Q.where('account_id', accountId),
                Q.where('transaction_date', Q.gt(date))
            )
            .fetch()

        if (snapshotsToDelete.length > 0) {
            await database.write(async () => {
                await database.batch(
                    ...snapshotsToDelete.map((s) => s.prepareDestroyPermanently())
                )
            })
        }
    }
}

export const balanceSnapshotRepository = new BalanceSnapshotRepository()
