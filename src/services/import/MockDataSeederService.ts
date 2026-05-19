import { generator as generateId } from '@/src/data/database/idGenerator';
import { AccountType } from '@/src/data/models/Account';
import { JournalStatus } from '@/src/data/models/Journal';
import { PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';
import { TransactionType } from '@/src/data/models/Transaction';
import {
  BatchImportData,
  importRepository,
  ImportedAccount,
  ImportedJournal,
  ImportedTransaction,
  ImportedBudget,
  ImportedBudgetScope,
  ImportedPlannedPayment,
} from '@/src/data/repositories/ImportRepository';
import { integrityService } from '@/src/services/integrity-service';
import { currencyInitService } from '@/src/services/currency-init-service';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { preferences } from '@/src/utils/preferences';
import { workplaceService } from '@/src/services/WorkplaceService';
import { logger } from '@/src/utils/logger';
import {
  WorkplaceId,
  AccountId,
  JournalId,
  PlannedPaymentId,
  TransactionId,
  BudgetId,
  JournalDisplayType,
} from '@/src/types/domain';
import { ImportStats } from './types';

export class MockDataSeederService {
  async seedMockData(
    onProgress?: (message: string, progress?: number) => void,
  ): Promise<ImportStats> {
    const targetWorkplaceId = 'demo_workspace' as WorkplaceId;
    logger.info(
      `[MockDataSeederService] Seeding mock data for demo workplace: ${targetWorkplaceId}`,
    );

    const onProgressSafe = (message: string, progress: number) => {
      onProgress?.(message, progress);
    };

    // Find or create the Demo Workspace
    onProgressSafe('Setting up Demo Workspace...', 0.02);
    let demoWorkplace = await workplaceService.getWorkplace(targetWorkplaceId);
    if (!demoWorkplace) {
      // Create a clean demo workplace record
      demoWorkplace = await workplaceService.createWorkplace('Demo Workspace', 'briefcase', {
        id: targetWorkplaceId,
        currencyCode: 'USD',
      });
    }

    // Now, whether it was newly created or already existing, we wipe its scoped data to start fresh.
    onProgressSafe('Wiping existing data...', 0.05);
    await integrityService.resetWorkplace(targetWorkplaceId, true);

    // Make sure name, icon, and defaultCurrencyCode are set correctly
    await workplaceService.updateWorkplace(targetWorkplaceId, {
      name: 'Demo Workspace',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    });

    // 2. Initialize default currencies
    onProgressSafe('Initializing currencies...', 0.1);
    await currencyInitService.initialize();

    // 3. Define unique IDs for all mock entities
    const accChecking = generateId() as AccountId;
    const accSavings = generateId() as AccountId;
    const accCash = generateId() as AccountId;
    const accCredit = generateId() as AccountId;
    const accEquity = generateId() as AccountId;

    const catSalary = generateId() as AccountId;
    const catGroceries = generateId() as AccountId;
    const catRent = generateId() as AccountId;
    const catDining = generateId() as AccountId;
    const catSubs = generateId() as AccountId;
    const catUtilities = generateId() as AccountId;
    const catTransport = generateId() as AccountId;
    const catEntertainment = generateId() as AccountId;

    // 4. Construct Accounts list
    const accounts: ImportedAccount[] = [
      {
        id: accChecking,
        name: 'Chase Checking',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        description: 'Primary checking account',
        icon: 'briefcase',
        orderNum: 1,
      },
      {
        id: accSavings,
        name: 'Ally Savings',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        description: 'Emergency fund & savings',
        icon: 'wallet',
        orderNum: 2,
      },
      {
        id: accCash,
        name: 'Cash Wallet',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        description: 'Physical cash on hand',
        icon: 'wallet',
        orderNum: 3,
      },
      {
        id: accCredit,
        name: 'Amex Gold Card',
        accountType: AccountType.LIABILITY,
        currencyCode: 'USD',
        description: 'Credit card for daily rewards',
        icon: 'creditCard',
        orderNum: 4,
      },
      {
        id: accEquity,
        name: 'Opening Balances (USD)',
        accountType: AccountType.EQUITY,
        currencyCode: 'USD',
        description: 'System account that stores opening balances',
        icon: 'scale',
        orderNum: 5,
      },
      {
        id: catSalary,
        name: 'Wages/Salary (USD)',
        accountType: AccountType.INCOME,
        currencyCode: 'USD',
        description: 'Income category',
        icon: 'trendingUp',
        orderNum: 6,
      },
      {
        id: catGroceries,
        name: 'Groceries (USD)',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
        description: 'Grocery stores and food markets',
        icon: 'tag',
        orderNum: 7,
      },
      {
        id: catRent,
        name: 'Housing/Rent (USD)',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
        description: 'Monthly rent or mortgage',
        icon: 'home',
        orderNum: 8,
      },
      {
        id: catDining,
        name: 'Dining Out (USD)',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
        description: 'Restaurants, cafes, and bars',
        icon: 'tag',
        orderNum: 9,
      },
      {
        id: catSubs,
        name: 'Subscriptions (USD)',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
        description: 'Recurring SaaS or media services',
        icon: 'notifications',
        orderNum: 10,
      },
      {
        id: catUtilities,
        name: 'Utilities (USD)',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
        description: 'Water, gas, electricity, internet',
        icon: 'tag',
        orderNum: 11,
      },
      {
        id: catTransport,
        name: 'Transport (USD)',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
        description: 'Gas, subway, public transit, Uber',
        icon: 'tag',
        orderNum: 12,
      },
      {
        id: catEntertainment,
        name: 'Entertainment (USD)',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
        description: 'Movies, concerts, events',
        icon: 'tag',
        orderNum: 13,
      },
    ];

    // 5. Construct Journals and Transactions list
    const journals: ImportedJournal[] = [];
    const transactions: ImportedTransaction[] = [];

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const getTimestamp = (daysAgo: number, hour: number = 10) => {
      const date = new Date(now - daysAgo * dayMs);
      date.setHours(hour, 0, 0, 0);
      return date.getTime();
    };

    // Helper to generate a single contiguous entry (Journal + 2 Transactions)
    const addEntry = ({
      description,
      notes,
      amount,
      sourceId,
      destId,
      daysAgo,
      hour = 10,
      displayType,
      plannedPaymentId,
    }: {
      description: string;
      notes?: string;
      amount: number;
      sourceId: AccountId;
      destId: AccountId;
      daysAgo: number;
      hour?: number;
      displayType: JournalDisplayType;
      plannedPaymentId?: PlannedPaymentId;
    }) => {
      const journalId = generateId() as JournalId;
      const timestamp = getTimestamp(daysAgo, hour);

      journals.push({
        id: journalId,
        journalDate: timestamp,
        description,
        notes,
        currencyCode: 'USD',
        status: JournalStatus.POSTED,
        totalAmount: amount,
        transactionCount: 2,
        displayType,
        plannedPaymentId,
      });

      // Credit (Source)
      transactions.push({
        id: generateId() as TransactionId,
        journalId,
        transactionDate: timestamp,
        accountId: sourceId,
        amount,
        transactionType: TransactionType.CREDIT,
        currencyCode: 'USD',
      });

      // Debit (Destination)
      transactions.push({
        id: generateId() as TransactionId,
        journalId,
        transactionDate: timestamp,
        accountId: destId,
        amount,
        transactionType: TransactionType.DEBIT,
        currencyCode: 'USD',
      });
    };

    // --- Opening Balances (60 Days Ago) ---
    // Checking: Debit checking (increase), Credit equity (decrease equity)
    addEntry({
      description: 'Opening Balance Chase Checking',
      amount: 5000,
      sourceId: accEquity,
      destId: accChecking,
      daysAgo: 60,
      hour: 9,
      displayType: JournalDisplayType.INCOME,
    });

    // Savings: Debit savings (increase), Credit equity
    addEntry({
      description: 'Opening Balance Ally Savings',
      amount: 15000,
      sourceId: accEquity,
      destId: accSavings,
      daysAgo: 60,
      hour: 9,
      displayType: JournalDisplayType.INCOME,
    });

    // Cash: Debit cash (increase), Credit equity
    addEntry({
      description: 'Opening Balance Cash Wallet',
      amount: 100,
      sourceId: accEquity,
      destId: accCash,
      daysAgo: 60,
      hour: 9,
      displayType: JournalDisplayType.INCOME,
    });

    // Credit Card: Credit card account (increase credit card liability, i.e. negative), Debit equity
    addEntry({
      description: 'Opening Balance Amex Gold',
      amount: 1000,
      sourceId: accCredit,
      destId: accEquity,
      daysAgo: 60,
      hour: 9,
      displayType: JournalDisplayType.EXPENSE,
    });

    // --- Transactions Chronology (60 Days Past) ---
    const generateMonthlyCycle = (offset: number) => {
      // Day 28: Salary Income
      addEntry({
        description: 'Wages/Salary',
        amount: 2500,
        sourceId: catSalary,
        destId: accChecking,
        daysAgo: 28 + offset,
        hour: 8,
        displayType: JournalDisplayType.INCOME,
      });

      // Day 28: Groceries
      addEntry({
        description: 'Whole Foods Market',
        amount: 112.5,
        sourceId: accChecking,
        destId: catGroceries,
        daysAgo: 28 + offset,
        hour: 18,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 26: Rent
      addEntry({
        description: 'Monthly Rent',
        amount: 1800,
        sourceId: accChecking,
        destId: catRent,
        daysAgo: 26 + offset,
        hour: 10,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 25: Spotify
      addEntry({
        description: 'Spotify Premium',
        amount: 9.99,
        sourceId: accChecking,
        destId: catSubs,
        daysAgo: 25 + offset,
        hour: 7,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 24: Gas / Transport
      addEntry({
        description: 'Chevron Gas Station',
        amount: 35.0,
        sourceId: accCredit,
        destId: catTransport,
        daysAgo: 24 + offset,
        hour: 15,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 23: Dining out
      addEntry({
        description: 'Local Pizzeria',
        amount: 42.0,
        sourceId: accChecking,
        destId: catDining,
        daysAgo: 23 + offset,
        hour: 20,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 21: Groceries
      addEntry({
        description: "Trader Joe's",
        amount: 98.2,
        sourceId: accChecking,
        destId: catGroceries,
        daysAgo: 21 + offset,
        hour: 11,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 20: Electricity
      addEntry({
        description: 'City Power & Light',
        amount: 115.0,
        sourceId: accChecking,
        destId: catUtilities,
        daysAgo: 20 + offset,
        hour: 14,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 18: Entertainment / Movie
      addEntry({
        description: 'AMC Theatres',
        amount: 75.0,
        sourceId: accCredit,
        destId: catEntertainment,
        daysAgo: 18 + offset,
        hour: 21,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 15: Internet
      addEntry({
        description: 'Comcast Xfinity',
        amount: 60.0,
        sourceId: accChecking,
        destId: catUtilities,
        daysAgo: 15 + offset,
        hour: 10,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 14: Groceries
      addEntry({
        description: 'Safeway Groceries',
        amount: 125.4,
        sourceId: accChecking,
        destId: catGroceries,
        daysAgo: 14 + offset,
        hour: 17,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 13: Salary Income
      addEntry({
        description: 'Wages/Salary',
        amount: 2500,
        sourceId: catSalary,
        destId: accChecking,
        daysAgo: 13 + offset,
        hour: 8,
        displayType: JournalDisplayType.INCOME,
      });

      // Day 12: Netflix Subscription
      addEntry({
        description: 'Netflix Inc.',
        amount: 15.49,
        sourceId: accCredit,
        destId: catSubs,
        daysAgo: 12 + offset,
        hour: 6,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 11: Transfer to Savings
      addEntry({
        description: 'Savings Deposit',
        amount: 500,
        sourceId: accChecking,
        destId: accSavings,
        daysAgo: 11 + offset,
        hour: 12,
        displayType: JournalDisplayType.TRANSFER,
      });

      // Day 10: Transport / Gas
      addEntry({
        description: 'Shell Oil',
        amount: 40.0,
        sourceId: accCredit,
        destId: catTransport,
        daysAgo: 10 + offset,
        hour: 9,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 8: Credit Card Payment
      addEntry({
        description: 'Amex Gold Payment',
        amount: 600,
        sourceId: accChecking,
        destId: accCredit,
        daysAgo: 8 + offset,
        hour: 14,
        displayType: JournalDisplayType.TRANSFER,
      });

      // Day 7: Groceries
      addEntry({
        description: 'Whole Foods Market',
        amount: 105.1,
        sourceId: accChecking,
        destId: catGroceries,
        daysAgo: 7 + offset,
        hour: 16,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 6: Coffee
      addEntry({
        description: 'Blue Bottle Coffee',
        amount: 12.5,
        sourceId: accCash,
        destId: catDining,
        daysAgo: 6 + offset,
        hour: 10,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 5: Dining
      addEntry({
        description: 'Ramen Restaurant',
        amount: 55.0,
        sourceId: accCredit,
        destId: catDining,
        daysAgo: 5 + offset,
        hour: 19,
        displayType: JournalDisplayType.EXPENSE,
      });

      // Day 3: Cash Withdrawal
      addEntry({
        description: 'ATM Cash Withdrawal',
        amount: 100,
        sourceId: accChecking,
        destId: accCash,
        daysAgo: 3 + offset,
        hour: 12,
        displayType: JournalDisplayType.TRANSFER,
      });

      // Day 2: Dining out / Lunch
      addEntry({
        description: 'Downtown Cafe',
        amount: 18.5,
        sourceId: accChecking,
        destId: catDining,
        daysAgo: 2 + offset,
        hour: 13,
        displayType: JournalDisplayType.EXPENSE,
      });
    };

    // Month 1: 31 to 60 days ago
    generateMonthlyCycle(30);

    // Month 2: 1 to 30 days ago
    generateMonthlyCycle(0);

    // 6. Budgets Configuration
    const budgetIdGroceries = generateId() as BudgetId;
    const budgetIdDining = generateId() as BudgetId;
    const budgetIdEntertainment = generateId() as BudgetId;

    const currentMonthStr = new Date().toISOString().substring(0, 7); // 'YYYY-MM'

    const budgets: ImportedBudget[] = [
      {
        id: budgetIdGroceries,
        name: 'Groceries Monthly Budget',
        amount: 450,
        currencyCode: 'USD',
        startMonth: currentMonthStr,
        active: true,
      },
      {
        id: budgetIdDining,
        name: 'Dining Out Monthly Budget',
        amount: 250,
        currencyCode: 'USD',
        startMonth: currentMonthStr,
        active: true,
      },
      {
        id: budgetIdEntertainment,
        name: 'Entertainment Monthly Budget',
        amount: 150,
        currencyCode: 'USD',
        startMonth: currentMonthStr,
        active: true,
      },
    ];

    const budgetScopes: ImportedBudgetScope[] = [
      {
        id: generateId(),
        budgetId: budgetIdGroceries,
        accountId: catGroceries,
      },
      {
        id: generateId(),
        budgetId: budgetIdDining,
        accountId: catDining,
      },
      {
        id: generateId(),
        budgetId: budgetIdEntertainment,
        accountId: catEntertainment,
      },
    ];

    // 7. Planned Payments Configuration
    const plannedPayments: ImportedPlannedPayment[] = [];

    // Salary: expected pay check in 1 day
    const nextSalaryDate = new Date();
    nextSalaryDate.setDate(nextSalaryDate.getDate() + 1);
    nextSalaryDate.setHours(0, 0, 0, 0);

    plannedPayments.push({
      id: generateId() as PlannedPaymentId,
      name: 'Salary Deposit',
      amount: 2500,
      currencyCode: 'USD',
      fromAccountId: catSalary,
      toAccountId: accChecking,
      intervalN: 2,
      intervalType: 'WEEKLY',
      startDate: getTimestamp(13),
      nextOccurrence: nextSalaryDate.getTime(),
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: false,
      recurrenceDay: nextSalaryDate.getDate(),
      recurrenceMonth: nextSalaryDate.getMonth() + 1,
    });

    // Monthly Rent: expected 1st day of next month
    const nextRentDate = new Date();
    nextRentDate.setMonth(nextRentDate.getMonth() + 1);
    nextRentDate.setDate(1);
    nextRentDate.setHours(0, 0, 0, 0);

    plannedPayments.push({
      id: generateId() as PlannedPaymentId,
      name: 'Rent Payment',
      amount: 1800,
      currencyCode: 'USD',
      fromAccountId: accChecking,
      toAccountId: catRent,
      intervalN: 1,
      intervalType: 'MONTHLY',
      startDate: getTimestamp(26),
      nextOccurrence: nextRentDate.getTime(),
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: false,
      recurrenceDay: nextRentDate.getDate(),
      recurrenceMonth: nextRentDate.getMonth() + 1,
    });

    // Netflix Subscription: expected in 18 days
    const nextNetflixDate = new Date();
    nextNetflixDate.setDate(nextNetflixDate.getDate() + 18);
    nextNetflixDate.setHours(0, 0, 0, 0);

    plannedPayments.push({
      id: generateId() as PlannedPaymentId,
      name: 'Netflix Subscription',
      amount: 15.49,
      currencyCode: 'USD',
      fromAccountId: accCredit,
      toAccountId: catSubs,
      intervalN: 1,
      intervalType: 'MONTHLY',
      startDate: getTimestamp(12),
      nextOccurrence: nextNetflixDate.getTime(),
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: true,
      recurrenceDay: nextNetflixDate.getDate(),
      recurrenceMonth: nextNetflixDate.getMonth() + 1,
    });

    // 8. Batch Insert
    onProgressSafe('Saving seeded records to database...', 0.3);
    const dataToInsert: BatchImportData = {
      accounts,
      journals,
      transactions,
      budgets,
      budgetScopes,
      plannedPayments,
    };

    await importRepository.batchInsert(targetWorkplaceId, dataToInsert, (msg, p) => {
      // scale insertion from 0.3 to 0.7
      onProgressSafe(msg, 0.3 + (p ?? 0) * 0.4);
    });

    // 9. Synchronize exchange rates for USD
    onProgressSafe('Updating exchange rates...', 0.75);
    try {
      await exchangeRateService.syncTodayRates('USD');
    } catch (e) {
      logger.warn('[MockDataSeederService] Rate sync failed for USD:', { error: e });
    }

    // 10. Verify data integrity & rebuild running balances
    onProgressSafe('Verifying database integrity...', 0.85);
    await integrityService.forceRunCheck(targetWorkplaceId, (msg, p) => {
      // scale integrity from 0.85 to 0.95
      onProgressSafe(msg, 0.85 + (p ?? 0) * 0.1);
    });

    // 11. Complete onboarding / Preferences setup
    onProgressSafe('Finalizing preferences...', 0.96);
    preferences.setActiveWorkplaceId(targetWorkplaceId);
    preferences.setOnboardingCompleted(true);

    logger.info('[MockDataSeederService] Seeding completed successfully.');
    onProgressSafe('Seeding completed successfully.', 1.0);

    return {
      accounts: accounts.length,
      journals: journals.length,
      transactions: transactions.length,
      budgets: budgets.length,
      plannedPayments: plannedPayments.length,
      auditLogs: 0,
      skippedTransactions: 0,
    };
  }
}

export const mockDataSeederService = new MockDataSeederService();
