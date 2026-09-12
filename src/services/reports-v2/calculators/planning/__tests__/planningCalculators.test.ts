import { calculateBudgetPerformance } from '../budgetPerformanceCalculator';
import { calculateDebtReport } from '../debtCalculator';
import { calculateForecast } from '../forecastCalculator';
import { calculateReportHealth } from '../healthCalculator';

const DAY_1 = Date.UTC(2026, 0, 1);
const DAY_2 = Date.UTC(2026, 0, 2);
const DAY_3 = Date.UTC(2026, 0, 3);

const expenseFact = (overrides: Record<string, unknown> = {}) => ({
  workplaceId: 'workplace-1',
  journalId: `journal-${Math.random()}`,
  transactionId: `transaction-${Math.random()}`,
  journalDate: DAY_1,
  journalStatus: 'POSTED',
  accountId: 'food',
  accountType: 'EXPENSE',
  accountSubtype: 'FOOD',
  accountPath: ['food'],
  isLeafAccount: true,
  transactionType: 'DEBIT',
  amount: 0,
  currencyCode: 'USD',
  signedBalanceDelta: 0,
  ...overrides,
});

describe('Reports V2 planning calculators', () => {
  describe('calculateBudgetPerformance', () => {
    it('matches posted expense facts by scoped leaf account IDs and keeps planned facts separate', () => {
      const result = calculateBudgetPerformance({
        budgets: [
          {
            id: 'budget-food',
            name: 'Food',
            amount: 100,
            currencyCode: 'USD',
            leafAccountIds: ['food'],
          },
        ],
        actualFacts: [
          expenseFact({
            journalId: 'posted-food',
            transactionId: 'posted-food-line',
            amount: 80,
            signedBalanceDelta: 80,
          }),
          expenseFact({
            journalId: 'posted-refund',
            transactionId: 'posted-refund-line',
            amount: 10,
            transactionType: 'CREDIT',
            signedBalanceDelta: -10,
            semanticType: 'REFUND',
          }),
          expenseFact({
            journalId: 'parent-account',
            transactionId: 'parent-account-line',
            accountId: 'food-parent',
            accountPath: ['food-parent'],
            isLeafAccount: false,
            amount: 200,
            signedBalanceDelta: 200,
          }),
          expenseFact({
            journalId: 'unbudgeted-transport',
            transactionId: 'unbudgeted-transport-line',
            accountId: 'transport',
            accountSubtype: 'TRANSPORT',
            accountPath: ['transport'],
            amount: 25,
            signedBalanceDelta: 25,
          }),
          expenseFact({
            journalId: 'planned-leaked-into-actuals',
            transactionId: 'planned-leaked-line',
            journalStatus: 'PLANNED',
            amount: 999,
            signedBalanceDelta: 999,
          }),
        ],
        plannedFacts: [
          expenseFact({
            journalId: 'future-food',
            transactionId: 'future-food-line',
            journalDate: DAY_3,
            journalStatus: 'PLANNED',
            amount: 20,
            signedBalanceDelta: 20,
            plannedPaymentId: 'planned-food',
          }),
        ],
        period: { startDate: DAY_1, endDate: DAY_3, asOfDate: DAY_2 },
      });

      expect(result.budgets).toHaveLength(1);
      expect(result.budgets[0]).toMatchObject({
        budgetId: 'budget-food',
        budgetedAmount: 100,
        actualGrossExpense: 80,
        actualRefunds: 10,
        actualNetExpense: 70,
        remainingAmount: 30,
        percentageUsed: 70,
        plannedGrossExpense: 20,
        plannedRefunds: 0,
        plannedNetExpense: 20,
      });
      expect(result.budgets[0].journalIds).toEqual(['posted-food', 'posted-refund']);
      expect(result.unbudgeted).toMatchObject({
        actualGrossExpense: 25,
        actualRefunds: 0,
        actualNetExpense: 25,
      });
      expect(result.totals.actualNetExpense).toBe(95);
      expect(result.totals.plannedNetExpense).toBe(20);
    });
  });

  describe('calculateDebtReport', () => {
    it('reports liability movement, payment totals, utilization, and planned activity separately', () => {
      const result = calculateDebtReport({
        accounts: [
          {
            id: 'card',
            name: 'Card',
            accountType: 'LIABILITY',
            accountSubtype: 'CREDIT_CARD',
            openingBalance: 400,
            metadata: { creditLimitAmount: 1000, minimumPaymentAmount: 25, dueDay: 15 },
          },
        ],
        actualFacts: [
          {
            journalId: 'card-purchase',
            transactionId: 'card-purchase-line',
            journalDate: DAY_1,
            journalStatus: 'POSTED',
            accountId: 'card',
            accountType: 'LIABILITY',
            transactionType: 'CREDIT',
            amount: 100,
            currencyCode: 'USD',
            signedBalanceDelta: 100,
            semanticType: 'EXPENSE_ON_CREDIT',
          },
          {
            journalId: 'card-payment',
            transactionId: 'card-payment-line',
            journalDate: DAY_2,
            journalStatus: 'POSTED',
            accountId: 'card',
            accountType: 'LIABILITY',
            transactionType: 'DEBIT',
            amount: 150,
            currencyCode: 'USD',
            signedBalanceDelta: -150,
            semanticType: 'DEBT_PAYMENT',
          },
        ],
        plannedFacts: [
          {
            journalId: 'planned-card-payment',
            transactionId: 'planned-card-payment-line',
            journalDate: DAY_3,
            journalStatus: 'PLANNED',
            accountId: 'card',
            accountType: 'LIABILITY',
            transactionType: 'DEBIT',
            amount: 50,
            currencyCode: 'USD',
            signedBalanceDelta: -50,
            semanticType: 'DEBT_PAYMENT',
          },
        ],
        period: { startDate: DAY_1, endDate: DAY_3 },
      });

      expect(result.accounts[0]).toMatchObject({
        accountId: 'card',
        openingBalance: 400,
        closingBalance: 350,
        balanceChange: -50,
        borrowings: 100,
        totalPayments: 150,
        plannedBorrowings: 0,
        plannedPayments: 50,
        creditLimitAmount: 1000,
        utilizationPercent: 35,
        minimumPaymentAmount: 25,
        dueDay: 15,
      });
      expect(result.accounts[0].principalRepayment).toBeNull();
      expect(result.totals.totalPayments).toBe(150);
      expect(result.totals.plannedPayments).toBe(50);
    });
  });

  describe('calculateForecast', () => {
    it('projects cash from posted movement plus planned cash facts without merging the streams', () => {
      const result = calculateForecast({
        accounts: [
          {
            id: 'checking',
            name: 'Checking',
            accountType: 'ASSET',
            accountSubtype: 'BANK_CHECKING',
            balance: 1000,
          },
          {
            id: 'brokerage',
            name: 'Brokerage',
            accountType: 'ASSET',
            accountSubtype: 'BROKERAGE',
            balance: 9000,
          },
        ],
        cashAccountIds: ['checking'],
        startingCashBalance: 1000,
        actualFacts: [
          {
            journalId: 'actual-paycheck',
            transactionId: 'actual-paycheck-line',
            journalDate: DAY_1,
            journalStatus: 'POSTED',
            accountId: 'checking',
            accountType: 'ASSET',
            transactionType: 'DEBIT',
            amount: 200,
            currencyCode: 'USD',
            signedBalanceDelta: 200,
          },
        ],
        plannedFacts: [
          {
            journalId: 'planned-rent',
            transactionId: 'planned-rent-line',
            journalDate: DAY_2,
            journalStatus: 'PLANNED',
            accountId: 'checking',
            accountType: 'ASSET',
            transactionType: 'CREDIT',
            amount: 1100,
            currencyCode: 'USD',
            signedBalanceDelta: -1100,
            plannedPaymentId: 'rent',
          },
        ],
        period: { startDate: DAY_1, endDate: DAY_3, asOfDate: DAY_1 },
        lowBalanceThreshold: 0,
      });

      expect(result.totals).toMatchObject({
        actualInflow: 200,
        actualOutflow: 0,
        actualNetMovement: 200,
        plannedInflow: 0,
        plannedOutflow: 1100,
        plannedNetMovement: -1100,
        endingProjectedBalance: 100,
      });
      expect(result.timeline.find(point => point.date === '2026-01-02')).toMatchObject({
        actualNetMovement: 0,
        plannedNetMovement: -1100,
        projectedBalance: 100,
      });
      expect(result.upcoming).toEqual([
        expect.objectContaining({
          journalId: 'planned-rent',
          amount: -1100,
          plannedPaymentId: 'rent',
        }),
      ]);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('calculateReportHealth', () => {
    it('emits explicit diagnostics for incomplete or contradictory report data', () => {
      const result = calculateReportHealth({
        targetCurrency: 'USD',
        supportedAccountSubtypes: ['CREDIT_CARD'],
        accounts: [
          { id: 'archived', name: 'Archived', accountType: 'EXPENSE', archivedAt: DAY_1 },
          {
            id: 'unknown-subtype',
            name: 'Unknown',
            accountType: 'EXPENSE',
            accountSubtype: 'MYSTERY',
          },
        ],
        actualFacts: [
          {
            journalId: 'unbalanced',
            transactionId: 'unbalanced-debit',
            journalDate: DAY_1,
            journalStatus: 'POSTED',
            accountId: 'archived',
            accountType: 'EXPENSE',
            transactionType: 'DEBIT',
            amount: 10,
            currencyCode: 'EUR',
          },
          {
            journalId: 'unbalanced',
            transactionId: 'unbalanced-credit',
            journalDate: DAY_1,
            journalStatus: 'POSTED',
            accountId: 'missing-account',
            accountType: 'ASSET',
            transactionType: 'CREDIT',
            amount: 8,
            currencyCode: 'EUR',
          },
          {
            journalId: 'planned-in-actuals',
            transactionId: 'planned-line',
            journalDate: DAY_2,
            journalStatus: 'PLANNED',
            accountId: 'archived',
            accountType: 'EXPENSE',
            transactionType: 'DEBIT',
            amount: 4,
            currencyCode: 'USD',
          },
        ],
        journals: [
          { id: 'reversal-pair', originalJournalId: 'original', reversingJournalId: 'reversal' },
        ],
        balanceChecks: [{ accountId: 'archived', storedBalance: 20, computedBalance: 10 }],
      });

      expect(result.isHealthy).toBe(false);
      expect(result.diagnostics.map(diagnostic => diagnostic.code)).toEqual(
        expect.arrayContaining([
          'UNBALANCED_JOURNAL',
          'MISSING_ACCOUNT_REFERENCE',
          'MISSING_EXCHANGE_RATE',
          'PLANNED_IN_ACTUALS',
          'ARCHIVED_ACCOUNT_ACTIVITY',
          'STALE_BALANCE_PROJECTION',
          'UNSUPPORTED_ACCOUNT_SUBTYPE',
        ]),
      );
      expect(result.summary.errorCount).toBeGreaterThan(0);
      expect(result.summary.warningCount).toBeGreaterThan(0);
    });

    it('returns a healthy result for balanced, complete posted data', () => {
      const result = calculateReportHealth({
        targetCurrency: 'USD',
        supportedAccountSubtypes: ['BANK_CHECKING', 'FOOD'],
        accounts: [
          {
            id: 'checking',
            name: 'Checking',
            accountType: 'ASSET',
            accountSubtype: 'BANK_CHECKING',
          },
          { id: 'food', name: 'Food', accountType: 'EXPENSE', accountSubtype: 'FOOD' },
        ],
        actualFacts: [
          {
            journalId: 'balanced',
            transactionId: 'balanced-debit',
            journalDate: DAY_1,
            journalStatus: 'POSTED',
            accountId: 'food',
            accountType: 'EXPENSE',
            accountSubtype: 'FOOD',
            transactionType: 'DEBIT',
            amount: 10,
            currencyCode: 'USD',
          },
          {
            journalId: 'balanced',
            transactionId: 'balanced-credit',
            journalDate: DAY_1,
            journalStatus: 'POSTED',
            accountId: 'checking',
            accountType: 'ASSET',
            accountSubtype: 'BANK_CHECKING',
            transactionType: 'CREDIT',
            amount: 10,
            currencyCode: 'USD',
          },
        ],
      });

      expect(result).toEqual({
        isHealthy: true,
        diagnostics: [],
        summary: { errorCount: 0, warningCount: 0, infoCount: 0 },
      });
    });

    it('does not flag multi-currency journals when conversion creates a small imbalance', () => {
      const result = calculateReportHealth({
        targetCurrency: 'USD',
        supportedAccountSubtypes: ['FOOD', 'BANK_CHECKING'],
        accounts: [
          { id: 'food', name: 'Food', accountType: 'EXPENSE', accountSubtype: 'FOOD' },
          {
            id: 'checking',
            name: 'Checking',
            accountType: 'ASSET',
            accountSubtype: 'BANK_CHECKING',
          },
        ],
        actualFacts: [
          {
            journalId: 'fx-expense',
            transactionId: 'fx-expense-debit',
            journalDate: DAY_1,
            journalStatus: 'POSTED',
            accountId: 'food',
            accountType: 'EXPENSE',
            accountSubtype: 'FOOD',
            transactionType: 'DEBIT',
            amount: 100,
            currencyCode: 'EUR',
            historicalBaseAmount: 110.01,
          },
          {
            journalId: 'fx-expense',
            transactionId: 'fx-expense-credit',
            journalDate: DAY_1,
            journalStatus: 'POSTED',
            accountId: 'checking',
            accountType: 'ASSET',
            accountSubtype: 'BANK_CHECKING',
            transactionType: 'CREDIT',
            amount: 110,
            currencyCode: 'USD',
            historicalBaseAmount: 110,
          },
        ],
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.summary.errorCount).toBe(0);
    });

    it('ignores diagnostics for activity outside the selected report period', () => {
      const result = calculateReportHealth({
        period: { startDate: DAY_2, endDate: DAY_2 },
        targetCurrency: 'USD',
        accounts: [
          { id: 'food', name: 'Food', accountType: 'EXPENSE' },
          { id: 'checking', name: 'Checking', accountType: 'ASSET' },
        ],
        actualFacts: [
          {
            journalId: 'outside-period',
            transactionId: 'outside-period-debit',
            journalDate: DAY_1,
            journalStatus: 'POSTED',
            accountId: 'food',
            accountType: 'EXPENSE',
            transactionType: 'DEBIT',
            amount: 10,
            currencyCode: 'USD',
          },
          {
            journalId: 'outside-period',
            transactionId: 'outside-period-credit',
            journalDate: DAY_1,
            journalStatus: 'POSTED',
            accountId: 'checking',
            accountType: 'ASSET',
            transactionType: 'CREDIT',
            amount: 8,
            currencyCode: 'USD',
          },
        ],
      });

      expect(result).toEqual({
        isHealthy: true,
        diagnostics: [],
        summary: { errorCount: 0, warningCount: 0, infoCount: 0 },
      });
    });

    it('uses debit and credit sides for journal validation across account types', () => {
      const result = calculateReportHealth({
        targetCurrency: 'USD',
        supportedAccountSubtypes: ['BANK_CHECKING', 'SALARY'],
        accounts: [
          {
            id: 'checking',
            name: 'Checking',
            accountType: 'ASSET',
            accountSubtype: 'BANK_CHECKING',
          },
          { id: 'salary', name: 'Salary', accountType: 'INCOME', accountSubtype: 'SALARY' },
        ],
        actualFacts: [
          {
            journalId: 'salary-income',
            transactionId: 'salary-income-debit',
            journalDate: DAY_1,
            journalStatus: 'POSTED',
            accountId: 'checking',
            accountType: 'ASSET',
            accountSubtype: 'BANK_CHECKING',
            transactionType: 'DEBIT',
            amount: 1000,
            currencyCode: 'USD',
            historicalBaseAmount: 1000,
          },
          {
            journalId: 'salary-income',
            transactionId: 'salary-income-credit',
            journalDate: DAY_1,
            journalStatus: 'POSTED',
            accountId: 'salary',
            accountType: 'INCOME',
            accountSubtype: 'SALARY',
            transactionType: 'CREDIT',
            amount: 1000,
            currencyCode: 'USD',
            historicalBaseAmount: 1000,
          },
        ],
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.summary.errorCount).toBe(0);
    });
  });
});
