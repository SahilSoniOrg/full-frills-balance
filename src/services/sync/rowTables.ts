import { canonicalJson, jsonObject } from './canonicalJsonData';
export const INITIAL_SCHEMA_VERSION = 35 as const;
export const CURRENT_ROW_SCHEMA_VERSION = 35 as const;

export type RowTable =
  | 'accounts'
  | 'journals'
  | 'transactions'
  | 'audit_logs'
  | 'budgets'
  | 'budget_scopes'
  | 'account_metadata'
  | 'planned_payments'
  | 'journal_metadata'
  | 'transaction_auto_post_rules'
  | 'transaction_inbox_records'
  | 'workplace';
export type FieldType = 'string' | 'number' | 'boolean' | 'object';
export type RowField = Readonly<{ name: string; type: FieldType; optional?: true }>;
export type GroupKind = 'journal' | 'account' | 'budget' | 'row' | 'workplace';
export type RowTableDefinition = Readonly<{
  table: RowTable;
  fields: readonly RowField[];
  group: Readonly<{ kind: GroupKind; field: string }>;
  singleton?: true;
}>;
const f = (names: string, optional = ''): readonly RowField[] => {
  const maybe = new Set(optional.split(' ').filter(Boolean));
  return names
    .split(' ')
    .filter(name => name && name !== 'id')
    .map(name => {
      const type = fieldTypes[name];
      if (!type) throw new Error(`Missing row field type: ${name}`);
      return { name, type, ...(maybe.has(name) ? { optional: true as const } : {}) };
    });
};
const fieldTypes: Record<string, FieldType> = {
  name: 'string',
  accountType: 'string',
  accountSubtype: 'string',
  currencyCode: 'string',
  parentAccountId: 'string',
  description: 'string',
  icon: 'string',
  color: 'string',
  orderNum: 'number',
  reconciledAt: 'number',
  createdAt: 'number',
  updatedAt: 'number',
  deletedAt: 'number',
  archivedAt: 'number',
  journalDate: 'number',
  notes: 'string',
  status: 'string',
  originalJournalId: 'string',
  reversingJournalId: 'string',
  totalAmount: 'number',
  transactionCount: 'number',
  displayType: 'string',
  plannedPaymentId: 'string',
  journalId: 'string',
  accountId: 'string',
  amount: 'number',
  transactionType: 'string',
  transactionDate: 'number',
  exchangeRate: 'number',
  entityType: 'string',
  entityId: 'string',
  action: 'string',
  changes: 'string',
  timestamp: 'number',
  startMonth: 'string',
  intervalType: 'string',
  intervalN: 'number',
  startDate: 'number',
  recurrenceDay: 'number',
  recurrenceMonth: 'number',
  active: 'boolean',
  assetAccountIds: 'string',
  budgetId: 'string',
  statementDay: 'number',
  dueDay: 'number',
  minimumPaymentAmount: 'number',
  minimumBalanceAmount: 'number',
  creditLimitAmount: 'number',
  aprBps: 'number',
  emiDay: 'number',
  loanTenureMonths: 'number',
  autopayEnabled: 'boolean',
  gracePeriodDays: 'number',
  payFromAccountId: 'string',
  minPaymentOnly: 'boolean',
  minimumPaymentPercent: 'number',
  fxMode: 'string',
  destinationAmount: 'number',
  fromAccountId: 'string',
  toAccountId: 'string',
  endDate: 'number',
  nextOccurrence: 'number',
  isAutoPost: 'boolean',
  importSource: 'string',
  originalSmsId: 'string',
  metadataJson: 'string',
  referenceNumber: 'string',
  channelsJson: 'string',
  senderMatch: 'string',
  bodyMatch: 'string',
  conditionsJson: 'string',
  actionsJson: 'string',
  priority: 'number',
  sourceAccountId: 'string',
  categoryAccountId: 'string',
  isActive: 'boolean',
  channel: 'string',
  deviceSourceId: 'string',
  inputDate: 'number',
  inputFingerprint: 'string',
  parseStatus: 'string',
  parsedAmount: 'number',
  parsedCurrencyCode: 'string',
  parsedMerchant: 'string',
  parsedAccountSource: 'string',
  direction: 'string',
  processingStatus: 'string',
  linkedJournalId: 'string',
  duplicateJournalId: 'string',
  duplicateConfidence: 'number',
  parseConfidence: 'number',
  firstSeenAt: 'number',
  lastScannedAt: 'number',
  processedAt: 'number',
  safeToSpendDays: 'number',
  defaultCurrencyCode: 'string',
  currencyPrecisions: 'object',
};
// V1 allowlists from ad2e68a99^:workplaceSnapshot.ts. id becomes the authenticated
// header rowId; workplaceId is also header-only. Body fields use V1 camelCase.
export const ROW_TABLES: readonly RowTableDefinition[] = [
  {
    table: 'accounts',
    fields: f(
      'id name accountType accountSubtype currencyCode parentAccountId description icon color orderNum reconciledAt deletedAt archivedAt createdAt updatedAt',
      'accountSubtype parentAccountId description icon color orderNum reconciledAt deletedAt archivedAt',
    ),
    group: { kind: 'account', field: 'id' },
  },
  {
    table: 'journals',
    fields: f(
      'id journalDate description notes currencyCode status originalJournalId reversingJournalId totalAmount transactionCount displayType plannedPaymentId createdAt updatedAt deletedAt',
      'description notes originalJournalId reversingJournalId plannedPaymentId deletedAt',
    ),
    group: { kind: 'journal', field: 'id' },
  },
  {
    table: 'transactions',
    fields: f(
      'id journalId accountId amount transactionType currencyCode transactionDate notes exchangeRate createdAt updatedAt deletedAt',
      'notes exchangeRate deletedAt',
    ),
    group: { kind: 'journal', field: 'journalId' },
  },
  {
    table: 'audit_logs',
    fields: f('id entityType entityId action changes timestamp createdAt'),
    group: { kind: 'row', field: 'id' },
  },
  {
    table: 'budgets',
    fields: f(
      'id name amount currencyCode startMonth intervalType intervalN startDate recurrenceDay recurrenceMonth active assetAccountIds createdAt updatedAt',
      'startDate recurrenceDay recurrenceMonth assetAccountIds',
    ),
    group: { kind: 'budget', field: 'id' },
  },
  {
    table: 'budget_scopes',
    fields: f('id budgetId accountId createdAt updatedAt'),
    group: { kind: 'budget', field: 'budgetId' },
  },
  {
    table: 'account_metadata',
    fields: f(
      'id accountId statementDay dueDay minimumPaymentAmount minimumBalanceAmount creditLimitAmount aprBps emiDay loanTenureMonths autopayEnabled gracePeriodDays payFromAccountId minPaymentOnly minimumPaymentPercent notes createdAt updatedAt',
      'statementDay dueDay minimumPaymentAmount minimumBalanceAmount creditLimitAmount aprBps emiDay loanTenureMonths autopayEnabled gracePeriodDays payFromAccountId minPaymentOnly minimumPaymentPercent notes',
    ),
    group: { kind: 'account', field: 'accountId' },
  },
  {
    table: 'planned_payments',
    fields: f(
      'id name description amount fxMode destinationAmount currencyCode fromAccountId toAccountId intervalN intervalType startDate endDate nextOccurrence status isAutoPost recurrenceDay recurrenceMonth createdAt updatedAt deletedAt',
      'description fxMode destinationAmount toAccountId endDate recurrenceDay recurrenceMonth deletedAt',
    ),
    group: { kind: 'row', field: 'id' },
  },
  {
    table: 'journal_metadata',
    fields: f(
      'id journalId importSource originalSmsId metadataJson referenceNumber createdAt updatedAt',
      'originalSmsId metadataJson referenceNumber',
    ),
    group: { kind: 'journal', field: 'journalId' },
  },
  {
    table: 'transaction_auto_post_rules',
    fields: f(
      'id channelsJson senderMatch bodyMatch conditionsJson actionsJson priority sourceAccountId categoryAccountId isActive createdAt updatedAt',
      'channelsJson senderMatch bodyMatch conditionsJson actionsJson priority',
    ),
    group: { kind: 'row', field: 'id' },
  },
  {
    table: 'transaction_inbox_records',
    fields: f(
      'id channel deviceSourceId inputDate inputFingerprint parseStatus parsedAmount parsedCurrencyCode parsedMerchant parsedAccountSource referenceNumber direction processingStatus linkedJournalId duplicateJournalId duplicateConfidence parseConfidence metadataJson firstSeenAt lastScannedAt processedAt createdAt updatedAt',
      'parsedAmount parsedCurrencyCode parsedMerchant parsedAccountSource referenceNumber linkedJournalId duplicateJournalId duplicateConfidence parseConfidence metadataJson processedAt',
    ),
    group: { kind: 'row', field: 'id' },
  },
  {
    table: 'workplace',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'icon', type: 'string' },
      { name: 'defaultCurrencyCode', type: 'string' },
      { name: 'safeToSpendDays', type: 'number' },
      { name: 'currencyPrecisions', type: 'object' },
    ],
    group: { kind: 'workplace', field: 'id' },
    singleton: true,
  },
] as const;

