import {
  batchImportDataFromCanonical,
  canonicalImportFromBatchImportData,
} from '@/src/services/import/canonicalImportAdapter';
import { CANONICAL_IMPORT_VERSION_V1 } from '@/src/services/import/canonicalImport';
import { BatchImportData } from '@/src/data/repositories/importTypes';
import { JournalDisplayType } from '@/src/types/enums';

describe('canonicalImportAdapter', () => {
  const minimalBatch: BatchImportData = {
    accounts: [
      {
        id: 'a1',
        name: 'Cash',
        accountType: 'ASSET',
        currencyCode: 'USD',
      },
    ],
    journals: [
      {
        id: 'j1',
        journalDate: 1,
        currencyCode: 'USD',
        status: 'POSTED',
        totalAmount: 10,
        transactionCount: 2,
        displayType: JournalDisplayType.EXPENSE,
      },
    ],
    transactions: [
      {
        id: 't1',
        journalId: 'j1' as BatchImportData['transactions'][0]['journalId'],
        accountId: 'a1' as BatchImportData['transactions'][0]['accountId'],
        amount: 10,
        transactionType: 'DEBIT',
        currencyCode: 'USD',
        transactionDate: 1,
      },
      {
        id: 't2',
        journalId: 'j1' as BatchImportData['transactions'][0]['journalId'],
        accountId: 'a1' as BatchImportData['transactions'][0]['accountId'],
        amount: 10,
        transactionType: 'CREDIT',
        currencyCode: 'USD',
        transactionDate: 1,
      },
    ],
  };

  it('round-trips batch data through canonical v1', () => {
    const canonical = canonicalImportFromBatchImportData(minimalBatch, {
      sourceFormatVersion: '1.4.0',
      importMetadata: { pluginId: 'native' },
    });
    expect(canonical.version).toBe(CANONICAL_IMPORT_VERSION_V1);
    const batch = batchImportDataFromCanonical(canonical);
    expect(batch.accounts).toEqual(minimalBatch.accounts);
    expect(batch.journals).toEqual(minimalBatch.journals);
    expect(batch.transactions).toEqual(minimalBatch.transactions);
  });
});
