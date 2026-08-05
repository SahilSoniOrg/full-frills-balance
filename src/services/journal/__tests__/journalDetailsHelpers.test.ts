import { JournalDisplayType } from '@/src/types/domain';
import {
  mapJournalLegSplitPresentation,
  mapSmsJournalMetadataDisplay,
  resolveJournalDetailsInfo,
  resolveJournalStatusChipVariant,
  resolveJournalAmountPresentation,
} from '../journalDetailsHelpers';

describe('journalDetailsHelpers', () => {
  it('resolveJournalDetailsInfo prefers loaded journal over route preview', () => {
    const fromJournal = resolveJournalDetailsInfo({
      journal: {
        id: 'j1',
        description: 'Coffee',
        journalDate: 100,
        status: 'POSTED',
        currencyCode: 'USD',
        displayType: 'EXPENSE',
        totalAmount: 5,
      },
      routePreview: { title: 'Preview', amount: '99' },
      fallbackCurrency: 'USD',
      fallbackNow: 0,
    });
    expect(fromJournal?.description).toBe('Coffee');

    const fromRoute = resolveJournalDetailsInfo({
      journal: null,
      routePreview: { title: 'Preview', amount: '12', currencyCode: 'EUR' },
      fallbackCurrency: 'USD',
      fallbackNow: 50,
    });
    expect(fromRoute?.totalAmount).toBe(12);
    expect(fromRoute?.currency).toBe('EUR');
  });

  it('resolveJournalAmountPresentation applies sign and color', () => {
    const expense = resolveJournalAmountPresentation({
      journalInfo: {
        description: 'x',
        date: 1,
        status: 'POSTED',
        currency: 'USD',
        displayType: JournalDisplayType.EXPENSE,
        totalAmount: 10,
        journalDate: 1,
      },
      journalLoaded: true,
    });
    expect(expense.amount).toBe(10);
    expect(expense.currencyCode).toBe('USD');
    expect(expense.amountPrefix).toBe('-');
    expect(expense.amountColor).toBe('error');
    expect(expense.isExpense).toBe(true);
  });

  it('resolveJournalStatusChipVariant maps posted and planned', () => {
    expect(resolveJournalStatusChipVariant({ status: 'POSTED' })).toBe('income');
    expect(resolveJournalStatusChipVariant({ status: 'PLANNED' })).toBe('primary');
  });

  it('mapJournalLegSplitPresentation labels debit as To', () => {
    const debit = mapJournalLegSplitPresentation({
      transactionType: 'DEBIT',
      amount: 5,
      currencyCode: 'USD',
    });
    expect(debit.transactionTypeLabel).toContain('To');
    expect(debit.amountPrefix).toBe('+');
    expect(debit.amount).toBe(5);
  });

  it('mapSmsJournalMetadataDisplay parses metadata json', () => {
    const info = mapSmsJournalMetadataDisplay({
      metadataJson: JSON.stringify({ parsedAmount: 42, parsedCurrencyCode: 'USD' }),
      inboxRecord: { id: 'sms-1', inputDate: 1_700_000_000_000 },
    });
    expect(info.amount).toBe(42);
    expect(info.currencyCode).toBe('USD');
    expect(info.inboxRecordId).toBe('sms-1');
  });

  it('mapSmsJournalMetadataDisplay fails closed on invalid json', () => {
    const info = mapSmsJournalMetadataDisplay({
      metadataJson: '{not-json',
      originalSmsSender: 'BANK',
    });
    expect(info.sender).toBe('BANK');
    expect(info.amount).toBeUndefined();
  });
});
