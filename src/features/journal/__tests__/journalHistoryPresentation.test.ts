import { journalHistoryAccountIds, mapJournalHistory } from '../journalHistoryPresentation';
import { formatImportSource } from '../journalSourcePresentation';
import type { AuditLogEntry } from '@/src/services/audit/auditLogTypes';
import { AuditAction } from '@/src/types/enums';
import { createAuditEventPayload } from '@/src/types/auditEvents';

function event(id: string, timestamp: number, canRevert = true): AuditLogEntry {
  return {
    id,
    timestamp,
    canRevert,
    entityType: 'journal',
    entityId: 'journal',
    action: AuditAction.UPDATE,
    eventType: 'journal.updated',
    changes: JSON.stringify({ before: { description: 'Old' }, after: { description: 'New' } }),
  };
}

it('offers revert only on the newest event, newest first, at most four events', () => {
  const events = mapJournalHistory([event('1', 1), event('2', 2), event('3', 3), event('4', 4)]);
  expect(events.map(item => item.id)).toEqual(['4', '3', '2', '1']);
  expect(events.filter(item => item.canRevert).map(item => item.id)).toEqual(['4']);
});

it('does not fall back to an older edit when the newest change cannot be reverted', () => {
  const events = mapJournalHistory([event('1', 1), event('2', 2, false)]);
  expect(events.some(item => item.canRevert)).toBe(false);
});

it('lets the edit before an import marker stay revertable', () => {
  const imported = {
    ...event('imported', 2, false),
    action: AuditAction.CREATE,
    eventType: 'journal.imported',
  };
  const events = mapJournalHistory([event('edit', 1), imported]);
  expect(events.find(item => item.id === 'edit')?.canRevert).toBe(true);
});

it('hides a reverted change with its revert so the change before becomes undoable', () => {
  const events = mapJournalHistory([
    event('first', 1),
    event('second', 2),
    { ...event('undo', 3), eventType: 'journal.reverted', revertsLogId: 'second' },
  ]);
  expect(events.map(item => item.id)).toEqual(['first']);
  expect(events[0].canRevert).toBe(true);
});

it('shows a change again once its revert is itself reverted', () => {
  const events = mapJournalHistory([
    event('edit', 1),
    { ...event('undo', 2), eventType: 'journal.reverted', revertsLogId: 'edit' },
    { ...event('redo', 3), eventType: 'journal.reverted', revertsLogId: 'undo' },
  ]);
  expect(events.map(item => item.id)).toEqual(['edit']);
  expect(events[0].canRevert).toBe(true);
});

it('shows only Amount when every entry moved with the total', () => {
  const value = {
    ...event('amount', 1),
    changes: JSON.stringify({
      before: {
        totalAmount: 52,
        currencyCode: 'INR',
        transactions: [
          { accountId: 'bank', amount: 52, type: 'CREDIT' },
          { accountId: 'food', amount: 52, type: 'DEBIT' },
        ],
      },
      after: {
        totalAmount: 5,
        currencyCode: 'INR',
        transactions: [
          { accountId: 'bank', amount: 5, type: 'CREDIT' },
          { accountId: 'food', amount: 5, type: 'DEBIT' },
        ],
      },
    }),
  };
  expect(mapJournalHistory([value])[0].detail).toEqual([
    expect.objectContaining({ field: 'Amount', before: 52, after: 5 }),
  ]);
});

it('keeps per-entry lines when the split changed', () => {
  const value = {
    ...event('split', 1),
    changes: JSON.stringify({
      before: {
        totalAmount: 100,
        currencyCode: 'INR',
        transactions: [
          { accountId: 'bank', accountName: 'Bank', amount: 100, type: 'CREDIT' },
          { accountId: 'food', accountName: 'Food', amount: 60, type: 'DEBIT' },
          { accountId: 'snacks', accountName: 'Snacks', amount: 40, type: 'DEBIT' },
        ],
      },
      after: {
        totalAmount: 100,
        currencyCode: 'INR',
        transactions: [
          { accountId: 'bank', accountName: 'Bank', amount: 100, type: 'CREDIT' },
          { accountId: 'food', accountName: 'Food', amount: 70, type: 'DEBIT' },
          { accountId: 'snacks', accountName: 'Snacks', amount: 30, type: 'DEBIT' },
        ],
      },
    }),
  };
  expect(mapJournalHistory([value])[0].detail.map(item => item.field)).toEqual(['Food', 'Snacks']);
});

