import { cryptoProvider } from '@/src/services/backup/cryptoProvider';
import { keyHex } from '@/src/services/backup/keyEncoding';
import type { KeyAccessIdentity } from '@/src/services/backup/keyHierarchyRecords';
import type { RowSourceRecord } from './rowRecords';
import type { RowTable } from './rowTables';
import { validateWorkplaceRows } from './workplaceRowValidation';
import { asWorkplaceId, type WorkplaceId } from '@/src/types/ids';
import {
  remapNativeAuditLog,
  type AuditImportEntityIdMaps,
} from '@/src/services/import/plugins/nativeImportAuditRemap';
import type { CanonicalAuditLog } from '@/src/types/importContracts';
import { syncRuleActionsFromColumns } from '@/src/utils/sms/ruleActionsAccountIds';
import { asAccountId } from '@/src/types/ids';

async function digest(parts: readonly string[]): Promise<string> {
  return keyHex(await cryptoProvider.digest(new TextEncoder().encode(JSON.stringify(parts))));
}

/** One source archive produces at most one recovered copy per destination User.
 * Domain-separated identities make retries stable without persisting decrypted data.
 * These are new local identities, never source identities or source key material.
 */
export async function workplaceRecoveryDestination(
  manifestHash: string,
  identity: KeyAccessIdentity,
) {
  const receipt = await digest([
    'ffb-workplace-recovery-copy-v1',
    identity.userId,
    identity.userKeyFingerprint,
    manifestHash,
  ]);
  return { receipt, workplaceId: asWorkplaceId(`recovered_${receipt}`) };
}

const references: Partial<Record<RowTable, Readonly<Record<string, RowTable>>>> = {
  accounts: { parentAccountId: 'accounts' },
  journals: {
    originalJournalId: 'journals',
    reversingJournalId: 'journals',
    plannedPaymentId: 'planned_payments',
  },
  transactions: { accountId: 'accounts', journalId: 'journals' },
  budget_scopes: { budgetId: 'budgets', accountId: 'accounts' },
  account_metadata: { accountId: 'accounts', payFromAccountId: 'accounts' },
  planned_payments: { fromAccountId: 'accounts', toAccountId: 'accounts' },
  journal_metadata: { journalId: 'journals' },
  transaction_auto_post_rules: { sourceAccountId: 'accounts', categoryAccountId: 'accounts' },
  transaction_inbox_records: { linkedJournalId: 'journals', duplicateJournalId: 'journals' },
};

export async function copyRecoveredWorkplaceRows(
  rows: readonly RowSourceRecord[],
  sourceId: WorkplaceId,
  destination: { workplaceId: WorkplaceId; receipt: string },
): Promise<readonly RowSourceRecord[]> {
  validateWorkplaceRows(rows, sourceId);
  const maps = new Map<RowTable, Map<string, string>>();
  for (const row of rows) {
    const ids = maps.get(row.table) ?? new Map<string, string>();
    ids.set(
      row.rowId,
      row.table === 'workplace'
        ? destination.workplaceId
        : `recovered_${await digest(['ffb-workplace-recovery-row-v1', destination.receipt, row.table, row.rowId])}`,
    );
    maps.set(row.table, ids);
  }
  const mapped = (table: RowTable, id: unknown): string => {
    if (typeof id !== 'string') throw new Error('Invalid recovered reference');
    const value = maps.get(table)?.get(id);
    if (!value) throw new Error(`Recovered ${table} reference is missing`);
    return value;
  };
  const entityMaps: AuditImportEntityIdMaps = {
    account: maps.get('accounts') ?? new Map(),
    journal: maps.get('journals') ?? new Map(),
    transaction: maps.get('transactions') ?? new Map(),
    budget: maps.get('budgets') ?? new Map(),
    planned_payment: maps.get('planned_payments') ?? new Map(),
    transaction_auto_post_rule: maps.get('transaction_auto_post_rules') ?? new Map(),
    transaction_inbox_record: maps.get('transaction_inbox_records') ?? new Map(),
    workplace: maps.get('workplace')!,
    exchange_rate: new Map(),
  };
  const copied = rows.map(row => {
    let content = { ...row.content };
    for (const [field, table] of Object.entries(references[row.table] ?? {})) {
      if (content[field]) content[field] = mapped(table, content[field]);
    }
    if (row.table === 'workplace') content.name = `${content.name} (recovered)`;
    if (row.table === 'budgets' && typeof content.assetAccountIds === 'string')
      content.assetAccountIds = content.assetAccountIds
        .split(',')
        .filter(id => id.trim())
        .map(id => mapped('accounts', id.trim()))
        .join(',');
    if (row.table === 'transaction_auto_post_rules') {
      content.actionsJson = syncRuleActionsFromColumns(content.actionsJson as string | undefined, {
        sourceAccountId: asAccountId(String(content.sourceAccountId)),
        categoryAccountId: asAccountId(String(content.categoryAccountId)),
      });
    }
    if (row.table === 'audit_logs') {
      const log = remapNativeAuditLog(
        { id: row.rowId, ...content } as unknown as CanonicalAuditLog,
        {
          entities: entityMaps,
          auditLogs: maps.get('audit_logs') ?? new Map(),
        },
      );
      const { id: _id, ...fields } = log;
      content = fields;
    }
    // originalSmsId/deviceSourceId identify source evidence, not local ledger records.
    return { ...row, rowId: mapped(row.table, row.rowId), content };
  });
  return validateWorkplaceRows(copied, destination.workplaceId);
}
