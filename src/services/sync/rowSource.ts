import { exportRepository } from '@/src/data/repositories/ExportRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { schema } from '@/src/data/database/schema';
import { currencyReadService } from '@/src/services/currency-read-service';
import { preferences } from '@/src/services/preferences';
import { validateImportedData } from '@/src/services/import/validateImportedData';
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
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';
import { sanitizeSmsAuditChanges, sanitizeSmsMetadataJson } from '@/src/utils/smsPrivateMetadata';
import { assertAllowedKeys, parseObject } from '@/src/utils/strictObject';
import { encodeUtf8 } from './codec/tlv';
import { snakeToCamel } from '@/src/utils/serialization';

/** These names and columns are the V1 allowlist, retained as the row plaintext contract. */
const TABLE_COLUMNS = {
  accounts:
    'name account_type account_subtype currency_code parent_account_id description icon color order_num reconciled_at archived_at created_at updated_at deleted_at',
  journals:
    'journal_date description notes currency_code status original_journal_id reversing_journal_id total_amount transaction_count display_type planned_payment_id created_at updated_at deleted_at',
  transactions:
    'journal_id account_id amount transaction_type currency_code transaction_date notes exchange_rate created_at updated_at deleted_at',
  audit_logs: 'entity_type entity_id action changes timestamp created_at',
  budgets:
    'name amount currency_code start_month interval_type interval_n start_date recurrence_day recurrence_month active asset_account_ids created_at updated_at',
  budget_scopes: 'budget_id account_id created_at updated_at',
  account_metadata:
    'account_id statement_day due_day minimum_payment_amount minimum_balance_amount credit_limit_amount apr_bps emi_day loan_tenure_months autopay_enabled grace_period_days pay_from_account_id min_payment_only minimum_payment_percent notes created_at updated_at',
  planned_payments:
    'name description amount fx_mode destination_amount currency_code from_account_id to_account_id interval_n interval_type start_date end_date next_occurrence status is_auto_post recurrence_day recurrence_month created_at updated_at deleted_at',
  journal_metadata:
    'journal_id import_source original_sms_id metadata_json reference_number created_at updated_at',
  transaction_auto_post_rules:
    'channels_json sender_match body_match conditions_json actions_json priority source_account_id category_account_id is_active created_at updated_at',
  transaction_inbox_records:
    'channel device_source_id input_date input_fingerprint parse_status parsed_amount parsed_currency_code parsed_merchant parsed_account_source reference_number direction processing_status linked_journal_id duplicate_journal_id duplicate_confidence parse_confidence metadata_json first_seen_at last_scanned_at processed_at created_at updated_at',
} as const;
type PhysicalRowTable = keyof typeof TABLE_COLUMNS;

export type RowSourceRecord = Readonly<{
  table: RowTable;
  rowId: string;
  updatedAt: number;
  deleted: boolean;
  content: Readonly<Record<string, unknown>>;
}>;

/** Phase 5 can consume these rows while holding its database writer lock. */
export interface RowSource {
  readWorkplaceRows(workplaceId: WorkplaceId): Promise<readonly RowSourceRecord[]>;
  /** Caller already holds the database writer; never enqueue a nested reader. */
  readWorkplaceRowsInWriter(workplaceId: WorkplaceId): Promise<readonly RowSourceRecord[]>;
}

