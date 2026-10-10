import { InboxParseStatus } from '@/src/types/enums';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { formatSmsReviewNotification } from '../smsReviewNotification';

const parsed = (overrides: Partial<ParsedTransaction> = {}): ParsedTransaction => ({
  id: 'sms-id-private',
  date: 1_700_000_000_000,
  rawBody: 'PRIVATE SMS BODY: account 1234, balance 9999',
  address: 'PRIVATE-SENDER-ID',
  confidence: 0.9,
  parseReason: 'parsed',
  type: 'debit',
  amount: 100,
  currencyCode: 'INR',
  parseStatus: InboxParseStatus.PARSED,
  ...overrides,
});

describe('formatSmsReviewNotification', () => {
  it.each([
    ['Come log ₹100 you spent.', parsed(), undefined],
    [
      'Come log ₹200 you spent at Cafe Noon from HDFC Bank for Food.',
      parsed({ amount: 200, merchant: 'Cafe Noon', accountSource: 'parser hint' }),
      { sourceAccountName: 'HDFC Bank', categoryName: 'Food' },
    ],
    ['Come log ₹100 you spent from HDFC Bank.', parsed({ accountSource: 'HDFC Bank' }), undefined],
    [
      'Come log $12.5 you received.',
      parsed({ amount: 12.5, currencyCode: 'USD', type: 'credit' }),
      undefined,
    ],
    [
      'Come log you spent.',
      parsed({ amount: Number.NaN, merchant: '  ', accountSource: '' }),
      { sourceAccountName: '\n\t', categoryName: '' },
    ],
  ] as const)('formats %s', (expected, tx, context) => {
    expect(formatSmsReviewNotification(tx, 'INR', context)).toBe(expected);
  });

  it('formats amounts without a parsed currency in the fallback currency, not USD', () => {
    expect(formatSmsReviewNotification(parsed({ currencyCode: undefined }), 'INR')).toBe(
      'Come log ₹100 you spent.',
    );
  });

  it('sanitizes untrusted merchant labels without leaking parse metadata', () => {
    const unsafeMerchant = `${'A'.repeat(61)}\u0000\nSECRET SUFFIX`;
    const summary = formatSmsReviewNotification(parsed({ merchant: unsafeMerchant }), 'INR');
    expect(summary).toBe(`Come log ₹100 you spent at ${'A'.repeat(60)}.`);
    for (const privateValue of [
      'PRIVATE SMS BODY',
      'PRIVATE-SENDER-ID',
      'sms-id-private',
      'SECRET SUFFIX',
    ]) {
      expect(summary).not.toContain(privateValue);
    }
    expect(summary).not.toMatch(/[\u0000-\u001f\u007f]/);
  });
});
