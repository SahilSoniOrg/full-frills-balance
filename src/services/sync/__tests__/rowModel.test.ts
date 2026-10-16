import {
  ROW_TABLES,
  ROW_TABLE_NAMES,
  getRowTable,
  groupKey,
  affectedGroupKeys,
  validateRowContent,
  validateCurrencyPrecisions,
} from '../rowTables';
import { ROW_TABLES as CODEC_TABLES } from '../codec/rowHeader';
import {
  SHORT_KEY_MAPS,
  getShortKeyMap,
  encodeShortKeys,
  decodeShortKeys,
  canonicalRowBytes,
  decodeCanonicalRow,
  rowContentHash,
  assertAdditiveMapHistory,
} from '../shortKeys';
import { upgradeRow } from '../rowUpgrades';
import { getRowDictionary } from '../dictionaries';

const transaction = {
  journalId: 'j1',
  accountId: 'a1',
  amount: 12.5,
  transactionType: 'DEBIT',
  currencyCode: 'INR',
  transactionDate: 1704067200000,
  createdAt: 1,
  updatedAt: 2,
};
const workplace = {
  name: 'Books',
  icon: '📚',
  defaultCurrencyCode: 'INR',
  safeToSpendDays: 30,
  currencyPrecisions: { INR: 2 },
};

