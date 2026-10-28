import { InboxParseStatus, TransactionDirection } from '@/src/types/enums';
import { SmsParser, toTransactionDirection } from '../SmsParser';

describe('SmsParser.toTransactionDirection', () => {
  it.each([
    ['debit', TransactionDirection.DEBIT],
    ['credit', TransactionDirection.CREDIT],
    ['unknown', TransactionDirection.UNKNOWN],
  ] as const)('maps %s to the domain enum', (direction, expected) => {
    expect(toTransactionDirection(direction)).toBe(expected);
  });
});

describe('SmsParser.parse currency-adjacent amounts', () => {
  it.each([
    {
      body: 'Dear Customer, you have received USD20.60 in your account number:',
      amount: 20.6,
      currencyCode: 'USD',
    },
    {
      body: 'You have received a payment of Ksh49.05 from',
      amount: 49.05,
      currencyCode: 'KES',
    },
  ])('parses incoming amount from "$body"', async ({ body, amount, currencyCode }) => {
    const parsed = await SmsParser.parse({
      id: 'sms-currency-adjacent',
      address: 'BANK',
      body,
      date: 1_700_000_000_000,
    });

    expect(parsed).toMatchObject({
      amount,
      currencyCode,
      type: 'credit',
      parseStatus: InboxParseStatus.PARSED,
    });
    expect(parsed.accountSource).toBeUndefined();
    expect(parsed.merchant).toBeUndefined();
  });
});

