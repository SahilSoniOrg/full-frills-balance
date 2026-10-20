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
    [{ title: '₹100 spent', body: 'Category needed\nTap to review and log.' }, parsed(), undefined],
    [
      {
        title: '₹200 spent',
        body: 'Cafe Noon\nAccount: HDFC Bank\nSuggested: Food\nTap to review and log.',
      },
      parsed({ amount: 200, merchant: 'Cafe Noon', accountSource: 'parser hint' }),
      { sourceAccountName: 'HDFC Bank', categoryName: 'Food' },
    ],
    [
      { title: '₹100 spent', body: 'Account: HDFC Bank\nCategory needed\nTap to review and log.' },
      parsed({ accountSource: 'HDFC Bank' }),
      undefined,
    ],
    [
      { title: '$12.5 received', body: 'Category needed\nTap to review and log.' },
      parsed({ amount: 12.5, currencyCode: 'USD', type: 'credit' }),
      undefined,
    ],
    [
      { title: 'Transaction to review', body: 'Category needed\nTap to review and log.' },
      parsed({ amount: Number.NaN, merchant: '  ', accountSource: '' }),
      { sourceAccountName: '\n\t', categoryName: '' },
    ],
  ] as const)('formats %s', (expected, tx, context) => {
    expect(formatSmsReviewNotification(tx, 'INR', context)).toEqual(expected);
  });

  it('formats amounts without a parsed currency in the fallback currency, not USD', () => {
    expect(formatSmsReviewNotification(parsed({ currencyCode: undefined }), 'INR')).toEqual({
      title: '₹100 spent',
      body: 'Category needed\nTap to review and log.',
    });
  });

  it('sanitizes untrusted merchant labels without leaking parse metadata', () => {
    const unsafeMerchant = `${'A'.repeat(61)}\u0000\nSECRET SUFFIX`;
    const summary = formatSmsReviewNotification(parsed({ merchant: unsafeMerchant }), 'INR');
    expect(summary).toEqual({
      title: '₹100 spent',
      body: `${'A'.repeat(60)}\nCategory needed\nTap to review and log.`,
    });
    for (const privateValue of [
      'PRIVATE SMS BODY',
      'PRIVATE-SENDER-ID',
      'sms-id-private',
      'SECRET SUFFIX',
    ]) {
      expect(`${summary.title} ${summary.body}`).not.toContain(privateValue);
    }
    expect(summary.title).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(summary.body.split('\n')[0]).not.toMatch(/[\u0000-\u001f\u007f]/);
  });
});
