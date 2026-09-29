/**
 * Declarative SMS formats. Add a format here when a real, anonymized message
 * shape needs a stable interpretation; parsing behavior stays in SmsExtractor.
 * Patterns intentionally capture only transaction fields, not balances or IDs.
 */
export interface SmsTransactionTemplate {
  id: string;
  version: number;
  senderPattern?: string;
  bodyPattern: string;
  captures: readonly string[];
  directionMap: Readonly<Record<string, 'debit' | 'credit'>>;
  confidence: number;
}

const currency =
  '(?:[A-Z]{3}|US\\$|A\\$|AU\\$|C\\$|CA\\$|NZ\\$|HK\\$|SG\\$|S\\$|R\\$|\\$|₹|€|£|¥|₩|₦|₱|฿|₺|₴|₽|₫|₸|₲|₵|৳|₪|₡|₭|₮|₨|Rs\\.?)';
const amount = '(?:\\d{1,3}(?:[, .\\u00a0]\\d{2,3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)';
const verbs =
  '(?:debited|spent|paid|charged|purchase|purchased|withdrawn|withdrawal|credited|received|deposited|deposit|refunded|refund|reversed)';

const directionMap: Readonly<Record<string, 'debit' | 'credit'>> = {
  debited: 'debit',
  spent: 'debit',
  paid: 'debit',
  charged: 'debit',
  purchase: 'debit',
  purchased: 'debit',
  withdrawn: 'debit',
  withdrawal: 'debit',
  credited: 'credit',
  received: 'credit',
  deposited: 'credit',
  deposit: 'credit',
  refunded: 'credit',
  refund: 'credit',
  reversed: 'credit',
};

export const SMS_TRANSACTION_TEMPLATES: readonly SmsTransactionTemplate[] = [
  {
    id: 'amount-before-transaction-verb',
    version: 1,
    bodyPattern: `(?:(${currency})\\s*)?(${amount})\\s*(?:(${currency})\\s*)?(?:was\\s+)?(${verbs})\\b`,
    captures: ['currency', 'amount', 'currencySuffix', 'direction'],
    directionMap,
    confidence: 0.94,
  },
  {
    id: 'transaction-verb-before-amount',
    version: 1,
    bodyPattern: `\\b(${verbs})\\b(?:\\s+(?:of|for|with|by|amounting\\s+to))?\\s+(?:(${currency})\\s*)?(${amount})`,
    captures: ['direction', 'currency', 'amount'],
    directionMap,
    confidence: 0.91,
  },
];
