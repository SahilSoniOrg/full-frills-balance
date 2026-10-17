/** Complete live Workplace validation shared by capture and restore. Never repairs input. */
import { validateImportedData } from '@/src/services/import/validateImportedData';
import type { RowSourceRecord, PhysicalRowTable } from './rowRecords';
import type { BatchImportData } from '@/src/types/importContracts';
import type { WorkplaceId } from '@/src/types/ids';
import {
  AccountType,
  AuditAction,
  AUDIT_ENTITY_TYPES,
  InboxParseStatus,
  InboxProcessingStatus,
  JournalDisplayType,
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  TransactionDirection,
  TransactionType,
} from '@/src/types/enums';
import { ROW_TABLES, type RowTable } from './rowTables';
import { sanitizeSmsAuditChanges, sanitizeSmsMetadataJson } from '@/src/utils/smsPrivateMetadata';
import { assertAllowedKeys, parseObject } from '@/src/utils/strictObject';
import { encodeUtf8 } from '@/src/services/crypto/protocol/tlv';

export function validId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    encodeUtf8(value, 'rowId', true);
    return true;
  } catch {
    return false;
  }
}
const enumValues: Partial<
  Record<PhysicalRowTable, Record<string, Readonly<Record<string, string>>>>
> = {
  accounts: { accountType: AccountType },
  journals: { status: JournalStatus, displayType: JournalDisplayType },
  transactions: { transactionType: TransactionType },
  planned_payments: { status: PlannedPaymentStatus, intervalType: PlannedPaymentInterval },
  transaction_inbox_records: {
    parseStatus: InboxParseStatus,
    processingStatus: InboxProcessingStatus,
    direction: TransactionDirection,
  },
} as const;

export function validateEnum(table: PhysicalRowTable, content: Record<string, unknown>): void {
  const checks = enumValues[table] as Record<string, Record<string, string>> | undefined;
  for (const [field, values] of Object.entries(checks ?? {})) {
    if (!Object.values(values).includes(content[field] as string)) {
      throw new Error(`Invalid row ${table}.${field}`);
    }
  }
  if (
    table === 'planned_payments' &&
    content.fxMode !== undefined &&
    !['automatic', 'fixed', 'manual'].includes(String(content.fxMode))
  ) {
    throw new Error('Invalid row planned_payments.fxMode');
  }
  if (table === 'audit_logs') {
    if (!Object.values(AuditAction).includes(content.action as AuditAction))
      throw new Error('Invalid row audit_logs.action');
    if (!AUDIT_ENTITY_TYPES.some(entity => entity === content.entityType))
      throw new Error('Invalid row audit_logs.entityType');
    if (
      typeof content.changes !== 'string' ||
      sanitizeSmsAuditChanges(content.changes) !== content.changes
    ) {
      throw new Error('Invalid or unfiltered row audit_logs.changes');
    }
  }
}

function validateContent(table: RowTable, value: unknown): Record<string, unknown> {
  const content = parseObject(value, `Invalid ${table} row content`);
  const definition = ROW_TABLES.find(candidate => candidate.table === table);
  if (!definition) throw new Error(`Unknown row table: ${table}`);
  const fields = new Set(definition.fields.map(field => field.name));
  assertAllowedKeys(content, [...fields], `Unsupported field in ${table} row content`);
  if (table === 'workplace') {
    assertAllowedKeys(
      content,
      ['name', 'icon', 'defaultCurrencyCode', 'safeToSpendDays', 'currencyPrecisions'],
      'Unsupported workplace metadata field',
    );
    for (const key of ['name', 'icon', 'defaultCurrencyCode']) {
      if (typeof content[key] !== 'string' || !content[key].trim())
        throw new Error(`Invalid workplace ${key}`);
    }
    if (![30, 60, 90].includes(content.safeToSpendDays as number))
      throw new Error('Invalid workplace safeToSpendDays');
    const precisionMap = parseObject(
      content.currencyPrecisions,
      'Invalid workplace currencyPrecisions',
    );
    for (const [code, precision] of Object.entries(precisionMap)) {
      if (
        !code.trim() ||
        typeof precision !== 'number' ||
        !Number.isInteger(precision) ||
        precision < 0 ||
        precision > 8
      ) {
        throw new Error('Invalid workplace currency precision');
      }
    }
    if (!Object.hasOwn(precisionMap, String(content.defaultCurrencyCode)))
      throw new Error('Missing default currency precision');
    return { ...content, currencyPrecisions: precisionMap };
  }
  for (const field of definition.fields) {
    if (!Object.hasOwn(content, field.name) && field.optional) continue;
    const fieldValue = content[field.name];
    if (
      typeof fieldValue !== field.type ||
      (typeof fieldValue === 'number' && !Number.isFinite(fieldValue))
    ) {
      throw new Error(`Invalid ${table}.${field.name}`);
    }
  }
  if (
    table === 'accounts' &&
    Object.hasOwn(content, 'color') &&
    typeof content.color !== 'string'
  ) {
    throw new Error('Invalid accounts.color');
  }
  validateEnum(table as PhysicalRowTable, content);
  if (
    typeof content.metadataJson === 'string' &&
    sanitizeSmsMetadataJson(content.metadataJson, true) !== content.metadataJson
  ) {
    throw new Error('Row metadata contains invalid or unfiltered source content');
  }
  return { ...content };
}

