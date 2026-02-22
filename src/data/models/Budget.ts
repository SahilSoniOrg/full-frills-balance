import BudgetScope from '@/src/data/models/BudgetScope'
import { Model, Query } from '@nozbe/watermelondb'
import { children, date, field } from '@nozbe/watermelondb/decorators'

export default class Budget extends Model {
    static table = 'budgets'
    static associations = {
        budget_scopes: { type: 'has_many', foreignKey: 'budget_id' },
    } as const

    @field('name') name!: string
    @field('amount') amount!: number
    @field('currency_code') currencyCode!: string
    @field('start_month') startMonth!: string
    @field('active') active!: boolean

    @date('created_at') createdAt!: Date
    @date('updated_at') updatedAt!: Date

    // Relations with proper types
    @children('budget_scopes') scopes!: Query<BudgetScope>
}