it('names categories the journal no longer uses from the account map', () => {
  const value = {
    ...event('retarget', 1),
    changes: JSON.stringify({
      before: { transactions: [{ accountId: 'old', amount: 52, type: 'DEBIT' }] },
      after: { transactions: [{ accountId: 'new', amount: 52, type: 'DEBIT' }] },
    }),
  };
  expect(journalHistoryAccountIds([value])).toEqual(['new', 'old']);
  const accounts = {
    old: { name: 'Food & Drinks', currency: 'INR' },
    new: { name: 'Snacks', currency: 'INR' },
  };
  expect(mapJournalHistory([value], accounts)[0].detail).toContainEqual({
    field: 'Category',
    before: 'Food & Drinks',
    after: 'Snacks',
    format: 'text',
  });
});

it('labels import sources for people, not storage', () => {
  expect(formatImportSource('sms')).toBe('SMS');
  expect(formatImportSource('ivy_import')).toBe('Ivy Wallet');
  expect(formatImportSource('some_bank')).toBe('Some bank');
  const imported = {
    ...event('imported', 1, false),
    action: AuditAction.CREATE,
    eventType: 'journal.imported',
    changes: JSON.stringify({ importSource: 'sms' }),
  };
  expect(mapJournalHistory([imported])[0].description).toBe('SMS');
});

it('does not offer creation undo as an edit revert', () => {
  expect(
    mapJournalHistory([
      { ...event('create', 2), action: AuditAction.CREATE, eventType: 'journal.created' },
    ])[0].canRevert,
  ).toBe(false);
});

it('maps versioned and legacy changes and unambiguous category retargets', () => {
  const payload = createAuditEventPayload({
    entityType: 'journal',
    action: AuditAction.UPDATE,
    eventType: 'journal.updated',
    changes: {
      before: {
        description: 'Snack',
        transactions: [{ accountId: 'old', accountName: 'Snacks', amount: 52, type: 'DEBIT' }],
      },
      after: {
        description: 'Coffee',
        transactions: [{ accountId: 'new', accountName: 'Food', amount: 52, type: 'DEBIT' }],
      },
    },
    undoable: true,
  });
  const events = mapJournalHistory([{ ...event('edit', 1), changes: JSON.stringify(payload) }]);
  expect(events[0].title).toBe('Edited');
  expect(events[0].detail).toContainEqual({
    field: 'Category',
    before: 'Snacks',
    after: 'Food',
    format: 'text',
  });
});

it('marks amount values as money so the view can mask them', () => {
  const value = {
    ...event('money', 1),
    changes: JSON.stringify({
      before: { totalAmount: 52, currencyCode: 'INR' },
      after: { totalAmount: 100, currencyCode: 'INR' },
    }),
  };
  expect(mapJournalHistory([value])[0].detail[0]).toMatchObject({
    before: 52,
    after: 100,
    format: 'money',
    currencyCode: 'INR',
  });
});

it('keeps each amount in its original currency across a currency edit', () => {
  const value = {
    ...event('currency', 1),
    changes: JSON.stringify({
      before: { totalAmount: 1, currencyCode: 'USD' },
      after: { totalAmount: 83, currencyCode: 'INR' },
    }),
  };
  expect(mapJournalHistory([value])[0].detail[0]).toMatchObject({
    beforeCurrencyCode: 'USD',
    currencyCode: 'INR',
  });
});

it('shows creation context without turning its initial fields into edits', () => {
  const created = {
    ...event('created', 1, false),
    action: AuditAction.CREATE,
    eventType: 'journal.sms_auto_posted',
    changes: JSON.stringify(
      createAuditEventPayload({
        entityType: 'journal',
        eventType: 'journal.sms_auto_posted',
        action: AuditAction.CREATE,
        changes: {
          after: {
            description: 'Coffee',
            currencyCode: 'INR',
            totalAmount: 52,
            transactions: [
              { accountId: 'bank', accountName: 'Federal Fi', amount: 52, type: 'CREDIT' },
              { accountId: 'food', accountName: 'Food', amount: 52, type: 'DEBIT' },
            ],
          },
        },
      }),
    ),
  };
  expect(mapJournalHistory([created])[0]).toMatchObject({
    description: 'Federal Fi → Food',
    amount: 52,
    detail: [],
  });
});

it('titles reversals and handles malformed changes without inventing details', () => {
  const reversal = {
    ...event('reverse', 1, false),
    eventType: 'journal.reversed',
    changes: JSON.stringify({
      before: { status: 'POSTED' },
      after: { status: 'REVERSED', reversingJournalId: 'other' },
    }),
  };
  expect(mapJournalHistory([reversal])[0].title).toBe('Reversed');
  expect(mapJournalHistory([{ ...event('bad', 1), changes: '{invalid' }])[0].detail).toEqual([]);
});
