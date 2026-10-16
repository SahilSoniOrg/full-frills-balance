import { validateWorkplaceRows } from '../rowSource';
import type { WorkplaceId } from '@/src/types/ids';

const WORKPLACE_ID = 'workplace-1' as WorkplaceId;
const metadata = {
  table: 'workplace',
  rowId: WORKPLACE_ID,
  updatedAt: 1,
  deleted: false,
  content: {
    name: 'Home',
    icon: 'briefcase',
    defaultCurrencyCode: 'USD',
    safeToSpendDays: 30,
    currencyPrecisions: { USD: 2 },
  },
};

describe('row source state validation', () => {
  it('requires exactly one workplace metadata row with matching identity', () => {
    expect(() => validateWorkplaceRows([], WORKPLACE_ID)).toThrow(/exactly one metadata row/);
    expect(() => validateWorkplaceRows([metadata, metadata], WORKPLACE_ID)).toThrow(
      /Duplicate workplace row identity/,
    );
    expect(() => validateWorkplaceRows([{ ...metadata, rowId: 'other' }], WORKPLACE_ID)).toThrow(
      /identity mismatch/,
    );
  });

  it('preserves V1 account fields including color in row content', () => {
    const rows = validateWorkplaceRows(
      [
        metadata,
        {
          table: 'accounts',
          rowId: 'account-1',
          updatedAt: 2,
          deleted: false,
          content: {
            name: 'Cash',
            accountType: 'ASSET',
            currencyCode: 'USD',
            color: '#123456',
            createdAt: 1,
            updatedAt: 2,
          },
        },
      ],
      WORKPLACE_ID,
    );

    expect(rows.find(row => row.table === 'accounts')?.content.color).toBe('#123456');
  });

  it('rejects unsupported enums, dangling references, and missing currency precision', () => {
    const invalidAccount = {
      table: 'accounts',
      rowId: 'a',
      updatedAt: 2,
      deleted: false,
      content: {
        name: 'Cash',
        accountType: 'NOT_AN_ACCOUNT',
        currencyCode: 'USD',
        createdAt: 1,
        updatedAt: 2,
      },
    };
    expect(() => validateWorkplaceRows([metadata, invalidAccount], WORKPLACE_ID)).toThrow(
      /accountType/,
    );

    const danglingTransaction = {
      table: 'transactions',
      rowId: 't',
      updatedAt: 2,
      deleted: false,
      content: {
        journalId: 'missing',
        accountId: 'missing',
        amount: 1,
        transactionType: 'DEBIT',
        currencyCode: 'USD',
        transactionDate: 1,
        createdAt: 1,
        updatedAt: 2,
      },
    };
    expect(() => validateWorkplaceRows([metadata, danglingTransaction], WORKPLACE_ID)).toThrow(
      /missing journal/,
    );

    const missingPrecision = {
      ...metadata,
      content: { ...metadata.content, currencyPrecisions: {} },
    };
    expect(() => validateWorkplaceRows([missingPrecision], WORKPLACE_ID)).toThrow(
      /default currency precision/,
    );
  });

  it('does not admit tombstones as current database rows', () => {
    expect(() => validateWorkplaceRows([{ ...metadata, deleted: true }], WORKPLACE_ID)).toThrow(
      /cannot contain tombstones/,
    );
  });
});
