import { AppConfig } from '@/src/constants';
import {
  addColumns,
  createTable,
  schemaMigrations,
  unsafeExecuteSql,
} from '@nozbe/watermelondb/Schema/migrations';

const defaultWorkplaceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = (Math.random() * 16) | 0;
  const v = c === 'x' ? r : (r & 0x3) | 0x8;
  return v.toString(16);
});

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        // Add exchange_rate to transactions for multi-currency support
        addColumns({
          table: 'transactions',
          columns: [{ name: 'exchange_rate', type: 'number', isOptional: true }],
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
          columns: [{ name: 'display_type', type: 'string' }],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: 'accounts',
          columns: [{ name: 'order_num', type: 'number', isOptional: true, isIndexed: true }],
        }),
      ],
    },
    {
      toVersion: 6,
      steps: [
        addColumns({
          table: 'accounts',
          columns: [{ name: 'icon', type: 'string', isOptional: true }],
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
          columns: [{ name: 'account_subtype', type: 'string', isOptional: true, isIndexed: true }],
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
    {
      toVersion: 11,
      steps: [
        createTable({
          name: 'journal_metadata',
          columns: [
            { name: 'journal_id', type: 'string', isIndexed: true },
            { name: 'import_source', type: 'string' },
            { name: 'original_sms_id', type: 'string', isOptional: true },
            { name: 'original_sms_sender', type: 'string', isOptional: true },
            { name: 'original_sms_body', type: 'string', isOptional: true },
            { name: 'metadata_json', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 12,
      steps: [
        createTable({
          name: 'sms_auto_post_rules',
          columns: [
            { name: 'sender_match', type: 'string', isIndexed: true },
            { name: 'body_match', type: 'string', isOptional: true },
            { name: 'source_account_id', type: 'string', isIndexed: true },
            { name: 'category_account_id', type: 'string', isIndexed: true },
            { name: 'is_active', type: 'boolean' },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 13,
      steps: [
        createTable({
          name: 'sms_inbox_records',
          columns: [
            { name: 'device_sms_id', type: 'string', isIndexed: true },
            { name: 'sender_address', type: 'string', isIndexed: true },
            { name: 'raw_body', type: 'string' },
            { name: 'sms_date', type: 'number', isIndexed: true },
            { name: 'sms_fingerprint', type: 'string', isIndexed: true },
            { name: 'parse_status', type: 'string', isIndexed: true },
            { name: 'parsed_amount', type: 'number', isOptional: true },
            { name: 'parsed_currency_code', type: 'string', isOptional: true },
            { name: 'parsed_merchant', type: 'string', isOptional: true },
            { name: 'parsed_account_source', type: 'string', isOptional: true },
            { name: 'reference_number', type: 'string', isOptional: true },
            { name: 'direction', type: 'string', isIndexed: true },
            { name: 'processing_status', type: 'string', isIndexed: true },
            { name: 'linked_journal_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'duplicate_journal_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'duplicate_confidence', type: 'number', isOptional: true },
            { name: 'parse_confidence', type: 'number', isOptional: true },
            { name: 'parse_reason', type: 'string', isOptional: true },
            { name: 'metadata_json', type: 'string', isOptional: true },
            { name: 'first_seen_at', type: 'number', isIndexed: true },
            { name: 'last_scanned_at', type: 'number', isIndexed: true },
            { name: 'processed_at', type: 'number', isOptional: true, isIndexed: true },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'sms_auto_post_rules',
          columns: [
            { name: 'conditions_json', type: 'string', isOptional: true },
            { name: 'actions_json', type: 'string', isOptional: true },
            { name: 'priority', type: 'number', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },
    {
      toVersion: 14,
      steps: [
        addColumns({
          table: 'accounts',
          columns: [{ name: 'reconciled_at', type: 'number', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 15,
      steps: [
        addColumns({
          table: 'account_metadata',
          columns: [{ name: 'pay_from_account_id', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 16,
      steps: [
        addColumns({
          table: 'budgets',
          columns: [{ name: 'asset_account_ids', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 17,
      steps: [
        addColumns({
          table: 'account_metadata',
          columns: [
            { name: 'min_payment_only', type: 'boolean', isOptional: true },
            { name: 'minimum_payment_percent', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 18,
      steps: [
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_transactions_chronological 
          ON transactions (account_id, transaction_date, created_at, id) 
          WHERE deleted_at IS NULL;
        `),
      ],
    },
    {
      toVersion: 19,
      steps: [
        unsafeExecuteSql(`DROP INDEX IF EXISTS idx_transactions_chronological;`),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_transactions_high_perf 
          ON transactions (account_id, transaction_date DESC, created_at DESC, id DESC) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_journals_status_active 
          ON journals (status, deleted_at) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup 
          ON exchange_rates (from_currency, to_currency, effective_date DESC);
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_audit_logs_history 
          ON audit_logs (entity_type, entity_id, timestamp DESC);
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_planned_payments_active 
          ON planned_payments (status, deleted_at, next_occurrence ASC) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_journals_main_ledger 
          ON journals (status, deleted_at, journal_date DESC) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_transactions_amount 
          ON transactions (amount) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_balance_snapshots_chronological 
          ON balance_snapshots (account_id, transaction_date DESC, created_at DESC, id DESC);
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_budgets_active_sorted 
          ON budgets (active, start_month DESC);
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_sms_inbox_chronological 
          ON sms_inbox_records (sms_date DESC);
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_accounts_ordered 
          ON accounts (deleted_at, order_num ASC) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_transactions_global_chronological 
          ON transactions (transaction_date DESC, created_at DESC, id DESC) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_journals_dedup 
          ON journals (total_amount, journal_date) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_transactions_by_journal 
          ON transactions (journal_id, transaction_date, created_at) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_sms_inbox_pending 
          ON sms_inbox_records (processing_status, sms_date DESC);
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_planned_payments_upcoming 
          ON planned_payments (deleted_at, next_occurrence ASC) 
          WHERE deleted_at IS NULL;
        `),
      ],
    },
    {
      toVersion: 20,
      steps: [
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_transactions_high_perf 
          ON transactions (account_id, transaction_date DESC, created_at DESC, id DESC) 
          WHERE deleted_at IS NULL;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_balance_snapshots_chronological 
          ON balance_snapshots (account_id, transaction_date DESC, created_at DESC, id DESC);
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_journals_main_ledger 
          ON journals (status, deleted_at, journal_date DESC) 
          WHERE deleted_at IS NULL;
        `),
      ],
    },
    {
      toVersion: 21,
      steps: [
        addColumns({
          table: 'budgets',
          columns: [
            { name: 'interval_type', type: 'string' },
            { name: 'interval_n', type: 'number' },
            { name: 'start_date', type: 'number', isOptional: true },
            { name: 'recurrence_day', type: 'number', isOptional: true },
            { name: 'recurrence_month', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 22,
      steps: [
        addColumns({
          table: 'journals',
          columns: [{ name: 'notes', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 23,
      steps: [
        createTable({
          name: 'workplaces',
          columns: [
            { name: 'name', type: 'string' },
            { name: 'icon', type: 'string', isOptional: true },
            { name: 'default_currency_code', type: 'string', isOptional: false },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'accounts',
          columns: [{ name: 'workplace_id', type: 'string', isIndexed: true }],
        }),
        addColumns({
          table: 'balance_snapshots',
          columns: [{ name: 'workplace_id', type: 'string', isIndexed: true }],
        }),
        addColumns({
          table: 'journals',
          columns: [{ name: 'workplace_id', type: 'string', isIndexed: true }],
        }),
        addColumns({
          table: 'transactions',
          columns: [{ name: 'workplace_id', type: 'string', isIndexed: true }],
        }),
        addColumns({
          table: 'audit_logs',
          columns: [{ name: 'workplace_id', type: 'string', isIndexed: true }],
        }),
        addColumns({
          table: 'budgets',
          columns: [{ name: 'workplace_id', type: 'string', isIndexed: true }],
        }),
        addColumns({
          table: 'budget_scopes',
          columns: [{ name: 'workplace_id', type: 'string', isIndexed: true }],
        }),
        addColumns({
          table: 'account_metadata',
          columns: [{ name: 'workplace_id', type: 'string', isIndexed: true }],
        }),
        addColumns({
          table: 'planned_payments',
          columns: [{ name: 'workplace_id', type: 'string', isIndexed: true }],
        }),
        addColumns({
          table: 'journal_metadata',
          columns: [{ name: 'workplace_id', type: 'string', isIndexed: true }],
        }),
        addColumns({
          table: 'sms_auto_post_rules',
          columns: [{ name: 'workplace_id', type: 'string', isIndexed: true }],
        }),
        addColumns({
          table: 'sms_inbox_records',
          columns: [{ name: 'workplace_id', type: 'string', isIndexed: true }],
        }),
        unsafeExecuteSql(`
          INSERT INTO workplaces (id, name, icon, default_currency_code, created_at, updated_at)
          SELECT '${defaultWorkplaceId}', 'Personal workplace', 'briefcase', '${AppConfig.defaultCurrency}', ${Date.now()}, ${Date.now()}
          WHERE (SELECT COUNT(*) FROM workplaces) = 0;
        `),
        unsafeExecuteSql(`UPDATE accounts SET workplace_id = (SELECT id FROM workplaces LIMIT 1);`),
        unsafeExecuteSql(
          `UPDATE balance_snapshots SET workplace_id = (SELECT id FROM workplaces LIMIT 1);`,
        ),
        unsafeExecuteSql(`UPDATE journals SET workplace_id = (SELECT id FROM workplaces LIMIT 1);`),
        unsafeExecuteSql(
          `UPDATE transactions SET workplace_id = (SELECT id FROM workplaces LIMIT 1);`,
        ),
        unsafeExecuteSql(
          `UPDATE audit_logs SET workplace_id = (SELECT id FROM workplaces LIMIT 1);`,
        ),
        unsafeExecuteSql(`UPDATE budgets SET workplace_id = (SELECT id FROM workplaces LIMIT 1);`),
        unsafeExecuteSql(
          `UPDATE budget_scopes SET workplace_id = (SELECT id FROM workplaces LIMIT 1);`,
        ),
        unsafeExecuteSql(
          `UPDATE account_metadata SET workplace_id = (SELECT id FROM workplaces LIMIT 1);`,
        ),
        unsafeExecuteSql(
          `UPDATE planned_payments SET workplace_id = (SELECT id FROM workplaces LIMIT 1);`,
        ),
        unsafeExecuteSql(
          `UPDATE journal_metadata SET workplace_id = (SELECT id FROM workplaces LIMIT 1);`,
        ),
        unsafeExecuteSql(
          `UPDATE sms_auto_post_rules SET workplace_id = (SELECT id FROM workplaces LIMIT 1);`,
        ),
        unsafeExecuteSql(
          `UPDATE sms_inbox_records SET workplace_id = (SELECT id FROM workplaces LIMIT 1);`,
        ),
        unsafeExecuteSql(`
          CREATE TRIGGER IF NOT EXISTS trg_accounts_workplace_id_check
          BEFORE INSERT ON accounts FOR EACH ROW WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = '' BEGIN SELECT RAISE(ABORT, 'Workplace ID cannot be empty on accounts'); END;
        `),
        unsafeExecuteSql(`
          CREATE TRIGGER IF NOT EXISTS trg_balance_snapshots_workplace_id_check
          BEFORE INSERT ON balance_snapshots FOR EACH ROW WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = '' BEGIN SELECT RAISE(ABORT, 'Workplace ID cannot be empty on balance_snapshots'); END;
        `),
        unsafeExecuteSql(`
          CREATE TRIGGER IF NOT EXISTS trg_journals_workplace_id_check
          BEFORE INSERT ON journals FOR EACH ROW WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = '' BEGIN SELECT RAISE(ABORT, 'Workplace ID cannot be empty on journals'); END;
        `),
        unsafeExecuteSql(`
          CREATE TRIGGER IF NOT EXISTS trg_transactions_workplace_id_check
          BEFORE INSERT ON transactions FOR EACH ROW WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = '' BEGIN SELECT RAISE(ABORT, 'Workplace ID cannot be empty on transactions'); END;
        `),
        unsafeExecuteSql(`
          CREATE TRIGGER IF NOT EXISTS trg_audit_logs_workplace_id_check
          BEFORE INSERT ON audit_logs FOR EACH ROW WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = '' BEGIN SELECT RAISE(ABORT, 'Workplace ID cannot be empty on audit_logs'); END;
        `),
        unsafeExecuteSql(`
          CREATE TRIGGER IF NOT EXISTS trg_budgets_workplace_id_check
          BEFORE INSERT ON budgets FOR EACH ROW WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = '' BEGIN SELECT RAISE(ABORT, 'Workplace ID cannot be empty on budgets'); END;
        `),
        unsafeExecuteSql(`
          CREATE TRIGGER IF NOT EXISTS trg_budget_scopes_workplace_id_check
          BEFORE INSERT ON budget_scopes FOR EACH ROW WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = '' BEGIN SELECT RAISE(ABORT, 'Workplace ID cannot be empty on budget_scopes'); END;
        `),
        unsafeExecuteSql(`
          CREATE TRIGGER IF NOT EXISTS trg_account_metadata_workplace_id_check
          BEFORE INSERT ON account_metadata FOR EACH ROW WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = '' BEGIN SELECT RAISE(ABORT, 'Workplace ID cannot be empty on account_metadata'); END;
        `),
        unsafeExecuteSql(`
          CREATE TRIGGER IF NOT EXISTS trg_planned_payments_workplace_id_check
          BEFORE INSERT ON planned_payments FOR EACH ROW WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = '' BEGIN SELECT RAISE(ABORT, 'Workplace ID cannot be empty on planned_payments'); END;
        `),
        unsafeExecuteSql(`
          CREATE TRIGGER IF NOT EXISTS trg_journal_metadata_workplace_id_check
          BEFORE INSERT ON journal_metadata FOR EACH ROW WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = '' BEGIN SELECT RAISE(ABORT, 'Workplace ID cannot be empty on journal_metadata'); END;
        `),
        unsafeExecuteSql(`
          CREATE TRIGGER IF NOT EXISTS trg_sms_auto_post_rules_workplace_id_check
          BEFORE INSERT ON sms_auto_post_rules FOR EACH ROW WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = '' BEGIN SELECT RAISE(ABORT, 'Workplace ID cannot be empty on sms_auto_post_rules'); END;
        `),
        unsafeExecuteSql(`
          CREATE TRIGGER IF NOT EXISTS trg_sms_inbox_records_workplace_id_check
          BEFORE INSERT ON sms_inbox_records FOR EACH ROW WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = '' BEGIN SELECT RAISE(ABORT, 'Workplace ID cannot be empty on sms_inbox_records'); END;
        `),
      ],
    },
    {
      toVersion: 24,
      steps: [
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_journals_description 
          ON journals (description) 
          WHERE deleted_at IS NULL AND description IS NOT NULL;
        `),
      ],
    },
    {
      toVersion: 25,
      steps: [
        unsafeExecuteSql(`
      CREATE INDEX IF NOT EXISTS idx_transactions_workplace_account_chrono
      ON transactions (
        workplace_id,
        account_id,
        transaction_date DESC,
        created_at DESC,
        id DESC
      )
      WHERE deleted_at IS NULL;
    `),

        unsafeExecuteSql(`
      CREATE INDEX IF NOT EXISTS idx_transactions_workplace_journal
      ON transactions (
        workplace_id,
        journal_id,
        transaction_date DESC
      )
      WHERE deleted_at IS NULL;
    `),

        unsafeExecuteSql(`
      CREATE INDEX IF NOT EXISTS idx_journals_workplace_status_chrono
      ON journals (
        workplace_id,
        status,
        journal_date DESC,
        created_at DESC,
        id DESC
      )
      WHERE deleted_at IS NULL;
    `),

        unsafeExecuteSql(`
      CREATE INDEX IF NOT EXISTS idx_balance_snapshots_workplace_account
      ON balance_snapshots (
        workplace_id,
        account_id,
        transaction_date DESC
      );
    `),

        unsafeExecuteSql(`
      CREATE INDEX IF NOT EXISTS idx_sms_inbox_workplace_processing
      ON sms_inbox_records (
        workplace_id,
        processing_status,
        sms_date DESC
      );
    `),

        unsafeExecuteSql(`
      CREATE INDEX IF NOT EXISTS idx_planned_payments_workplace_next
      ON planned_payments (
        workplace_id,
        status,
        next_occurrence ASC
      )
      WHERE deleted_at IS NULL;
    `),
      ],
    },
    {
      toVersion: 26,
      steps: [
        unsafeExecuteSql(`
      CREATE TRIGGER IF NOT EXISTS trg_transactions_journal_workplace_match
      BEFORE INSERT ON transactions
      FOR EACH ROW
      WHEN (
        SELECT workplace_id
        FROM journals
        WHERE id = NEW.journal_id
      ) != NEW.workplace_id
      BEGIN
        SELECT RAISE(ABORT, 'Transaction workplace mismatch with journal');
      END;
    `),

        unsafeExecuteSql(`
      CREATE TRIGGER IF NOT EXISTS trg_transactions_account_workplace_match
      BEFORE INSERT ON transactions
      FOR EACH ROW
      WHEN (
        SELECT workplace_id
        FROM accounts
        WHERE id = NEW.account_id
      ) != NEW.workplace_id
      BEGIN
        SELECT RAISE(ABORT, 'Transaction workplace mismatch with account');
      END;
    `),

        unsafeExecuteSql(`
      CREATE TRIGGER IF NOT EXISTS trg_budget_scopes_budget_workplace_match
      BEFORE INSERT ON budget_scopes
      FOR EACH ROW
      WHEN (
        SELECT workplace_id
        FROM budgets
        WHERE id = NEW.budget_id
      ) != NEW.workplace_id
      BEGIN
        SELECT RAISE(ABORT, 'Budget scope workplace mismatch');
      END;
    `),

        unsafeExecuteSql(`
      CREATE TRIGGER IF NOT EXISTS trg_budget_scopes_account_workplace_match
      BEFORE INSERT ON budget_scopes
      FOR EACH ROW
      WHEN (
        SELECT workplace_id
        FROM accounts
        WHERE id = NEW.account_id
      ) != NEW.workplace_id
      BEGIN
        SELECT RAISE(ABORT, 'Budget scope account workplace mismatch');
      END;
    `),

        unsafeExecuteSql(`
      CREATE TRIGGER IF NOT EXISTS trg_planned_payments_from_account_match
      BEFORE INSERT ON planned_payments
      FOR EACH ROW
      WHEN (
        SELECT workplace_id
        FROM accounts
        WHERE id = NEW.from_account_id
      ) != NEW.workplace_id
      BEGIN
        SELECT RAISE(ABORT, 'Planned payment source account workplace mismatch');
      END;
    `),
      ],
    },
    {
      toVersion: 27,
      steps: [
        unsafeExecuteSql(
          'CREATE INDEX IF NOT EXISTS idx_transactions_active_wp_date ON transactions (workplace_id, deleted_at, transaction_date);',
        ),
        unsafeExecuteSql(
          'CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions (account_id, deleted_at, transaction_date);',
        ),
        unsafeExecuteSql(
          'CREATE INDEX IF NOT EXISTS idx_journals_active_wp_status ON journals (workplace_id, deleted_at, status);',
        ),
      ],
    },
    {
      toVersion: 28,
      steps: [
        createTable({
          name: 'transaction_auto_post_rules',
          columns: [
            { name: 'channels_json', type: 'string', isOptional: true },
            { name: 'sender_match', type: 'string', isOptional: true, isIndexed: true },
            { name: 'body_match', type: 'string', isOptional: true },
            { name: 'conditions_json', type: 'string', isOptional: true },
            { name: 'actions_json', type: 'string', isOptional: true },
            { name: 'priority', type: 'number', isOptional: true, isIndexed: true },
            { name: 'source_account_id', type: 'string', isIndexed: true },
            { name: 'category_account_id', type: 'string', isIndexed: true },
            { name: 'is_active', type: 'boolean' },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
            { name: 'workplace_id', type: 'string', isIndexed: true },
          ],
        }),
        createTable({
          name: 'transaction_inbox_records',
          columns: [
            { name: 'channel', type: 'string', isIndexed: true },
            { name: 'device_source_id', type: 'string', isIndexed: true },
            { name: 'sender_address', type: 'string', isOptional: true, isIndexed: true },
            { name: 'raw_body', type: 'string', isOptional: true },
            { name: 'input_date', type: 'number', isIndexed: true },
            { name: 'input_fingerprint', type: 'string', isIndexed: true },
            { name: 'parse_status', type: 'string', isIndexed: true },
            { name: 'parsed_amount', type: 'number', isOptional: true },
            { name: 'parsed_currency_code', type: 'string', isOptional: true },
            { name: 'parsed_merchant', type: 'string', isOptional: true },
            { name: 'parsed_account_source', type: 'string', isOptional: true },
            { name: 'reference_number', type: 'string', isOptional: true },
            { name: 'direction', type: 'string', isIndexed: true },
            { name: 'processing_status', type: 'string', isIndexed: true },
            { name: 'linked_journal_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'duplicate_journal_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'duplicate_confidence', type: 'number', isOptional: true },
            { name: 'parse_confidence', type: 'number', isOptional: true },
            { name: 'parse_reason', type: 'string', isOptional: true },
            { name: 'metadata_json', type: 'string', isOptional: true },
            { name: 'first_seen_at', type: 'number', isIndexed: true },
            { name: 'last_scanned_at', type: 'number', isIndexed: true },
            { name: 'processed_at', type: 'number', isOptional: true, isIndexed: true },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
            { name: 'workplace_id', type: 'string', isIndexed: true },
          ],
        }),
        unsafeExecuteSql(`
          CREATE TRIGGER IF NOT EXISTS trg_transaction_auto_post_rules_workplace_id_check
          BEFORE INSERT ON transaction_auto_post_rules
          FOR EACH ROW
          WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
          BEGIN
            SELECT RAISE(ABORT, 'Workplace ID cannot be empty on transaction_auto_post_rules');
          END;
        `),
        unsafeExecuteSql(`
          CREATE TRIGGER IF NOT EXISTS trg_transaction_inbox_records_workplace_id_check
          BEFORE INSERT ON transaction_inbox_records
          FOR EACH ROW
          WHEN NEW.workplace_id IS NULL OR NEW.workplace_id = ''
          BEGIN
            SELECT RAISE(ABORT, 'Workplace ID cannot be empty on transaction_inbox_records');
          END;
        `),
        unsafeExecuteSql(`
          CREATE INDEX IF NOT EXISTS idx_transaction_inbox_records_workplace_processing
          ON transaction_inbox_records (
            workplace_id,
            processing_status,
            input_date DESC
          );
        `),
        unsafeExecuteSql(`
          INSERT INTO transaction_auto_post_rules (
            id, sender_match, body_match, conditions_json, actions_json, priority, 
            source_account_id, category_account_id, is_active, created_at, updated_at, workplace_id, channels_json
          )
          SELECT 
            id, sender_match, body_match, conditions_json, actions_json, priority, 
            source_account_id, category_account_id, is_active, created_at, updated_at, workplace_id, '["sms"]'
          FROM sms_auto_post_rules;
        `),
        unsafeExecuteSql(`
          INSERT INTO transaction_inbox_records (
            id, channel, device_source_id, sender_address, raw_body, input_date, input_fingerprint,
            parse_status, parsed_amount, parsed_currency_code, parsed_merchant, parsed_account_source,
            reference_number, direction, processing_status, linked_journal_id, duplicate_journal_id,
            duplicate_confidence, parse_confidence, parse_reason, metadata_json, first_seen_at,
            last_scanned_at, processed_at, created_at, updated_at, workplace_id
          )
          SELECT 
            id, 'sms', device_sms_id, sender_address, raw_body, sms_date, sms_fingerprint,
            parse_status, parsed_amount, parsed_currency_code, parsed_merchant, parsed_account_source,
            reference_number, direction, processing_status, linked_journal_id, duplicate_journal_id,
            duplicate_confidence, parse_confidence, parse_reason, metadata_json, first_seen_at,
            last_scanned_at, processed_at, created_at, updated_at, workplace_id
          FROM sms_inbox_records;
        `),
        unsafeExecuteSql('DROP TABLE IF EXISTS sms_auto_post_rules;'),
        unsafeExecuteSql('DROP TABLE IF EXISTS sms_inbox_records;'),
      ],
    },
    {
      toVersion: 29,
      steps: [
        createTable({
          name: 'financial_pets',
          columns: [
            { name: 'workplace_id', type: 'string', isIndexed: true },
            { name: 'xp', type: 'number' },
            { name: 'level', type: 'number' },
            { name: 'last_fed_at', type: 'number', isOptional: true },
            { name: 'last_action_date', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
  ],
});
