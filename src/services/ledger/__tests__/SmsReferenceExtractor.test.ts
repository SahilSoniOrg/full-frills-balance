import { extractSmsReference } from '../SmsReferenceExtractor';

interface ReferenceFixture {
  source: string;
  body: string;
  expected: {
    value: string;
    kind: 'upi' | 'utr' | 'rrn' | 'neft' | 'rtgs' | 'generic';
    paymentChannel?: 'upi' | 'imps' | 'neft' | 'rtgs' | 'card' | 'unknown';
  } | null;
}

// Public/generic SMS examples — sources cited per fixture row.
const FIXTURES: ReferenceFixture[] = [
  {
    // expo-transaction-sms-reader README example
    source: 'expo-transaction-sms-reader README',
    body: 'Rs. 1,500.00 debited from a/c xx1234 via UPI/HDFCBK; UPI Ref 412345678; Avbl Bal: Rs. 23,450.00',
    expected: { value: '412345678', kind: 'upi', paymentChannel: 'upi' },
  },
  {
    // Issue #45 acceptance example
    source: 'issue #45 acceptance criteria',
    body: 'INR 250.00 debited (UPI Ref No 121554846690) on 07-Mar.',
    expected: { value: '121554846690', kind: 'upi', paymentChannel: 'upi' },
  },
  {
    // transaction_sms_parser pub.dev UPI example
    source: 'transaction_sms_parser pub.dev',
    body: 'Rs.500 sent to merchant@ybl via UPI. UPI Ref No 123456789. Avbl bal Rs.5000',
    expected: { value: '123456789', kind: 'upi', paymentChannel: 'upi' },
  },
  {
    // transaction_sms_parser GitHub UPI colon format
    source: 'transaction_sms_parser GitHub README',
    body: 'Rs 150.00 debited from account ending 1234 to 9876543210@ybl on 04-11-25. UPI Ref: 432198765',
    expected: { value: '432198765', kind: 'upi', paymentChannel: 'upi' },
  },
  {
    // Existing HDFC-style SMS in repo tests
    source: 'full-frills-balance sms-service.test.ts',
    body: 'Your card XX1234 is debited by INR 1,299.50 at SWIGGY on 07-03. Ref 12345678',
    expected: { value: '12345678', kind: 'generic', paymentChannel: 'card' },
  },
  {
    // DEV.to UPI tracking article (Axis-style ref)
    source: 'DEV.to automate-archit UPI tracking article',
    body: 'INR 120 spent on UPI to OLA-CABS ref 339400112233 on 15-Apr',
    expected: { value: '339400112233', kind: 'generic', paymentChannel: 'upi' },
  },
  {
    // expo-transaction-sms-reader parser.ts labeled UTR
    source: 'expo-transaction-sms-reader parser.ts',
    body: 'NEFT credit of INR 5,000.00 received. UTR HDFCN52026040123456789 credited.',
    expected: { value: 'HDFCN52026040123456789', kind: 'utr', paymentChannel: 'neft' },
  },
  {
    // Generic NEFT bank-prefixed UTR format
    source: 'generic NEFT UTR format',
    body: 'NEFT txn successful. NEFT ref SBINN12604001234567 for INR 2,500.00',
    expected: { value: 'SBINN12604001234567', kind: 'neft', paymentChannel: 'neft' },
  },
  {
    // RTGS reference format
    source: 'generic RTGS reference format',
    body: 'RTGS transfer of Rs 50,000 completed. RTGS ref ICICR520260401987654 credited.',
    expected: { value: 'ICICR520260401987654', kind: 'rtgs', paymentChannel: 'rtgs' },
  },
  {
    // IMPS with RRN label
    source: 'generic IMPS RRN format',
    body: 'IMPS txn of Rs.999.00 debited. RRN 908877665544 successful.',
    expected: { value: '908877665544', kind: 'rrn', paymentChannel: 'imps' },
  },
  {
    // Labeled 12-digit UTR
    source: 'generic UTR label format',
    body: 'Funds transfer completed. UTR No 445566778899 credited to your account.',
    expected: { value: '445566778899', kind: 'utr' },
  },
  {
    // TXN ID fallback
    source: 'expo-transaction-sms-reader parser.ts',
    body: 'Amt Rs 75.00 spent at CAFE. TXN ID AB12CD34EF56 posted.',
    expected: { value: 'AB12CD34EF56', kind: 'generic' },
  },
  {
    // Parenthesized UPI ref with punctuation
    source: 'issue #45 parenthesized UPI ref',
    body: 'Payment successful (UPI Ref No 998877665544) for Rs 199.00',
    expected: { value: '998877665544', kind: 'upi', paymentChannel: 'upi' },
  },
  {
    // Cheque number style reference
    source: 'generic cheque reference format',
    body: 'Cheque No 123456789012 presented for INR 10,000.00',
    expected: { value: '123456789012', kind: 'generic' },
  },
  {
    // Negative: card ending digits must not be captured
    source: 'negative card-ending filter',
    body: 'Rs. 2,499.00 spent on your card ending 4608 at AMAZON on 12-03.',
    expected: null,
  },
  {
    // Negative: account fragment only
    source: 'negative account fragment filter',
    body: 'INR 500.00 debited from A/c XX5678. Available balance INR 12,000.00',
    expected: null,
  },
  {
    // Negative: amount-like token without ref label
    source: 'negative amount-only filter',
    body: 'Your account balance is INR 15,432.50 as on 07-Mar-26.',
    expected: null,
  },
];

describe('SmsReferenceExtractor', () => {
  describe.each(FIXTURES)('$source', ({ body, expected }) => {
    it(`extracts reference from: ${body.slice(0, 72)}${body.length > 72 ? '…' : ''}`, () => {
      const result = extractSmsReference(body);

      if (!expected) {
        expect(result).toBeNull();
        return;
      }

      expect(result).not.toBeNull();
      expect(result?.value).toBe(expected.value);
      expect(result?.kind).toBe(expected.kind);
      if (expected.paymentChannel) {
        expect(result?.paymentChannel).toBe(expected.paymentChannel);
      }
      expect(result?.confidence).toBeGreaterThan(0);
      expect(result?.confidence).toBeLessThanOrEqual(1);
    });
  });

  it('returns typed result shape with value, kind, and confidence', () => {
    const result = extractSmsReference('UPI Ref No 121554846690 credited for Rs 10.00');

    expect(result).toEqual({
      value: '121554846690',
      kind: 'upi',
      confidence: 0.95,
      paymentChannel: 'upi',
    });
  });
});
