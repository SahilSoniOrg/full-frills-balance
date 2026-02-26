import { Model } from '@nozbe/watermelondb'
import { date, field, readonly } from '@nozbe/watermelondb/decorators'

export default class BalanceSnapshot extends Model {
    static table = 'balance_snapshots'

    static associations = {
        accounts: { type: 'belongs_to', key: 'account_id' },
        transactions: { type: 'belongs_to', key: 'transaction_id' },
    } as const

    @field('account_id') accountId!: string
    @field('transaction_id') transactionId!: string
    @field('transaction_date') transactionDate!: number
    @field('absolute_balance') absoluteBalance!: number
    @field('transaction_count') transactionCount!: number

    @readonly @date('created_at') createdAt!: Date
    @readonly @date('updated_at') updatedAt!: Date
}
