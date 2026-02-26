import { addColumns, createTable, schemaMigrations, unsafeExecuteSql } from '@nozbe/watermelondb/Schema/migrations'

export const migrations = schemaMigrations({
    migrations: [
        {
            toVersion: 2,
            steps: [
                // Add exchange_rate to transactions for multi-currency support
                addColumns({
                    table: 'transactions',
                    columns: [
                        { name: 'exchange_rate', type: 'number', isOptional: true },
                    ],
                }),
                // New table for storing historical exchange rates
                createTable({
                    name: 'exchange_rates',
                    columns: [
                        { name: 'from_currency', type: 'string', isIndexed: true },
                        { name: 'to_currency', type: 'string', isIndexed: true },
                        { name: 'rate', type: 'number' },
                        { name: 'effective_date', type: 'number', isIndexed: true },
                        { name: 'source', type: 'string' }, // API source
                        { name: 'created_at', type: 'number', isIndexed: true },
                        { name: 'updated_at', type: 'number' },
                    ],
                }),
                // New table for audit trail
                createTable({
                    name: 'audit_logs',
                    columns: [
                        { name: 'entity_type', type: 'string', isIndexed: true },
                        { name: 'entity_id', type: 'string', isIndexed: true },
                        { name: 'action', type: 'string' }, // CREATE, UPDATE, DELETE
                        { name: 'changes', type: 'string' }, // JSON of before/after
                        { name: 'timestamp', type: 'number', isIndexed: true },
                        { name: 'created_at', type: 'number' },
                    ],
                }),
            ],
        },
        {
            toVersion: 3,
            steps: [
                addColumns({
                    table: 'journals',
                    columns: [
                        { name: 'total_amount', type: 'number' },
                        { name: 'transaction_count', type: 'number' },
                    ],
                }),
            ],
        },
        {
            toVersion: 4,
            steps: [
                addColumns({
                    table: 'journals',
                    columns: [
                        { name: 'display_type', type: 'string' },
                    ],
                }),
            ],
        },
        {
            toVersion: 5,
            steps: [
                addColumns({
                    table: 'accounts',
                    columns: [
                        { name: 'order_num', type: 'number', isOptional: true, isIndexed: true },
                    ],
                }),
            ],
        },
        {
            toVersion: 6,
            steps: [
                addColumns({
                    table: 'accounts',
                    columns: [
                        { name: 'icon', type: 'string', isOptional: true },
                    ],
                }),
            ],
        },
        {
            toVersion: 7,
            steps: [
                createTable({
                    name: 'budgets',
                    columns: [
                        { name: 'name', type: 'string' },
                        { name: 'amount', type: 'number' },
                        { name: 'currency_code', type: 'string', isIndexed: true },
                        { name: 'start_month', type: 'string', isIndexed: true },
                        { name: 'active', type: 'boolean' },
                        { name: 'created_at', type: 'number', isIndexed: true },
                        { name: 'updated_at', type: 'number' },
                    ],
                }),
                createTable({
                    name: 'budget_scopes',
                    columns: [
                        { name: 'budget_id', type: 'string', isIndexed: true },
                        { name: 'account_id', type: 'string', isIndexed: true },
                        { name: 'created_at', type: 'number', isIndexed: true },
                        { name: 'updated_at', type: 'number' },
                    ],
                }),
            ],
        },
        {
            toVersion: 8,
            steps: [
                addColumns({
                    table: 'accounts',
                    columns: [
                        { name: 'account_subtype', type: 'string', isOptional: true, isIndexed: true },
                    ],
                }),
                unsafeExecuteSql(`
                  UPDATE accounts
                  SET account_subtype = CASE account_type
                    WHEN 'ASSET' THEN 'CASH'
                    WHEN 'LIABILITY' THEN 'CREDIT_CARD'
                    WHEN 'EQUITY' THEN 'OPENING_BALANCE'
                    WHEN 'INCOME' THEN 'SALARY'
                    WHEN 'EXPENSE' THEN 'FOOD'
                    ELSE 'OTHER'
                  END
                  WHERE account_subtype IS NULL OR account_subtype = '';
                `),
                createTable({
                    name: 'account_metadata',
                    columns: [
                        { name: 'account_id', type: 'string', isIndexed: true },
                        { name: 'statement_day', type: 'number', isOptional: true },
                        { name: 'due_day', type: 'number', isOptional: true },
                        { name: 'minimum_payment_amount', type: 'number', isOptional: true },
                        { name: 'minimum_balance_amount', type: 'number', isOptional: true },
                        { name: 'credit_limit_amount', type: 'number', isOptional: true },
                        { name: 'apr_bps', type: 'number', isOptional: true },
                        { name: 'emi_day', type: 'number', isOptional: true },
                        { name: 'loan_tenure_months', type: 'number', isOptional: true },
                        { name: 'autopay_enabled', type: 'boolean', isOptional: true },
                        { name: 'grace_period_days', type: 'number', isOptional: true },
                        { name: 'notes', type: 'string', isOptional: true },
                        { name: 'created_at', type: 'number', isIndexed: true },
                        { name: 'updated_at', type: 'number' },
                    ],
                }),
            ],
        },
        {
            toVersion: 9,
            steps: [
                addColumns({
                    table: 'journals',
                    columns: [
                        { name: 'planned_payment_id', type: 'string', isOptional: true, isIndexed: true },
                    ],
                }),
                createTable({
                    name: 'planned_payments',
                    columns: [
                        { name: 'name', type: 'string' },
                        { name: 'description', type: 'string', isOptional: true },
                        { name: 'amount', type: 'number' },
                        { name: 'currency_code', type: 'string', isIndexed: true },
                        { name: 'from_account_id', type: 'string', isIndexed: true },
                        { name: 'to_account_id', type: 'string', isOptional: true, isIndexed: true },
                        { name: 'interval_n', type: 'number' },
                        { name: 'interval_type', type: 'string' },
                        { name: 'start_date', type: 'number', isIndexed: true },
                        { name: 'end_date', type: 'number', isOptional: true },
                        { name: 'next_occurrence', type: 'number', isIndexed: true },
                        { name: 'status', type: 'string' },
                        { name: 'is_auto_post', type: 'boolean' },
                        { name: 'recurrence_day', type: 'number', isOptional: true },
                        { name: 'recurrence_month', type: 'number', isOptional: true },
                        { name: 'created_at', type: 'number', isIndexed: true },
                        { name: 'updated_at', type: 'number' },
                        { name: 'deleted_at', type: 'number', isOptional: true, isIndexed: true },
                    ],
                }),
            ],
        },
        {
            toVersion: 10,
            steps: [
                createTable({
                    name: 'balance_snapshots',
                    columns: [
                        { name: 'account_id', type: 'string', isIndexed: true },
                        { name: 'transaction_id', type: 'string', isIndexed: true },
                        { name: 'transaction_date', type: 'number', isIndexed: true },
                        { name: 'absolute_balance', type: 'number' },
                        { name: 'transaction_count', type: 'number' },
                        { name: 'created_at', type: 'number', isIndexed: true },
                        { name: 'updated_at', type: 'number' },
                    ],
                }),
            ],
        },
    ],
})