describe('SmsParser.parse international currency & bank SMS templates', () => {
  it.each([
    // Kenya - M-Pesa
    {
      name: 'Kenya M-Pesa Paybill',
      body: 'QDE45RT890 Confirmed. Ksh1,500.00 sent to JAVA HOUSE on 24/10/24 at 1:15 PM. New M-PESA balance is Ksh4,250.50.',
      expected: {
        amount: 1500,
        currencyCode: 'KES',
        type: 'debit',
        merchant: 'JAVA HOUSE',
        referenceNumber: 'QDE45RT890',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
    {
      name: 'Kenya M-Pesa Received',
      body: 'QDE45RT891 Confirmed. You have received Ksh2,000.00 from JOHN DOE on 24/10/24 at 2:30 PM. New M-PESA balance is Ksh6,250.50.',
      expected: {
        amount: 2000,
        currencyCode: 'KES',
        type: 'credit',
        merchant: 'JOHN DOE',
        referenceNumber: 'QDE45RT891',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
    // Nigeria - OPay / Banking
    {
      name: 'Nigeria OPay Debit Transfer',
      body: 'Debit Alert: You have transferred NGN 5,000.00 to ADEKUNLE OLUWASEUN (OPay/9012345678). Bal: NGN 18,250.00. Ref: 2410241645001234.',
      expected: {
        amount: 5000,
        currencyCode: 'NGN',
        type: 'debit',
        merchant: 'ADEKUNLE OLUWASEUN',
        referenceNumber: '2410241645001234',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
    {
      name: 'Nigeria Bank Naira Symbol',
      body: 'Your account has been credited with ₦50,000.00 from CHIDI EZE on 24-Oct-2026. Ref: TRF9812481.',
      expected: {
        amount: 50000,
        currencyCode: 'NGN',
        type: 'credit',
        merchant: 'CHIDI EZE',
        referenceNumber: 'TRF9812481',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
    // South Africa - FNB
    {
      name: 'South Africa FNB inContact',
      body: 'FNB :-) R345.50 paid from cheq a/c ..1234 using card ..7890 @ WOOLWORTHS. 24 Oct 13:20. Avail R12,450.00.',
      expected: {
        amount: 345.5,
        currencyCode: 'ZAR',
        type: 'debit',
        merchant: 'WOOLWORTHS',
        accountSource: 'A/c 1234',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
    // Ghana - MTN MoMo
    {
      name: 'Ghana MoMo Payment',
      body: 'Payment made for GHS 120.00 to TOTAL PETROLEUM on 24/10/2026 08:45:12. Current Balance: GHS 645.20. Txn ID: 9845120194.',
      expected: {
        amount: 120,
        currencyCode: 'GHS',
        type: 'debit',
        merchant: 'TOTAL PETROLEUM',
        referenceNumber: '9845120194',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
    // Philippines - GCash
    {
      name: 'Philippines GCash Payment',
      body: 'You have paid PHP 250.00 of GCash to 7-ELEVEN on 10-24-24 14:30:15. Ref. No. 1029384756.',
      expected: {
        amount: 250,
        currencyCode: 'PHP',
        type: 'debit',
        merchant: '7-ELEVEN',
        referenceNumber: '1029384756',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
    // UAE - Dirham
    {
      name: 'UAE Card Purchase',
      body: 'Purchase of AED 245.50 on your Card ending 4321 at CARREFOUR DUBAI on 24-OCT-2026 14:15. Avl Bal: AED 12,430.20.',
      expected: {
        amount: 245.5,
        currencyCode: 'AED',
        type: 'debit',
        merchant: 'CARREFOUR DUBAI',
        accountSource: 'Card 4321',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
    // Saudi Arabia - Riyal
    {
      name: 'Saudi Arabia POS Purchase',
      body: 'Purchase: SAR 180.00 with mada card ending 8812 at LULU HYPERMARKET on 24-10-2026 18:22. Avail: SAR 3,450.00.',
      expected: {
        amount: 180,
        currencyCode: 'SAR',
        type: 'debit',
        merchant: 'LULU HYPERMARKET',
        accountSource: 'Card 8812',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
    // Brazil - Pix
    {
      name: 'Brazil Pix Transfer',
      body: 'Pix enviado: R$ 150,00 da sua conta ****1234 para Joao Silva no dia 24/10/2026 as 10:14. Saldo: R$ 1.850,20.',
      expected: {
        amount: 150,
        currencyCode: 'BRL',
        type: 'debit',
        merchant: 'Joao Silva',
        accountSource: 'A/c 1234',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
    // Malaysia - Ringgit
    {
      name: 'Malaysia Card Charge',
      body: 'RM 85.50 charged to Card ending 2219 at JAYA GROCER on 24-OCT-2026 16:45.',
      expected: {
        amount: 85.5,
        currencyCode: 'MYR',
        type: 'debit',
        merchant: 'JAYA GROCER',
        accountSource: 'Card 2219',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
    // Indonesia - QRIS / Rupiah
    {
      name: 'Indonesia QRIS Transaction',
      body: 'Transaksi QRIS Rp 75.000 berhasil di KOPI KENANGAN pada 24/10/2026 menggunakan Rekening ...4512.',
      expected: {
        amount: 75000,
        currencyCode: 'IDR',
        type: 'debit',
        merchant: 'KOPI KENANGAN',
        accountSource: 'A/c 4512',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
    // Uganda - Shilling
    {
      name: 'Uganda Bank Debit',
      body: 'Stanbic Alert: UGX 150,000 has been debited from your A/C 9030****123 via ATM payment on 28-Oct-2026. Ref: 8812930.',
      expected: {
        amount: 150000,
        currencyCode: 'UGX',
        type: 'debit',
        accountSource: 'A/c 123',
        referenceNumber: '8812930',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
    // Tanzania - Shilling
    {
      name: 'Tanzania Bank Debit',
      body: 'CRDB: TZS 75,000.00 imetolewa kwenye akaunti 0150****123 tarehe 28/10/2026.',
      expected: {
        amount: 75000,
        currencyCode: 'TZS',
        type: 'debit',
        accountSource: 'A/c 123',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
    // Egypt - Pound
    {
      name: 'Egypt Card Charge',
      body: 'Your card ending 6041 has been charged EGP 850.00 at GOURMET MARKET on 24/10/2026 13:40.',
      expected: {
        amount: 850,
        currencyCode: 'EGP',
        type: 'debit',
        merchant: 'GOURMET MARKET',
        accountSource: 'Card 6041',
        parseStatus: InboxParseStatus.PARSED,
      },
    },
  ])('correctly parses $name', async ({ body, expected }) => {
    const parsed = await SmsParser.parse({
      id: 'sms-international-test',
      address: 'BANK-ALERT',
      body,
      date: 1_700_000_000_000,
    });

    expect(parsed).toMatchObject(expected);
  });
});
