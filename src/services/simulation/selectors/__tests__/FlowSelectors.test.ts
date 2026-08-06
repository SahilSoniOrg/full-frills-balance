import { selectIncomeEntries } from '../income';
import { selectDebtEntries } from '../debt';
import { selectCommittedEntries } from '../committed';
import { Flow, FlowCategory, FlowSource } from '../../types';
import Account from '@/src/data/models/Account';
import { AccountId, AccountSubtype, AccountType } from '@/src/types/domain';

describe('Flow Selectors', () => {
  const resultCurrency = 'USD';
  const mockAccount = (id: AccountId, name: string, subtype: AccountSubtype): Account =>
    ({
      id,
      name,
      accountSubtype: subtype,
      accountType: subtype === 'CREDIT_CARD' ? AccountType.LIABILITY : AccountType.ASSET,
      currencyCode: resultCurrency,
    }) as Account;

  const accountMap = new Map<AccountId, Account>([
    [
      'checking' as AccountId,
      mockAccount('checking' as AccountId, 'Checking', AccountSubtype.BANK_CHECKING),
    ],
    [
      'savings' as AccountId,
      mockAccount('savings' as AccountId, 'Savings', AccountSubtype.BANK_SAVINGS),
    ],
    ['cc' as AccountId, mockAccount('cc' as AccountId, 'Credit Card', AccountSubtype.CREDIT_CARD)],
    [
      'rent-acc' as AccountId,
      mockAccount('rent-acc' as AccountId, 'Rent Category', AccountSubtype.BANK_CHECKING),
    ],
  ]);

  describe('selectIncomeEntries', () => {
    it('only selects future inflows', () => {
      const flows: Flow[] = [
        {
          kind: 'INFLOW',
          accountId: 'checking' as AccountId,
          amount: 1000,
          dayOffset: -1,
          category: FlowCategory.INCOME,
          timeframe: 'PAST',
          label: 'Past Income',
          origin: FlowSource.PLANNED_PAYMENT,
          referenceId: 'past-income',
        },
        {
          kind: 'INFLOW',
          accountId: 'checking' as AccountId,
          amount: 2000,
          dayOffset: 15,
          category: FlowCategory.INCOME,
          timeframe: 'FUTURE',
          label: 'Salary',
          origin: FlowSource.PLANNED_PAYMENT,
          referenceId: 'salary-1',
        },
      ];

      const income = selectIncomeEntries(flows);
      expect(income).toHaveLength(1);
      expect(income[0].amount).toBe(2000);
      expect(income[0].name).toBe('Salary');
    });
  });

  describe('selectDebtEntries', () => {
    it('aggregates debt by liability account ID', () => {
      const flows: Flow[] = [
        {
          kind: 'OUTFLOW',
          accountId: 'checking' as AccountId,
          amount: 100,
          dayOffset: 5,
          category: FlowCategory.DEBT,
          timeframe: 'FUTURE',
          label: 'CC Payment',
          origin: FlowSource.LIABILITY,
          referenceId: 'cc', // Both point to the same liability
        },
        {
          kind: 'TRANSFER',
          fromAccountId: 'checking' as AccountId,
          toAccountId: 'cc' as AccountId,
          amount: 50,
          dayOffset: 10,
          category: FlowCategory.DEBT,
          timeframe: 'FUTURE',
          label: 'CC Transfer',
          origin: FlowSource.LIABILITY,
          referenceId: 'cc',
        },
      ];

      const debts = selectDebtEntries(flows, accountMap);
      expect(debts).toHaveLength(1);
      expect(debts[0].accountId).toBe('cc' as AccountId);
      expect(debts[0].amount).toBe(150);
    });

    it('groups debt by referenceId (liability account) even if paid from liquid account', () => {
      const flows: Flow[] = [
        {
          kind: 'OUTFLOW',
          accountId: 'checking' as AccountId, // Source
          amount: 500,
          dayOffset: 5,
          category: FlowCategory.DEBT,
          timeframe: 'FUTURE',
          label: 'CC Bill',
          origin: FlowSource.LIABILITY,
          referenceId: 'cc', // Target liability
        },
      ];

      const debts = selectDebtEntries(flows, accountMap);
      expect(debts).toHaveLength(1);
      expect(debts[0].accountId).toBe('cc' as AccountId);
      expect(debts[0].accountName).toBe('Credit Card');
      expect(debts[0].amount).toBe(500);
    });
  });

  describe('selectCommittedEntries', () => {
    it('correctly segments budget entries pre and post income', () => {
      const flows: Flow[] = [
        {
          kind: 'OUTFLOW',
          accountId: 'checking' as AccountId,
          amount: 50,
          dayOffset: 5,
          category: FlowCategory.BUDGET,
          timeframe: 'FUTURE',
          label: 'Groceries',
          origin: FlowSource.BUDGET,
          referenceId: 'groceries',
        },
        {
          kind: 'OUTFLOW',
          accountId: 'checking' as AccountId,
          amount: 100,
          dayOffset: 20,
          category: FlowCategory.BUDGET,
          timeframe: 'FUTURE',
          label: 'Groceries',
          origin: FlowSource.BUDGET,
          referenceId: 'groceries',
        },
      ];

      // Income on day 15
      const committed = selectCommittedEntries(flows, accountMap, 15);

      const groceriesGroup = committed.find(c => c.accountId === ('groceries' as AccountId));
      expect(groceriesGroup).toBeDefined();
      expect(groceriesGroup?.details).toHaveLength(2);

      const preIncome = groceriesGroup?.details.find(d => d.id.includes('_pre'));
      const postIncome = groceriesGroup?.details.find(d => d.id.includes('_post'));

      expect(preIncome?.amount).toBe(50);
      expect(postIncome?.amount).toBe(100);
    });

    it('handles planned transfers within liquid accounts as committed spend', () => {
      const flows: Flow[] = [
        {
          kind: 'TRANSFER',
          fromAccountId: 'checking' as AccountId,
          toAccountId: 'savings' as AccountId,
          amount: 500,
          dayOffset: 10,
          category: FlowCategory.TRANSFER,
          timeframe: 'FUTURE',
          label: 'Savings Move',
          origin: FlowSource.PLANNED_PAYMENT,
          categoryId: 'savings',
          referenceId: 'savings-move',
        },
      ];

      const committed = selectCommittedEntries(flows, accountMap, null);
      expect(committed).toHaveLength(1);
      expect(committed[0].accountName).toBe('Savings');
      expect(committed[0].amount).toBe(500);
    });
  });
});
