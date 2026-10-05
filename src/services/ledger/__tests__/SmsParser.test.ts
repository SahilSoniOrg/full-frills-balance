import { TransactionDirection } from '@/src/types/enums';
import { toTransactionDirection } from '../SmsParser';

describe('SmsParser.toTransactionDirection', () => {
  it.each([
    ['debit', TransactionDirection.DEBIT],
    ['credit', TransactionDirection.CREDIT],
    ['unknown', TransactionDirection.UNKNOWN],
  ] as const)('maps %s to the domain enum', (direction, expected) => {
    expect(toTransactionDirection(direction)).toBe(expected);
  });
});
