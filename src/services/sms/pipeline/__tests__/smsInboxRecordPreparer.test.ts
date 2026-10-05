import { InboxProcessingStatus } from '@/src/types/enums';
import { JournalId } from '@/src/types/ids';
import { prepareUpsertInboxRecord } from '../smsInboxRecordPreparer';
import { makeParsedTx } from '../../__tests__/smsParsedTransaction.helpers';

describe('prepareUpsertInboxRecord', () => {
  const sms = {
    id: 'sms-42',
    address: 'HDFCBK',
    body: 'Debited INR 500 at SWIGGY',
    date: 1700000000000,
  };

  it('persists duplicate metadata on the inbox model fields', () => {
    const record = prepareUpsertInboxRecord(
      sms,
      makeParsedTx({ amount: 500, merchant: 'SWIGGY' }),
      'fingerprint-abc',
      null,
      InboxProcessingStatus.DUPLICATE_FLAGGED,
      'wp-1' as any,
      undefined,
      {
        journalId: 'journal-dup' as JournalId,
        score: 0.72,
        reasons: ['Same amount', 'Matching description/merchant'],
      },
    );

    expect(record.inputFingerprint).toBe('fingerprint-abc');
    expect(record.duplicateJournalId).toBe('journal-dup');
    expect(record.duplicateConfidence).toBe(0.72);
    expect(record.firstSeenAt).toEqual(expect.any(Number));
    expect(record.lastScannedAt).toEqual(expect.any(Number));

    const metadata = JSON.parse(record.metadataJson as string);
    expect(metadata.duplicateReasons).toEqual(['Same amount', 'Matching description/merchant']);
  });

  it('persists referenceNumber from parsed SMS', () => {
    const record = prepareUpsertInboxRecord(
      sms,
      makeParsedTx({ amount: 500, referenceNumber: 'UTR123456' }),
      'fingerprint-abc',
      null,
      InboxProcessingStatus.PENDING,
      'wp-1' as any,
    );

    expect(record.referenceNumber).toBe('UTR123456');
  });

  it('preserves firstSeenAt and merges metadata when updating an existing record', () => {
    const existingRecord = {
      firstSeenAt: 1699000000000,
      metadataJson: JSON.stringify({ keepMe: true }),
    };

    const record = prepareUpsertInboxRecord(
      sms,
      makeParsedTx({ amount: 500 }),
      'fingerprint-abc',
      existingRecord as any,
      InboxProcessingStatus.PENDING,
      'wp-1' as any,
    );

    expect(record.firstSeenAt).toBe(1699000000000);
    expect(record.lastScannedAt).toEqual(expect.any(Number));
    const metadata = JSON.parse(record.metadataJson as string);
    expect(metadata.keepMe).toBe(true);
  });
});
