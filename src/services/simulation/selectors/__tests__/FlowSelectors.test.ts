import { selectIncomeEntries } from '../income';
import { selectDebtEntries } from '../debt';
import { selectCommittedEntries } from '../committed';
import { Flow, FlowCategory, FlowSource } from '../../types';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';

describe('Flow Selectors', () => {
  const resultCurrency = 'USD';
  const mockAccount = (id: string, name: string, subtype: AccountSubtype): Account =>
    ({
      id,
      name,
      accountSubtype: subtype,
      accountType: subtype === 'CREDIT_CARD' ? AccountType.LIABILITY : AccountType.ASSET,
      currencyCode: resultCurrency,
    }) as Account;

  const accountMap = new Map<string, Account>([
    ['checking', mockAccount('checking', 'Checking', AccountSubtype.BANK_CHECKING)],
    ['savings', mockAccount('savings', 'Savings', AccountSubtype.BANK_SAVINGS)],
    ['cc', mockAccount('cc', 'Credit Card', AccountSubtype.CREDIT_CARD)],
    ['rent-acc', mockAccount('rent-acc', 'Rent Category', AccountSubtype.BANK_CHECKING)],
  ]);

  describe('selectIncomeEntries', () => {
    it('only selects future inflows', () => {
      const flows: Flow[] = [
        {
          kind: 'INFLOW',
          accountId: 'checking',
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
          accountId: 'checking',
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
          accountId: 'checking',
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
          fromAccountId: 'checking',
          toAccountId: 'cc',
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
      expect(debts[0].accountId).toBe('cc');
      expect(debts[0].amount).toBe(150);
    });

    it('groups debt by referenceId (liability account) even if paid from liquid account', () => {
      const flows: Flow[] = [
        {
          kind: 'OUTFLOW',
          accountId: 'checking', // Source
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
      expect(debts[0].accountId).toBe('cc');
      expect(debts[0].accountName).toBe('Credit Card');
      expect(debts[0].amount).toBe(500);
    });
  });

  describe('selectCommittedEntries', () => {
    it('correctly segments budget entries pre and post income', () => {
      const flows: Flow[] = [
        {
          kind: 'OUTFLOW',
          accountId: 'checking',
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
          accountId: 'checking',
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

      const groceriesGroup = committed.find(c => c.accountId === 'groceries');
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
          fromAccountId: 'checking',
          toAccountId: 'savings',
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
