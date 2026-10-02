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
  it('states amount and direction when no additional transaction details were identified', () => {
    expect(formatSmsReviewNotification(parsed())).toBe('Come log ₹100 you spent.');
  });

  it('includes merchant, matched source account, and category when known', () => {
    expect(
      formatSmsReviewNotification(
        parsed({ amount: 200, merchant: 'Cafe Noon', accountSource: 'parser hint' }),
        { sourceAccountName: 'HDFC Bank', categoryName: 'Food' },
      ),
    ).toBe('Come log ₹200 you spent at Cafe Noon from HDFC Bank for Food.');
  });

  it('uses a parsed bank hint when no matched rule account name is available', () => {
    expect(formatSmsReviewNotification(parsed({ accountSource: 'HDFC Bank' }))).toBe(
      'Come log ₹100 you spent from HDFC Bank.',
    );
  });

  it('uses received wording for credits and supports a non-INR currency', () => {
    expect(
      formatSmsReviewNotification(parsed({ amount: 12.5, currencyCode: 'USD', type: 'credit' })),
    ).toBe('Come log $12.5 you received.');
  });

  it('does not expose raw SMS body, sender, internal message ID, or parse metadata', () => {
    const summary = formatSmsReviewNotification(parsed());
    for (const privateValue of [
      'PRIVATE SMS BODY',
      '1234',
      '9999',
      'PRIVATE-SENDER-ID',
      'sms-id-private',
      'parsed',
    ]) {
      expect(summary).not.toContain(privateValue);
    }
  });

  it('strips control characters, trims details, and caps untrusted extracted labels', () => {
    const unsafeMerchant = `${'A'.repeat(61)}\u0000\nSECRET SUFFIX`;
    const summary = formatSmsReviewNotification(parsed({ merchant: unsafeMerchant }));
    expect(summary).toBe(`Come log ₹100 you spent at ${'A'.repeat(60)}.`);
    expect(summary).not.toContain('SECRET SUFFIX');
    expect(summary).not.toMatch(/[\u0000-\u001f\u007f]/);
  });

  it('omits invalid amounts and empty detail labels safely', () => {
    expect(
      formatSmsReviewNotification(
        parsed({ amount: Number.NaN, merchant: '  ', accountSource: '' }),
        { sourceAccountName: '\n\t', categoryName: '' },
      ),
    ).toBe('Come log you spent.');
  });
});