export const ROW_TABLE_NAMES = ROW_TABLES.map(def => def.table) as readonly RowTable[];
const definitions = new Map(ROW_TABLES.map(def => [def.table, def]));
/** App-only narrowing; generic crypto accepts other bounded record types. */
export function assertRowTable(value: unknown): asserts value is RowTable {
  if (typeof value !== 'string' || !ROW_TABLE_NAMES.some(table => table === value))
    throw new Error('Unknown row table');
}
export function getRowTable(table: string): RowTableDefinition {
  const definition = definitions.get(table as RowTable);
  if (!definition) throw new Error(`Unknown row table: ${table}`);
  return definition;
}
/** Length framing plus semantic prefixes prevents equal ids in different groups colliding. */
export function groupKey(
  table: RowTable,
  rowId: string,
  row: Readonly<Record<string, unknown>> = {},
): string {
  const definition = getRowTable(table);
  const id = definition.group.field === 'id' ? rowId : row[definition.group.field];
  if (typeof id !== 'string' || !id.length)
    throw new Error(`Missing ${definition.group.field} for ${table} group`);
  const prefix = definition.group.kind === 'row' ? `row:${table}` : definition.group.kind;
  return `${prefix}:${id.length}:${id}`;
}
/** A move participates in both groups; callers must retain pre-delete membership. */
export function affectedGroupKeys(
  table: RowTable,
  rowId: string,
  before?: Readonly<Record<string, unknown>>,
  after?: Readonly<Record<string, unknown>>,
): readonly string[] {
  if (!before && !after) throw new Error('Group membership requires a before or after row');
  return [
    ...new Set(
      [before, after]
        .filter((row): row is Readonly<Record<string, unknown>> => row !== undefined)
        .map(row => groupKey(table, rowId, row)),
    ),
  ].sort();
}
/** Primitive allowlist boundary only. rowSource owns V1 enums, privacy scrubbing,
 * identity/reference checks, SMS eligibility and journal balance validation. */
