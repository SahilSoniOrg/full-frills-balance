import { CanonicalImportBuilder } from '@/src/services/import/canonicalImportBuilder';
import {
  AccountSubtype,
  AccountType,
  JournalDisplayType,
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  TransactionType,
} from '@/src/types/domain';

jest.mock('@/src/data/database/idGenerator', () => {
  let counter = 0;
  return {
    generator: () => `id-${++counter}`,
  };
});

describe('CanonicalImportBuilder', () => {
  describe('1. Account Level', () => {
    it('materializes ASSET, LIABILITY, and EQUITY accounts with appropriate subtypes and currency defaults', () => {
      const builder = new CanonicalImportBuilder('USD');

      builder.addAccount({
        id: 'acc-checking',
        name: 'Bank Checking',
        currencyCode: 'USD',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.BANK_CHECKING,
        description: 'Primary checking',
        orderNum: 10,
      });

      builder.addAccount({
        id: 'acc-credit-card',
        name: 'Sapphire Card',
        currencyCode: 'EUR',
        accountType: AccountType.LIABILITY,
        accountSubtype: AccountSubtype.CREDIT_CARD,
      });

      builder.addAccount({
        id: 'acc-equity-custom',
        name: 'Owner Equity',
        currencyCode: '', // tests default currency fallback
        accountType: AccountType.EQUITY,
        accountSubtype: AccountSubtype.OPENING_BALANCE,
      });

      const { canonical, issues } = builder.build();
      expect(issues).toHaveLength(0);
      expect(canonical.accounts).toHaveLength(3);

      const checking = canonical.accounts.find(a => a.name === 'Bank Checking');
      expect(checking).toMatchObject({
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.BANK_CHECKING,
        currencyCode: 'USD',
        description: 'Primary checking',
        orderNum: 10,
      });

      const creditCard = canonical.accounts.find(a => a.name === 'Sapphire Card');
      expect(creditCard).toMatchObject({
        accountType: AccountType.LIABILITY,
        accountSubtype: AccountSubtype.CREDIT_CARD,
        currencyCode: 'EUR',
      });

      const equity = canonical.accounts.find(a => a.name === 'Owner Equity');
      expect(equity).toMatchObject({
        accountType: AccountType.EQUITY,
        accountSubtype: AccountSubtype.OPENING_BALANCE,
        currencyCode: 'USD',
      });
    });

    it('guards against duplicate account IDs with first-write-wins semantics', () => {
      const builder = new CanonicalImportBuilder('USD');

      builder.addAccount({
        id: 'acc-1',
        name: 'Original Account',
        currencyCode: 'USD',
      });

      builder.addAccount({
        id: 'acc-1',
        name: 'Duplicate Account',
        currencyCode: 'USD',
      });

      const { canonical, issues } = builder.build();
      expect(canonical.accounts).toHaveLength(1);
      expect(canonical.accounts[0].name).toBe('Original Account');

      const dupIssue = issues.find(i => i.code === 'DUPLICATE_ACCOUNT_ID');
      expect(dupIssue).toBeDefined();
      expect(dupIssue?.sourceId).toBe('acc-1');
    });

    it('normalizes invalid account types and subtypes, emitting warnings', () => {
      const builder = new CanonicalImportBuilder('USD');

      builder.addAccount({
        id: 'acc-bad',
        name: 'Bad Account',
        currencyCode: 'USD',
        accountType: 'NON_EXISTENT_TYPE',
        accountSubtype: 'NON_EXISTENT_SUBTYPE',
      });

      const { canonical, issues } = builder.build();
      expect(canonical.accounts[0].accountType).toBe(AccountType.ASSET);
      expect(canonical.accounts[0].accountSubtype).toBe(AccountSubtype.CASH);

      const enumIssues = issues.filter(i => i.code === 'INVALID_ENUM');
      expect(enumIssues).toHaveLength(2);
    });
  });

  describe('2. Category Level', () => {
    it('creates single accounts for valid categories and distinct accounts for unknown categories', () => {
      const builder = new CanonicalImportBuilder('USD');

      builder.addAccount({
        id: 'acc-main',
        name: 'Main Checking',
        currencyCode: 'USD',
      });

      builder.registerCategory({
        id: 'cat-groceries',
        name: 'Groceries',
      });

      builder.addTransaction({
        amount: 50,
        currencyCode: 'USD',
        type: 'EXPENSE',
        sourceAccountId: 'acc-main',
        categoryId: 'cat-groceries',
        description: 'Supermarket',
      });

      builder.addTransaction({
        amount: 10,
        currencyCode: 'USD',
        type: 'INCOME',
        sourceAccountId: 'acc-main',
        categoryId: 'cat-groceries',
        description: 'Groceries Refund',
      });

      builder.addTransaction({
        amount: 25,
        currencyCode: 'USD',
        type: 'EXPENSE',
        sourceAccountId: 'acc-main',
        description: 'Uncategorized expense',
      });

      builder.addTransaction({
        amount: 100,
        currencyCode: 'USD',
        type: 'INCOME',
        sourceAccountId: 'acc-main',
        description: 'Uncategorized income',
      });

      const { canonical: result } = builder.build();

      const checking = result.accounts.find(a => a.name === 'Main Checking');
      const groceries = result.accounts.filter(a => a.name.startsWith('Groceries'));
      const unknownExpense = result.accounts.find(a => a.name === 'Unknown Expense (USD)');
      const unknownIncome = result.accounts.find(a => a.name === 'Unknown Income (USD)');

      expect(checking).toBeDefined();
      expect(groceries).toHaveLength(1);
      expect(groceries[0].name).toBe('Groceries (USD)');
      expect(groceries[0].accountType).toBe(AccountType.EXPENSE);

      expect(unknownExpense).toBeDefined();
      expect(unknownExpense?.accountType).toBe(AccountType.EXPENSE);

      expect(unknownIncome).toBeDefined();
      expect(unknownIncome?.accountType).toBe(AccountType.INCOME);
      expect(unknownExpense?.id).not.toBe(unknownIncome?.id);
    });

    it('expands categories into distinct accounts per used currency', () => {
      const builder = new CanonicalImportBuilder('USD');

      builder.addAccount({ id: 'acc-usd', name: 'USD Account', currencyCode: 'USD' });
      builder.addAccount({ id: 'acc-eur', name: 'EUR Account', currencyCode: 'EUR' });
      builder.addAccount({ id: 'acc-jpy', name: 'JPY Account', currencyCode: 'JPY' });

      builder.registerCategory({ id: 'cat-dining', name: 'Dining Out' });

      builder.addTransaction({
        amount: 30,
        currencyCode: 'USD',
        type: 'EXPENSE',
        sourceAccountId: 'acc-usd',
        categoryId: 'cat-dining',
      });
      builder.addTransaction({
        amount: 25,
        currencyCode: 'EUR',
        type: 'EXPENSE',
        sourceAccountId: 'acc-eur',
        categoryId: 'cat-dining',
      });
      builder.addTransaction({
        amount: 4000,
        currencyCode: 'JPY',
        type: 'EXPENSE',
        sourceAccountId: 'acc-jpy',
        categoryId: 'cat-dining',
      });

      const { canonical } = builder.build();

      const diningAccounts = canonical.accounts.filter(a => a.name.startsWith('Dining Out'));
      expect(diningAccounts).toHaveLength(3);
      expect(diningAccounts.map(a => a.currencyCode).sort()).toEqual(['EUR', 'JPY', 'USD']);
    });

    it('ensures explicit defaultType takes precedence over transaction count inference', () => {
      const builder = new CanonicalImportBuilder('USD');
      builder.addAccount({ id: 'acc-main', name: 'Main', currencyCode: 'USD' });

      builder.registerCategory({
        id: 'cat-groceries',
        name: 'Groceries',
        defaultType: AccountType.EXPENSE,
      });

      // 10 refunds vs 2 expenses -> defaultType EXPENSE must win
      for (let i = 0; i < 10; i++) {
        builder.addTransaction({
          amount: 10,
          currencyCode: 'USD',
          type: 'INCOME',
          sourceAccountId: 'acc-main',
          categoryId: 'cat-groceries',
        });
      }
      builder.addTransaction({
        amount: 50,
        currencyCode: 'USD',
        type: 'EXPENSE',
        sourceAccountId: 'acc-main',
        categoryId: 'cat-groceries',
      });

      const { canonical } = builder.build();
      const groceriesAcc = canonical.accounts.find(a => a.name.startsWith('Groceries'));
      expect(groceriesAcc?.accountType).toBe(AccountType.EXPENSE);
    });

    it('discovers categories from planned payments and budgets even without transactions', () => {
      const builder = new CanonicalImportBuilder('USD');
      builder.addAccount({ id: 'acc-main', name: 'Main', currencyCode: 'USD' });

      builder.registerCategory({ id: 'cat-subscription', name: 'Subscriptions' });
      builder.registerCategory({ id: 'cat-housing', name: 'Housing' });

      builder.addPlannedPayment({
        name: 'Netflix',
        amount: 15,
        currencyCode: 'USD',
        fromAccountId: 'acc-main',
        toAccountId: 'cat-subscription',
        type: 'EXPENSE',
        startDate: 1700000000000,
      });

      builder.addBudget({
        name: 'Monthly Housing',
        amount: 1500,
        currencyCode: 'USD',
        startMonth: '2024-01',
        categoryIds: ['cat-housing'],
      });

      const { canonical } = builder.build();
      expect(canonical.accounts.some(a => a.name === 'Subscriptions (USD)')).toBe(true);
      expect(canonical.accounts.some(a => a.name === 'Housing (USD)')).toBe(true);
    });
  });

  describe('3. Transaction & Double-Entry Level', () => {
    it('synthesizes balanced debit and credit legs for standard income and expense', () => {
      const builder = new CanonicalImportBuilder('USD');
      builder.addAccount({ id: 'acc-main', name: 'Main', currencyCode: 'USD' });
      builder.registerCategory({
        id: 'cat-salary',
        name: 'Salary',
        defaultType: AccountType.INCOME,
      });
      builder.registerCategory({ id: 'cat-food', name: 'Food', defaultType: AccountType.EXPENSE });

      builder.addTransaction({
        date: 1700000000000,
        amount: 5000,
        currencyCode: 'USD',
        type: 'INCOME',
        sourceAccountId: 'acc-main',
        categoryId: 'cat-salary',
        description: 'Monthly Salary',
      });

      builder.addTransaction({
        date: 1700000100000,
        amount: 80,
        currencyCode: 'USD',
        type: 'EXPENSE',
        sourceAccountId: 'acc-main',
        categoryId: 'cat-food',
        description: 'Dinner',
      });

      const { canonical } = builder.build();
      expect(canonical.journals).toHaveLength(2);
      expect(canonical.transactions).toHaveLength(4);

      // Verify income journal: Debit Asset, Credit Income
      const incomeJournal = canonical.journals.find(j => j.description === 'Monthly Salary')!;
      expect(incomeJournal.displayType).toBe(JournalDisplayType.INCOME);
      expect(incomeJournal.status).toBe(JournalStatus.POSTED);

      const incomeLegs = canonical.transactions.filter(t => t.journalId === incomeJournal.id);
      const assetDebit = incomeLegs.find(t => t.transactionType === TransactionType.DEBIT)!;
      const salaryCredit = incomeLegs.find(t => t.transactionType === TransactionType.CREDIT)!;

      expect(assetDebit.amount).toBe(5000);
      expect(salaryCredit.amount).toBe(5000);

      // Verify expense journal: Credit Asset, Debit Expense
      const expenseJournal = canonical.journals.find(j => j.description === 'Dinner')!;
      expect(expenseJournal.displayType).toBe(JournalDisplayType.EXPENSE);

      const expenseLegs = canonical.transactions.filter(t => t.journalId === expenseJournal.id);
      const assetCredit = expenseLegs.find(t => t.transactionType === TransactionType.CREDIT)!;
      const foodDebit = expenseLegs.find(t => t.transactionType === TransactionType.DEBIT)!;

      expect(assetCredit.amount).toBe(80);
      expect(foodDebit.amount).toBe(80);
    });

    it('routes opening balances and balance corrections to system equity accounts', () => {
      const builder = new CanonicalImportBuilder('USD');
      builder.addAccount({ id: 'acc-savings', name: 'Savings', currencyCode: 'USD' });

      builder.addTransaction({
        amount: 1000,
        currencyCode: 'USD',
        type: 'INCOME',
        sourceAccountId: 'acc-savings',
        isOpeningBalance: true,
        description: 'Opening Balance',
      });

      builder.addTransaction({
        amount: 50,
        currencyCode: 'USD',
        type: 'EXPENSE',
        sourceAccountId: 'acc-savings',
        isBalanceCorrection: true,
        description: 'Balance Adjustment',
      });

      const { canonical } = builder.build();

      const openingBalAcc = canonical.accounts.find(a => a.name === 'Opening Balances (USD)');
      const balanceCorrAcc = canonical.accounts.find(a => a.name === 'Balance Corrections (USD)');

      expect(openingBalAcc?.accountType).toBe(AccountType.EQUITY);
      expect(openingBalAcc?.accountSubtype).toBe(AccountSubtype.OPENING_BALANCE);

      expect(balanceCorrAcc?.accountType).toBe(AccountType.EQUITY);
      expect(balanceCorrAcc?.accountSubtype).toBe(AccountSubtype.NET_WORTH_ADJUSTMENT);
    });

    it('handles transfers with explicit exchangeRate and inferred rate from targetAmount', () => {
      const builder = new CanonicalImportBuilder('USD');
      builder.addAccount({ id: 'acc-usd', name: 'USD Account', currencyCode: 'USD' });
      builder.addAccount({ id: 'acc-eur', name: 'EUR Account', currencyCode: 'EUR' });
      builder.addAccount({ id: 'acc-gbp', name: 'GBP Account', currencyCode: 'GBP' });

      // Inferred rate: 100 USD -> 90 EUR (rate = 0.9)
      builder.addTransaction({
        amount: 100,
        targetAmount: 90,
        currencyCode: 'USD',
        type: 'TRANSFER',
        sourceAccountId: 'acc-usd',
        targetAccountId: 'acc-eur',
        description: 'USD to EUR Inferred',
      });

      // Explicit rate: 100 USD -> GBP at rate 0.8
      builder.addTransaction({
        amount: 100,
        exchangeRate: 0.8,
        currencyCode: 'USD',
        type: 'TRANSFER',
        sourceAccountId: 'acc-usd',
        targetAccountId: 'acc-gbp',
        description: 'USD to GBP Explicit',
      });

      const { canonical } = builder.build();

      const inferredJournal = canonical.journals.find(
        j => j.description === 'USD to EUR Inferred',
      )!;
      const inferredDebit = canonical.transactions.find(
        t => t.journalId === inferredJournal.id && t.transactionType === TransactionType.DEBIT,
      )!;
      expect(inferredDebit.amount).toBe(90);
      expect(inferredDebit.exchangeRate).toBe(0.9);

      const explicitJournal = canonical.journals.find(
        j => j.description === 'USD to GBP Explicit',
      )!;
      const explicitDebit = canonical.transactions.find(
        t => t.journalId === explicitJournal.id && t.transactionType === TransactionType.DEBIT,
      )!;
      expect(explicitDebit.amount).toBe(80);
      expect(explicitDebit.exchangeRate).toBe(0.8);
    });

    it('rejects invalid amounts and missing source/destination accounts', () => {
      const builder = new CanonicalImportBuilder('USD');
      builder.addAccount({ id: 'acc-valid', name: 'Valid', currencyCode: 'USD' });

      builder.addTransaction({
        id: 'tx-neg',
        amount: -50,
        currencyCode: 'USD',
        type: 'EXPENSE',
        sourceAccountId: 'acc-valid',
      });

      builder.addTransaction({
        id: 'tx-nan',
        amount: NaN,
        currencyCode: 'USD',
        type: 'EXPENSE',
        sourceAccountId: 'acc-valid',
      });

      builder.addTransaction({
        id: 'tx-missing-src',
        amount: 50,
        currencyCode: 'USD',
        type: 'EXPENSE',
        sourceAccountId: 'acc-nonexistent',
      });

      builder.addTransaction({
        id: 'tx-missing-dest',
        amount: 50,
        currencyCode: 'USD',
        type: 'TRANSFER',
        sourceAccountId: 'acc-valid',
        targetAccountId: 'acc-nonexistent',
      });

      const { canonical, issues } = builder.build();
      expect(canonical.transactions).toHaveLength(0);
      expect(issues.filter(i => i.code === 'INVALID_AMOUNT')).toHaveLength(2);
      expect(issues.filter(i => i.code === 'ACCOUNT_NOT_FOUND')).toHaveLength(2);
    });
  });

  describe('4. Planned Payment Level', () => {
    it('materializes planned payments and normalizes intervals and statuses', () => {
      const builder = new CanonicalImportBuilder('USD');
      builder.addAccount({ id: 'acc-checking', name: 'Checking', currencyCode: 'USD' });
      builder.registerCategory({ id: 'cat-rent', name: 'Rent' });

      builder.addPlannedPayment({
        id: 'pp-1',
        name: 'Rent Payment',
        amount: 1200,
        currencyCode: 'USD',
        fromAccountId: 'acc-checking',
        toAccountId: 'cat-rent',
        type: 'EXPENSE',
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        startDate: 1700000000000,
        status: PlannedPaymentStatus.ACTIVE,
        isAutoPost: true,
        recurrenceDay: 1,
      });

      const { canonical } = builder.build();
      expect(canonical.plannedPayments).toHaveLength(1);
      const pp = canonical.plannedPayments![0];
      expect(pp.name).toBe('Rent Payment');
      expect(pp.amount).toBe(1200);
      expect(pp.intervalType).toBe(PlannedPaymentInterval.MONTHLY);
      expect(pp.status).toBe(PlannedPaymentStatus.ACTIVE);
      expect(pp.isAutoPost).toBe(true);
      expect(pp.recurrenceDay).toBe(1);
    });

    it('rejects broken planned transfers and non-finite amounts', () => {
      const builder = new CanonicalImportBuilder('USD');
      builder.addAccount({ id: 'acc-checking', name: 'Checking', currencyCode: 'USD' });

      builder.addPlannedPayment({
        id: 'pp-broken-dest',
        name: 'Broken Transfer',
        amount: 200,
        currencyCode: 'USD',
        fromAccountId: 'acc-checking',
        toAccountId: 'acc-nonexistent',
        type: 'TRANSFER',
        startDate: 1700000000000,
      });

      builder.addPlannedPayment({
        id: 'pp-bad-amount',
        name: 'Bad Amount',
        amount: -10,
        currencyCode: 'USD',
        fromAccountId: 'acc-checking',
        type: 'EXPENSE',
        startDate: 1700000000000,
      });

      const { canonical, issues } = builder.build();
      expect(canonical.plannedPayments).toHaveLength(0);
      expect(issues.some(i => i.code === 'INVALID_TRANSFER_DESTINATION')).toBe(true);
      expect(issues.some(i => i.code === 'INVALID_AMOUNT')).toBe(true);
    });

    it('guards invalid intervalN and emits warnings while falling back to 1', () => {
      const builder = new CanonicalImportBuilder('USD');
      builder.addAccount({ id: 'acc-checking', name: 'Checking', currencyCode: 'USD' });

      builder.addPlannedPayment({
        name: 'Gym',
        amount: 50,
        currencyCode: 'USD',
        fromAccountId: 'acc-checking',
        type: 'EXPENSE',
        intervalN: -5,
        startDate: 1700000000000,
      });

      const { canonical, issues } = builder.build();
      expect(canonical.plannedPayments![0].intervalN).toBe(1);
      expect(issues.some(i => i.code === 'INVALID_AMOUNT')).toBe(true);
    });
  });

  describe('5. Budget & Scope Level', () => {
    it('materializes budgets and links category & asset account scopes', () => {
      const builder = new CanonicalImportBuilder('USD');
      builder.addAccount({ id: 'acc-checking', name: 'Checking', currencyCode: 'USD' });
      builder.registerCategory({ id: 'cat-groceries', name: 'Groceries' });
      builder.registerCategory({ id: 'cat-utilities', name: 'Utilities' });

      builder.addBudget({
        id: 'b-1',
        name: 'Monthly Living',
        amount: 800,
        currencyCode: 'USD',
        startMonth: '2024-01',
        categoryIds: ['cat-groceries', 'cat-utilities'],
        assetAccountIds: ['acc-checking'],
      });

      const { canonical, issues } = builder.build();
      expect(issues).toHaveLength(0);
      expect(canonical.budgets).toHaveLength(1);
      expect(canonical.budgetScopes).toHaveLength(3); // 2 category accounts + 1 asset account

      const budget = canonical.budgets![0];
      expect(budget.name).toBe('Monthly Living');
      expect(budget.amount).toBe(800);

      const linkedAccountIds = canonical.budgetScopes!.map(s => s.accountId);
      const internalChecking = canonical.accounts.find(a => a.name === 'Checking')!.id;
      const internalGroceries = canonical.accounts.find(a => a.name === 'Groceries (USD)')!.id;
      const internalUtilities = canonical.accounts.find(a => a.name === 'Utilities (USD)')!.id;

      expect(linkedAccountIds).toContain(internalChecking);
      expect(linkedAccountIds).toContain(internalGroceries);
      expect(linkedAccountIds).toContain(internalUtilities);
    });

    it('reports warning issues on unresolved budget category and asset account references', () => {
      const builder = new CanonicalImportBuilder('USD');

      builder.addBudget({
        id: 'b-bad',
        name: 'Unresolved Budget',
        amount: 500,
        currencyCode: 'USD',
        startMonth: '2024-01',
        categoryIds: ['cat-nonexistent'],
        assetAccountIds: ['acc-nonexistent'],
      });

      const { canonical, issues } = builder.build();
      expect(canonical.budgets).toHaveLength(1);
      expect(canonical.budgetScopes).toHaveLength(0);

      expect(issues.some(i => i.code === 'CATEGORY_NOT_FOUND')).toBe(true);
      expect(issues.some(i => i.code === 'ACCOUNT_NOT_FOUND')).toBe(true);
    });
  });

  describe('6. Double-Entry Invariant & System Integrity Level', () => {
    it('guarantees zero-sum balance and referential integrity across complex multi-currency dataset', () => {
      const builder = new CanonicalImportBuilder('USD');

      builder.addAccount({ id: 'acc-usd-1', name: 'USD Checking', currencyCode: 'USD' });
      builder.addAccount({ id: 'acc-eur-1', name: 'EUR Savings', currencyCode: 'EUR' });

      builder.registerCategory({
        id: 'cat-salary',
        name: 'Salary',
        defaultType: AccountType.INCOME,
      });
      builder.registerCategory({ id: 'cat-food', name: 'Food', defaultType: AccountType.EXPENSE });
      builder.registerCategory({ id: 'cat-misc', name: 'Misc' });

      // Inflow
      builder.addTransaction({
        amount: 3000,
        currencyCode: 'USD',
        type: 'INCOME',
        sourceAccountId: 'acc-usd-1',
        categoryId: 'cat-salary',
      });

      // Outflow
      builder.addTransaction({
        amount: 150,
        currencyCode: 'USD',
        type: 'EXPENSE',
        sourceAccountId: 'acc-usd-1',
        categoryId: 'cat-food',
      });

      // Cross-currency transfer: 500 USD -> 450 EUR
      builder.addTransaction({
        amount: 500,
        targetAmount: 450,
        currencyCode: 'USD',
        type: 'TRANSFER',
        sourceAccountId: 'acc-usd-1',
        targetAccountId: 'acc-eur-1',
      });

      // Opening balance & adjustment
      builder.addTransaction({
        amount: 1000,
        currencyCode: 'EUR',
        type: 'INCOME',
        sourceAccountId: 'acc-eur-1',
        isOpeningBalance: true,
      });

      const { canonical, issues } = builder.build();
      expect(issues.filter(i => i.severity === 'error')).toHaveLength(0);

      const accountIdSet = new Set(canonical.accounts.map(a => a.id));
      const journalIdSet = new Set(canonical.journals.map(j => j.id));

      // 1. Referential integrity
      for (const tx of canonical.transactions) {
        expect(accountIdSet.has(tx.accountId)).toBe(true);
        expect(journalIdSet.has(tx.journalId)).toBe(true);
      }

      // 2. Each journal has exactly 2 legs and valid amounts
      for (const journal of canonical.journals) {
        const legs = canonical.transactions.filter(t => t.journalId === journal.id);
        expect(legs).toHaveLength(2);

        const debits = legs.filter(l => l.transactionType === TransactionType.DEBIT);
        const credits = legs.filter(l => l.transactionType === TransactionType.CREDIT);
        expect(debits).toHaveLength(1);
        expect(credits).toHaveLength(1);

        if (
          journal.displayType !== JournalDisplayType.TRANSFER ||
          debits[0].currencyCode === credits[0].currencyCode
        ) {
          expect(debits[0].amount).toBe(credits[0].amount);
        }
      }
    });

    it('is pure and idempotent across repeated build() calls', () => {
      const builder = new CanonicalImportBuilder('USD');
      builder.addAccount({ id: 'acc-1', name: 'Main', currencyCode: 'USD' });
      builder.addAccount({ id: 'acc-1', name: 'Duplicate', currencyCode: 'USD' }); // 1 warning issue

      const build1 = builder.build();
      const build2 = builder.build();

      expect(build1.canonical.accounts.length).toBe(build2.canonical.accounts.length);
      expect(build1.issues.length).toBe(build2.issues.length);
      expect(build1.issues.length).toBe(1); // Not duplicated on 2nd build
    });
  });
});
