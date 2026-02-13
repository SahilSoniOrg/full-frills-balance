import { database } from '@/src/data/database/Database'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { accountingService } from '@/src/utils/accountingService'
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus'
import { logger } from '@/src/utils/logger'
import { Q } from '@nozbe/watermelondb'

export class AccountingRebuildService {
    /**
     * Rebuilds running balances for an account
     * Uses journalDate for ordering to maintain accounting correctness
     * @param accountId The account ID to rebuild balances for
     * @param fromDate Optional timestamp to start rebuilding from. If provided, will find the balance just before this date.
     */
    async rebuildAccountBalances(
        accountId: string,
        fromDate?: number
    ): Promise<void> {
        logger.debug(`[AccountingRebuildService] Rebuilding balances for account ${accountId} from ${fromDate || 'start'}`)

        const account = await accountRepository.find(accountId)
        if (!account) throw new Error(`Account ${accountId} not found during running balance rebuild`)



        const precision = await currencyRepository.getPrecision(account.currencyCode)

        let runningBalance = 0
        let query = transactionRepository.transactionsQuery(
            Q.experimentalJoinTables(['journals']),
            Q.where('account_id', accountId),
            Q.where('deleted_at', Q.eq(null)),
            Q.on('journals', [
                Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
                Q.where('deleted_at', Q.eq(null))
            ])
        )

        if (fromDate) {
            // Find the LATEST transaction BEFORE this date to get starting point
            const previousTx = await transactionRepository.transactionsQuery(
                Q.experimentalJoinTables(['journals']),
                Q.where('account_id', accountId),
                Q.where('deleted_at', Q.eq(null)),
                Q.on('journals', [
                    Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
                    Q.where('deleted_at', Q.eq(null))
                ]),
                Q.where('transaction_date', Q.lt(fromDate))
            )
                .extend(Q.sortBy('transaction_date', 'desc'))
                .extend(Q.sortBy('created_at', 'desc'))
                .extend(Q.take(1))
                .fetch()

            if (previousTx.length > 0) {
                runningBalance = previousTx[0].runningBalance || 0
                query = query.extend(Q.where('transaction_date', Q.gte(fromDate)))
            }
        }

        const transactions = await query
            .extend(Q.sortBy('transaction_date', 'asc'))
            .extend(Q.sortBy('created_at', 'asc'))
            .fetch()

        await database.write(async () => {
            for (const tx of transactions) {

                runningBalance = accountingService.calculateNewBalance(
                    runningBalance,
                    tx.amount,
                    account.accountType,
                    tx.transactionType,
                    precision
                )

                if (tx.runningBalance !== runningBalance) {
                    await tx.update((txToUpdate) => {
                        txToUpdate.runningBalance = runningBalance
                    })
                }
            }
        })
    }
}

export const accountingRebuildService = new AccountingRebuildService()