export function validateRowContent(table: RowTable, value: unknown): Record<string, unknown> {
  const row = jsonObject(value, `${table} row`);
  const definition = getRowTable(table);
  const allowed = new Set(definition.fields.map(field => field.name));
  for (const key of Object.keys(row))
    if (!allowed.has(key)) throw new Error(`Unsupported ${table} field: ${key}`);
  for (const field of definition.fields) {
    const v = row[field.name];
    if (!Object.hasOwn(row, field.name) && field.optional) continue;
    if (field.name === 'currencyPrecisions' && table === 'workplace') {
      const precisions = jsonObject(v, 'workplace currencyPrecisions');
      for (const [code, precision] of Object.entries(precisions))
        if (
          !code.trim() ||
          typeof precision !== 'number' ||
          !Number.isInteger(precision) ||
          precision < 0 ||
          precision > 8
        )
          throw new Error('Invalid workplace currency precision');
      if (!Object.hasOwn(precisions, String(row.defaultCurrencyCode)))
        throw new Error('Missing default currency precision');
      continue;
    }
    if (typeof v !== field.type || (typeof v === 'number' && !Number.isFinite(v)))
      throw new Error(`Invalid ${table}.${field.name}`);
  }
  if (table === 'workplace') {
    if (![30, 60, 90].includes(row.safeToSpendDays as number))
      throw new Error('Invalid workplace safeToSpendDays');
    for (const key of ['name', 'icon', 'defaultCurrencyCode'])
      if (!(row[key] as string).trim()) throw new Error(`Invalid workplace ${key}`);
  }
  canonicalJson(row);
  return { ...row };
}

/** Full-state restore validation must call this with ALL money-row currencies.
 * Precision lookup is provided by the caller; there are no DB reads here. */
export function validateCurrencyPrecisions(
  metadata: unknown,
  usedCodes: readonly string[],
  supported: Readonly<Record<string, number>>,
): void {
  const row = validateRowContent('workplace', metadata);
  const precisions = jsonObject(row.currencyPrecisions, 'currencyPrecisions');
  const codes = new Set([row.defaultCurrencyCode as string, ...usedCodes]);
  if (Object.keys(precisions).length !== codes.size)
    throw new Error('Unexpected or missing currency precision');
  for (const code of codes) {
    if (
      !Object.hasOwn(precisions, code) ||
      !Object.hasOwn(supported, code) ||
      precisions[code] !== supported[code]
    )
      throw new Error(`Unsupported currency precision: ${code}`);
  }
}