describe('row schema and short-key boundary', () => {
  test('table/codec/map coverage agrees, and excluded DB/device/private columns cannot leak', () => {
    expect([...ROW_TABLE_NAMES].sort()).toEqual([...CODEC_TABLES].sort());
    expect(ROW_TABLE_NAMES).toHaveLength(12);
    for (const definition of ROW_TABLES) {
      const map = getShortKeyMap(definition.table, 35);
      expect(Object.keys(map).sort()).toEqual(definition.fields.map(field => field.name).sort());
      expect(Object.isFrozen(map)).toBe(true);
      expect(() => assertAdditiveMapHistory(SHORT_KEY_MAPS[definition.table])).not.toThrow();
      for (const field of [
        'id',
        'workplaceId',
        'runningBalance',
        'senderAddress',
        'rawBody',
        'originalSmsBody',
        'originalSmsSender',
        'parseReason',
        'deviceSettings',
      ])
        expect(map).not.toHaveProperty(field);
    }
    expect(
      getRowTable('workplace')
        .fields.map(field => field.name)
        .sort(),
    ).toEqual(['currencyPrecisions', 'defaultCurrencyCode', 'icon', 'name', 'safeToSpendDays']);
    expect(() => getRowTable('sync_row_index')).toThrow();
    expect(() => getRowDictionary('accounts', 'journals/v1')).toThrow(/UNKNOWN_DICT/);
    expect(() => getRowDictionary('accounts', 'accounts/v2')).toThrow(/UNKNOWN_DICT/);
  });
  test('round trip preserves absent optional defaults, false, zero and empty strings', () => {
    expect(new TextDecoder().decode(canonicalRowBytes('transactions', transaction))).toBe(
      '{"a":"j1","b":"a1","c":12.5,"d":"DEBIT","e":"INR","f":1704067200000,"i":1,"j":2}',
    );
    const row = { ...transaction, amount: 0, notes: '', exchangeRate: 0 };
    expect(decodeCanonicalRow('transactions', 35, canonicalRowBytes('transactions', row))).toEqual(
      row,
    );
    const decoded = decodeShortKeys(
      'transactions',
      35,
      encodeShortKeys('transactions', transaction),
    );
    expect(decoded).not.toHaveProperty('notes');
    expect(decoded).not.toHaveProperty('deletedAt');
    const metadata = {
      accountId: 'a1',
      autopayEnabled: false,
      minPaymentOnly: false,
      createdAt: 0,
      updatedAt: 0,
    };
    expect(
      decodeShortKeys('account_metadata', 35, encodeShortKeys('account_metadata', metadata)),
    ).toEqual(metadata);
    expect(() => encodeShortKeys('transactions', { ...transaction, notes: null })).toThrow();
    expect(() => encodeShortKeys('transactions', { ...transaction, notes: undefined })).toThrow();
    const { amount: _amount, ...incomplete } = transaction;
    expect(() => encodeShortKeys('transactions', incomplete)).toThrow(/amount/);
  });
  test('unknown fields/short keys and unknown versions fail, including prototype names', () => {
    expect(() => encodeShortKeys('transactions', { ...transaction, runningBalance: 1 })).toThrow(
      /Unsupported/,
    );
    for (const key of ['z', 'constructor', '__proto__']) {
      const payload = Object.fromEntries([
        ...Object.entries(encodeShortKeys('transactions', transaction)),
        [key, 1],
      ]);
      expect(() => decodeShortKeys('transactions', 35, payload)).toThrow(/Unknown/);
    }
    for (const version of [34, 36, 35.5, NaN])
      expect(() => decodeShortKeys('transactions', version, {})).toThrow(/schema/);
    expect(() =>
      decodeShortKeys('transactions', 35, {
        ...encodeShortKeys('transactions', transaction),
        c: '12',
      }),
    ).toThrow(/amount/);
    expect(() =>
      decodeShortKeys(
        'transactions',
        35,
        Object.fromEntries(
          Object.entries(encodeShortKeys('transactions', transaction)).filter(
            ([key]) => key !== 'a',
          ),
        ),
      ),
    ).toThrow(/journalId/);
  });
  test('content hash ignores insertion order, but includes material edits and nested precision changes', async () => {
    const shuffled = Object.fromEntries(Object.entries(transaction).reverse());
    expect(await rowContentHash('transactions', transaction)).toBe(
      await rowContentHash('transactions', shuffled),
    );
    expect(await rowContentHash('transactions', transaction)).not.toBe(
      await rowContentHash('transactions', { ...transaction, amount: 13 }),
    );
    expect(() =>
      canonicalRowBytes('transactions', { ...transaction, notes: 'चाय'.repeat(30000) }),
    ).toThrow(/FFB_ROW_TOO_LARGE: transactions/);
  });
  test('journal/account/budget groups join children, standalone tables stay distinct, moves touch both groups', () => {
    expect(groupKey('journals', 'x')).toBe(groupKey('transactions', 'leg', { journalId: 'x' }));
    expect(groupKey('journals', 'x')).toBe(
      groupKey('journal_metadata', 'meta', { journalId: 'x' }),
    );
    expect(groupKey('accounts', 'x')).toBe(
      groupKey('account_metadata', 'meta', { accountId: 'x' }),
    );
    expect(groupKey('budgets', 'x')).toBe(groupKey('budget_scopes', 'scope', { budgetId: 'x' }));
    const keys = [
      'journals',
      'accounts',
      'budgets',
      'audit_logs',
      'planned_payments',
      'transaction_auto_post_rules',
      'transaction_inbox_records',
      'workplace',
    ].map(table => groupKey(table as (typeof ROW_TABLE_NAMES)[number], 'same:id'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(
      affectedGroupKeys('transactions', 't', { journalId: 'a:b' }, { journalId: 'a' }),
    ).toEqual([groupKey('journals', 'a'), groupKey('journals', 'a:b')].sort());
    expect(affectedGroupKeys('transactions', 't', { journalId: 'a' })).toEqual([
      groupKey('journals', 'a'),
    ]);
    expect(() => groupKey('transactions', 't', {})).toThrow(/journalId/);
  });
  test('metadata shape and currency interpretation are strict', () => {
    expect(validateRowContent('workplace', workplace)).toEqual(workplace);
    expect(() => validateRowContent('workplace', { ...workplace, id: 'w1' })).toThrow(
      /Unsupported/,
    );
    expect(() =>
      validateRowContent('workplace', { ...workplace, currencyPrecisions: { USD: 2 } }),
    ).toThrow(/Missing/);
    expect(() => validateRowContent('workplace', { ...workplace, safeToSpendDays: 0 })).toThrow();
    expect(() => validateCurrencyPrecisions(workplace, ['INR'], { INR: 2 })).not.toThrow();
    expect(() => validateCurrencyPrecisions(workplace, ['USD'], { INR: 2, USD: 2 })).toThrow();
    expect(() => validateCurrencyPrecisions(workplace, ['INR'], { INR: 0 })).toThrow(/precision/);
    expect(() =>
      validateCurrencyPrecisions(
        { ...workplace, currencyPrecisions: { INR: 2, USD: 2 } },
        ['INR'],
        { INR: 2, USD: 2 },
      ),
    ).toThrow();
  });
  test('retained key assignments never disappear, move or collide', () => {
    expect(() =>
      assertAdditiveMapHistory({ 35: { name: 'a' }, 36: { name: 'a', notes: 'b' } }),
    ).not.toThrow();
    const invalidMaps: Record<string, string>[] = [
      { name: 'b' },
      { notes: 'a' },
      { name: 'a', notes: 'a' },
    ];
    for (const next of invalidMaps)
      expect(() => assertAdditiveMapHistory({ 35: { name: 'a' }, 36: next })).toThrow();
  });
  test('a declared non-additive schema change cannot silently skip its upgrade', () => {
    expect(() =>
      upgradeRow('accounts', 35, { name: 'old' }, 36, [{ from: 35, kind: 'non-additive' }]),
    ).toThrow(/Missing row upgrade: accounts\/35/);
    expect(() => upgradeRow('accounts', 35, { name: 'old' }, 36)).toThrow(/transition/);
    expect(
      upgradeRow('accounts', 35, { name: 'old' }, 36, [{ from: 35, kind: 'non-additive' }], {
        accounts: { 35: row => ({ ...row, name: 'new' }) },
      }),
    ).toEqual({ name: 'new' });
    expect(
      upgradeRow('accounts', 35, { name: 'old' }, 36, [{ from: 35, kind: 'additive' }]),
    ).toEqual({ name: 'old' });
    expect(
      upgradeRow('accounts', 35, { name: 'old', orderNum: 9 }, 36, [
        {
          from: 35,
          kind: 'additive',
          defaults: { accounts: { orderNum: 0, description: '', archivedAt: 0 } },
        },
      ]),
    ).toEqual({ name: 'old', orderNum: 9, description: '', archivedAt: 0 });
  });
});

// Use real SHA-256 in Jest; production selects the platform provider.
jest.mock('@/src/services/backup/cryptoProvider', () => ({
  cryptoProvider: {
    digest: async (bytes: Uint8Array) =>
      new Uint8Array(jest.requireActual('node:crypto').createHash('sha256').update(bytes).digest()),
  },
}));
