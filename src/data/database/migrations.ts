import { addColumns, createTable, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations'

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
    ],
})
