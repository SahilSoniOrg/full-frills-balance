import {
  readCaptureMetadata,
  updateCaptureAllocations,
  withCaptureMetadata,
  type CaptureMetadata,
} from '@/src/domain/transaction-intelligence/captureMetadata';
import { AccountType, TransactionType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import { remapCaptureMetadataForImport } from '../nativeImportCaptureRemap';

const originalCategory = asAccountId('category-old');
const originalUncategorized = asAccountId('uncategorized-old');
const restoredCategory = asAccountId('category-new');
const capture: CaptureMetadata = {
  version: 1,
  merchant: 'Market',
  economicKind: 'expense',
  reviewState: 'confirmed',
  allocations: [
    {
      accountId: originalCategory,
      amount: 450,
      currencyCode: 'INR',
      transactionType: TransactionType.DEBIT,
      origin: 'user',
      confirmedAt: 100,
    },
  ],
  uncategorizedAccountIds: [originalUncategorized],
  sources: [{ channel: 'email', sourceId: 'email:source', occurredAt: 100 }],
};

it('keeps source identity and mapped confirmation when only an old role is missing', () => {
  const json = remapCaptureMetadataForImport(
    withCaptureMetadata(undefined, capture),
    new Map([[originalCategory, restoredCategory]]),
    [],
  );
  expect(readCaptureMetadata(json)).toMatchObject({
    merchant: 'Market',
    reviewState: 'confirmed',
    allocations: [{ accountId: restoredCategory, origin: 'user', confirmedAt: 100 }],
    uncategorizedAccountIds: [],
    sources: [{ channel: 'email', sourceId: 'email:source' }],
  });
});

it('retains source identity but clears all confirmation if an allocation cannot be mapped', () => {
  const restoredLine = {
    accountId: restoredCategory,
    amount: 450,
    currencyCode: 'INR',
    transactionType: TransactionType.DEBIT,
    accountType: AccountType.EXPENSE,
  };
  const json = remapCaptureMetadataForImport(
    withCaptureMetadata(undefined, capture),
    new Map([[originalUncategorized, asAccountId('uncategorized-new')]]),
    [restoredLine],
  );
  const restored = readCaptureMetadata(json);
  expect(restored).toMatchObject({
    merchant: 'Market',
    reviewState: 'needs_categorization',
    allocations: [{ accountId: restoredCategory, origin: 'system' }],
    uncategorizedAccountIds: ['uncategorized-new'],
    sources: [{ channel: 'email', sourceId: 'email:source' }],
  });
  expect(updateCaptureAllocations(restored!, [restoredLine], true, 200).reviewState).toBe(
    'needs_categorization',
  );
});