const PAGE_SIZE = 250;
function validId(value: unknown): value is string {
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

function validateEnum(table: PhysicalRowTable, content: Record<string, unknown>): void {
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

function cleanPhysicalRow(
  table: PhysicalRowTable,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const snake of TABLE_COLUMNS[table].split(' ')) {
    const column = schema.tables[table].columns[snake];
    if (!column) throw new Error(`Missing schema column ${table}.${snake}`);
    const name = snakeToCamel(snake);
    const value = raw[name];
    if (value == null) continue; // V1 omitted SQL nulls, including optional columns.
    const normalized = column.type === 'boolean' ? Boolean(value) : value;
    if (
      typeof normalized !== column.type ||
      (typeof normalized === 'number' && !Number.isFinite(normalized))
    ) {
      throw new Error(`Invalid row ${table}.${name}`);
    }
    content[name] = normalized;
  }
  if (typeof content.metadataJson === 'string') {
    const cleaned = sanitizeSmsMetadataJson(content.metadataJson, true);
    if (cleaned === undefined) throw new Error('Invalid source metadata in workplace state');
    content.metadataJson = cleaned;
  }
  if (typeof content.inputFingerprint === 'string')
    content.inputFingerprint = hashLegacySmsFingerprint(content.inputFingerprint);
  if (table === 'audit_logs' && typeof content.changes === 'string') {
    const cleaned = sanitizeSmsAuditChanges(content.changes);
    if (cleaned === undefined) throw new Error('Invalid audit changes in workplace state');
    content.changes = cleaned;
  }
  validateEnum(table, content);
  return content;
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

async function readConsistentRows(workplaceId: WorkplaceId): Promise<readonly RowSourceRecord[]> {
  const workplace = await workplaceRepository.find(workplaceId);
  if (!workplace) throw new Error('Workplace not found for row source');
  const data: RowSourceRecord[] = [];
  const currencyCodes = new Set([workplace.defaultCurrencyCode]);

  for (const definition of ROW_TABLES) {
    if (definition.table === 'workplace') continue;
    const table = definition.table as PhysicalRowTable;
    const columns = ['id', ...TABLE_COLUMNS[table].split(' ')].map(name => ({
      source: name,
      alias: snakeToCamel(name),
    }));
    let afterId: string | undefined;
    while (true) {
      const page = await exportRepository.fetchTablePage({
        tableName: table,
        columns,
        workplaceId,
        afterId,
        limit: PAGE_SIZE,
      });
      if (page.length === 0) break;
      for (const raw of page) {
        const content = cleanPhysicalRow(table, raw);
        if (
          table === 'transaction_inbox_records' &&
          content.channel === 'sms' &&
          !['imported', 'auto_posted', 'dismissed'].includes(String(content.processingStatus))
        )
          continue;
        const id = raw.id;
        if (!validId(id)) throw new Error(`Invalid ${table} row identity`);
        const updatedAt = content.updatedAt ?? content.timestamp ?? content.createdAt;
        if (typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt) || updatedAt < 0)
          throw new Error(`Invalid ${table} updatedAt`);
        if (typeof content.currencyCode === 'string') currencyCodes.add(content.currencyCode);
        data.push({ table, rowId: id, updatedAt, deleted: false, content });
        afterId = id;
      }
      // Advance on the final raw id too, even if an SMS source row was filtered.
      if (page.length > 0) afterId = String(page[page.length - 1].id);
      if (page.length < PAGE_SIZE) break;
    }
  }

  const currencyPrecisions = Object.fromEntries(
    await Promise.all(
      [...currencyCodes].map(
        async code => [code, await currencyReadService.getPrecision(code)] as const,
      ),
    ),
  );
  const prefs = preferences.workplace.getSnapshot(workplaceId);
  data.push({
    table: 'workplace',
    rowId: workplace.id,
    updatedAt: workplace.updatedAt.getTime(),
    deleted: false,
    content: {
      name: workplace.name,
      icon: workplace.icon,
      defaultCurrencyCode: workplace.defaultCurrencyCode,
      safeToSpendDays: prefs.safeToSpendDays,
      currencyPrecisions,
    },
  });
  return validateWorkplaceRows(data, workplaceId);
}

export const rowSource: RowSource = {
  readWorkplaceRowsInWriter: readConsistentRows,
  readWorkplaceRows(workplaceId) {
    return exportRepository.captureConsistently(() => readConsistentRows(workplaceId));
  },
};
