import type { SmsAccountRecognition } from '@/src/types/accountMatcher';
import { TransactionDirection } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import { checkRuleCompatibility } from '../accountRuleCompatibility';

const bank = asAccountId('bank');
const savings = asAccountId('savings');
const expense = asAccountId('expense');
const isFinancial = (id: string) => id === bank || id === savings;
const recognition = (
  flows: NonNullable<SmsAccountRecognition['flows']>,
): SmsAccountRecognition => ({
  status: 'recognized',
  accountIds: [...new Set(flows.map(entry => entry.accountId))],
  outcomes: [],
  flows,
});

describe('rule compatibility with declared account flow', () => {
  it.each([
    [TransactionDirection.DEBIT, 'outgoing', 'incoming'],
    [TransactionDirection.CREDIT, 'incoming', 'outgoing'],
  ] as const)('orients the financial rule pair for %s SMS', (direction, bankFlow, savingsFlow) => {
    expect(
      checkRuleCompatibility(
        recognition([
          { accountId: bank, flow: bankFlow },
          { accountId: savings, flow: savingsFlow },
        ]),
        { sourceAccountId: bank, categoryAccountId: savings },
        isFinancial,
        direction,
      ),
    ).toBe('compatible');
  });

  it('holds a recognized account assigned to the wrong rule leg', () => {
    expect(
      checkRuleCompatibility(
        recognition([{ accountId: bank, flow: 'incoming' }]),
        { sourceAccountId: bank, categoryAccountId: expense },
        isFinancial,
        TransactionDirection.DEBIT,
      ),
    ).toBe('contradictory');
  });

  it('accepts the receiving account on a debit transfer SMS', () => {
    expect(
      checkRuleCompatibility(
        recognition([{ accountId: savings, flow: 'incoming' }]),
        { sourceAccountId: bank, categoryAccountId: savings },
        isFinancial,
        TransactionDirection.DEBIT,
      ),
    ).toBe('compatible');
  });

  it('cannot verify declared roles against an unoriented rule', () => {
    expect(
      checkRuleCompatibility(
        recognition([{ accountId: bank, flow: 'incoming' }]),
        { sourceAccountId: bank, categoryAccountId: savings },
        isFinancial,
        TransactionDirection.UNKNOWN,
      ),
    ).toBe('indeterminate');
  });

  it('holds conflicting declarations even when both accounts belong to the rule', () => {
    expect(
      checkRuleCompatibility(
        recognition([
          { accountId: bank, flow: 'outgoing' },
          { accountId: savings, flow: 'outgoing' },
        ]),
        { sourceAccountId: bank, categoryAccountId: savings },
        isFinancial,
        TransactionDirection.DEBIT,
      ),
    ).toBe('contradictory');
  });
});
