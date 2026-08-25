import {
  parseTransactionIntentSeed,
  toLegacyJournalEntryQueryParams,
  toTransactionIntentSeed,
} from '../journalEntryRouteAdapter';
import { asAccountId, asJournalId } from '@/src/types/ids';

describe('journalEntryRouteAdapter', () => {
  it('maps a blank legacy route to an empty seed', () => {
    expect(parseTransactionIntentSeed({})).toEqual({});
  });

  it('serializes a typed seed into the current legacy route contract', () => {
    expect(
      toLegacyJournalEntryQueryParams({
        editorMode: 'simple',
        type: 'expense',
        journalId: asJournalId('journal-1'),
        sourceAccountId: asAccountId('cash'),
        destinationAccountId: asAccountId('food'),
        amount: '12.34',
        description: 'Coffee',
        notes: 'Imported',
        date: '2026-08-25T12:30:00.000Z',
        sourceContext: {
          launchSource: 'widget',
          smsId: 'sms-1',
          smsRecordId: 'inbox-1',
          smsSender: 'HDFCBK',
          rawSmsBody: 'Card payment at Coffee',
        },
      }),
    ).toEqual({
      mode: 'simple',
      type: 'expense',
      journalId: 'journal-1',
      sourceAccountId: 'cash',
      destinationAccountId: 'food',
      amount: '12.34',
      description: 'Coffee',
      notes: 'Imported',
      initialDate: '2026-08-25T12:30:00.000Z',
      source: 'widget',
      smsId: 'sms-1',
      smsRecordId: 'inbox-1',
      smsSender: 'HDFCBK',
      rawSmsBody: 'Card payment at Coffee',
    });
  });

  it('accepts legacy account aliases and maps them into the seed', () => {
    expect(
      parseTransactionIntentSeed({
        mode: 'split',
        type: 'transfer',
        sourceId: 'cash',
        destinationId: 'bank',
        initialDate: '2026-08-25',
        source: 'planned-payment',
      }),
    ).toEqual({
      editorMode: 'split',
      type: 'transfer',
      sourceAccountId: 'cash',
      destinationAccountId: 'bank',
      date: '2026-08-25',
      sourceContext: { launchSource: 'planned-payment' },
    });
  });

  it('round-trips supported route fields through the normalized parser', () => {
    const seed = toTransactionIntentSeed({
      mode: 'advanced',
      type: 'income',
      journalId: asJournalId('journal-2'),
      sourceAccountId: asAccountId('salary'),
      destinationAccountId: asAccountId('bank'),
      amount: '100',
      description: 'Salary',
      notes: 'Monthly',
      initialDate: '2026-08-25',
      launchSource: 'dashboard',
      smsId: undefined,
      smsRecordId: undefined,
      smsSender: undefined,
      rawSmsBody: undefined,
    });

    expect(seed).toEqual({
      editorMode: 'advanced',
      type: 'income',
      journalId: 'journal-2',
      sourceAccountId: 'salary',
      destinationAccountId: 'bank',
      amount: '100',
      description: 'Salary',
      notes: 'Monthly',
      date: '2026-08-25',
      sourceContext: { launchSource: 'dashboard' },
    });
  });
});
