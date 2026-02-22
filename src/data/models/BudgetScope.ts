import Account from '@/src/data/models/Account'
import Budget from '@/src/data/models/Budget'
import { Model, Relation } from '@nozbe/watermelondb'
import { date, relation } from '@nozbe/watermelondb/decorators'

export default class BudgetScope extends Model {
    static table = 'budget_scopes'
    static associations = {
        budgets: { type: 'belongs_to', key: 'budget_id' },
        accounts: { type: 'belongs_to', key: 'account_id' },
    } as const

    @date('created_at') createdAt!: Date
    @date('updated_at') updatedAt!: Date

    @relation('budgets', 'budget_id') budget!: Relation<Budget>
    @relation('accounts', 'account_id') account!: Relation<Account>
}