/** Map rows only after validateWorkplaceRows has checked complete-state identity/references. */
export function rowImportData(rows: readonly RowSourceRecord[]): BatchImportData {
  const byTable = new Map<RowTable, Record<string, unknown>[]>();
  for (const row of rows) {
    if (row.table === 'workplace') continue;
    const records = byTable.get(row.table) ?? [];
    records.push({ id: row.rowId, ...row.content });
    byTable.set(row.table, records);
  }
  const imported: unknown = {
    accounts: byTable.get('accounts') ?? [],
    journals: byTable.get('journals') ?? [],
    transactions: byTable.get('transactions') ?? [],
    auditLogs: byTable.get('audit_logs') ?? [],
    budgets: byTable.get('budgets') ?? [],
    budgetScopes: byTable.get('budget_scopes') ?? [],
    accountMetadata: byTable.get('account_metadata') ?? [],
    plannedPayments: byTable.get('planned_payments') ?? [],
    journalMetadata: byTable.get('journal_metadata') ?? [],
    transactionAutoPostRules: byTable.get('transaction_auto_post_rules') ?? [],
    transactionInboxRecords: byTable.get('transaction_inbox_records') ?? [],
  };
  assertRowImportData(imported);
  return imported;
}

// Narrow only after validating the complete array/identity/column/enum boundary.
function assertRowImportData(value: unknown): asserts value is BatchImportData {
  const object = parseObject(value, 'Invalid row import data');
  const keys = {
    accounts: 'accounts',
    journals: 'journals',
    transactions: 'transactions',
    audit_logs: 'auditLogs',
    budgets: 'budgets',
    budget_scopes: 'budgetScopes',
    account_metadata: 'accountMetadata',
    planned_payments: 'plannedPayments',
    journal_metadata: 'journalMetadata',
    transaction_auto_post_rules: 'transactionAutoPostRules',
    transaction_inbox_records: 'transactionInboxRecords',
  } as const;
  for (const [table, key] of Object.entries(keys)) {
    const records = object[key];
    if (!Array.isArray(records)) throw new Error('Invalid row import table');
    for (const item of records) {
      const { id, ...content } = parseObject(item, 'Invalid row import record');
      if (!validId(id)) throw new Error('Invalid row import identity');
      validateContent(table as PhysicalRowTable, content);
    }
  }
}

function validateReferences(rows: readonly RowSourceRecord[]): void {
  const imported = rowImportData(rows);
  validateImportedData(imported);

  const journals = new Set(imported.journals.map(row => row.id));
  for (const row of imported.journals) {
    for (const linked of [row.originalJournalId, row.reversingJournalId]) {
      if (linked && !journals.has(linked))
        throw new Error('Workplace row references a missing reversal journal');
    }
  }
}

/** Validate decoded row records as a full workplace state (restore uses the same boundary). */
export function validateWorkplaceRows(
  value: unknown,
  workplaceId: WorkplaceId,
): readonly RowSourceRecord[] {
  if (!Array.isArray(value)) throw new Error('Invalid workplace rows');
  const rows: RowSourceRecord[] = [];
  const seen = new Set<string>();
  let workplaceCount = 0;
  for (const item of value) {
    const record = parseObject(item, 'Invalid workplace row');
    assertAllowedKeys(
      record,
      ['table', 'rowId', 'updatedAt', 'deleted', 'content'],
      'Unsupported workplace row field',
    );
    if (typeof record.table !== 'string' || !ROW_TABLES.some(def => def.table === record.table))
      throw new Error('Unknown workplace row table');
    const table = record.table as RowTable;
    if (!validId(record.rowId)) throw new Error(`Invalid ${table} row identity`);
    if (
      typeof record.updatedAt !== 'number' ||
      !Number.isSafeInteger(record.updatedAt) ||
      record.updatedAt < 0
    )
      throw new Error(`Invalid ${table} updatedAt`);
    if (typeof record.deleted !== 'boolean') throw new Error(`Invalid ${table} deleted flag`);
    const key = `${table}\u0000${record.rowId}`;
    if (seen.has(key)) throw new Error(`Duplicate ${table} row identity`);
    seen.add(key);
    if (record.deleted) throw new Error('Current workplace source cannot contain tombstones');
    const content = validateContent(table, record.content);
    if (table === 'workplace') {
      workplaceCount += 1;
      if (record.rowId !== workplaceId) throw new Error('Workplace metadata identity mismatch');
    }
    rows.push({ table, rowId: record.rowId, updatedAt: record.updatedAt, deleted: false, content });
  }
  if (workplaceCount !== 1)
    throw new Error('Workplace state must contain exactly one metadata row');
  const metadata = rows.find(row => row.table === 'workplace')!.content;
  const currencyCodes = [
    ...new Set([
      metadata.defaultCurrencyCode as string,
      ...rows.flatMap(row =>
        ['accounts', 'journals', 'transactions', 'budgets', 'planned_payments'].includes(
          row.table,
        ) && typeof row.content.currencyCode === 'string'
          ? [row.content.currencyCode]
          : [],
      ),
    ]),
  ];
  const precisions = parseObject(
    metadata.currencyPrecisions,
    'Invalid workplace currencyPrecisions',
  );
  assertAllowedKeys(
    precisions,
    currencyCodes,
    'Unexpected currency precision in workplace metadata',
  );
  for (const code of currencyCodes) {
    const precision = precisions[code];
    if (
      typeof precision !== 'number' ||
      !Number.isInteger(precision) ||
      precision < 0 ||
      precision > 8
    ) {
      throw new Error(`Missing or invalid workplace currency precision: ${code}`);
    }
  }
  validateReferences(rows);
  return rows;
}
