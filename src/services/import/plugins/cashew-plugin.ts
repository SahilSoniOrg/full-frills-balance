import { IconName } from '@/src/types/domainIcons';
import { generator } from '@/src/data/database/idGenerator';
import {
  AccountSubtype,
  AccountType,
  AccountId,
  BudgetId,
  JournalDisplayType,
  JournalId,
  TransactionId,
} from '@/src/types/domain';

import { BatchImportData } from '@/src/data/repositories/importTypes';
import { canonicalImportFromBatchImportData } from '@/src/services/import/canonicalImportAdapter';
import { parseTimestampMs } from '@/src/services/import/plugins/importPluginHelpers';
import { ImportFileContext, ImportPlugin, ParsedImportResult } from '@/src/services/import/types';
import { files } from '@/src/utils/files';
import { logger } from '@/src/utils/logger';
import * as SQLite from 'expo-sqlite';

const CASHEW_DB_NAME = 'cashew_import.sqlite';
const SQLITE_MAGIC = 'SQLite format 3\x00'; // SQLite magic header

// --- Cashew DB Interfaces ---
interface CashewWallet {
  wallet_pk: string;
  name: string;
  colour: string;
  icon_name: string;
  currency: string | null;
  pinned: number;
  order: number;
  // wallet_fk removed as it's self-referential or not needed in this context
  budget_transaction_filters: string | null;
  member_transaction_filters: string | null;
  shared_key: string | null;
  shared_owner_member: number | null;
  shared_date_updated: number | null;
  shared_members: string | null;
  shared_all_members_ever: string | null;
  is_absolute_spending_limit: number;
}

interface CashewCategory {
  category_pk: string;
  name: string | null;
  colour: string | null;
  icon_name: string | null;
  income: number; // 1 or 0
  main_category_pk: string | null;
}

interface CashewTransaction {
  transaction_pk: string;
  name: string | null;
  amount: number;
  note: string | null;
  category_fk: string;
  wallet_fk: string;
  date_created: number; // Seconds since epoch
  income: number; // 1 (income) or 0 (expense)
  type: number | null; // 0=default, 1=upcoming, 2=subscription, 3=repetitive, 4=debt, 5=credit
  paired_transaction_fk: string | null;
  paid: number; // 1 or 0
  period_length: number | null;
  reoccurrence: number | null; // 0=custom, 1=daily, 2=weekly, 3=monthly, 4=yearly
  end_date: number | null;
  objective_loan_fk: string | null;
}

interface CashewBudget {
  budget_pk: string;
  name: string;
  amount: number;
  start_date: number; // Seconds since epoch
  wallet_fks: string | null; // JSON array
  category_fks: string | null; // JSON array
  income: number; // 1 or 0
  archived: number; // 1 or 0
}

interface CashewScannerTemplate {
  scanner_template_pk: string;
  date_created: string; // Original type was string, keeping it.
  date_time_modified: string | null;
  template_name: string;
  contains: string;
  title_transaction_before: string | null;
  title_transaction_after: string | null;
  amount_transaction_before: string | null;
  amount_transaction_after: string | null;
  default_category_fk: string;
  wallet_fk: string;
  ignore: number;
}

interface CashewObjective {
  objective_pk: string;
  type: number; // 0: goal, 1: loan
  name: string;
  amount: number;
  order: number;
  colour: string | null;
  date_created: string;
  end_date: string | null;
  date_time_modified: string | null;
  icon_name: string | null;
  emoji_icon_name: string | null;
  income: number; // 0: borrowed (liability), 1: lent (asset)
  pinned: number;
  archived: number;
  wallet_fk: string;
}

interface CashewAppSetting {
  settings_pk: number;
  settings_json: string;
  date_updated: string;
}

// Map cashew icon (string) to app icon (IconName).
const getAppIconFromCashewIcon = (cashewIcon: string | null): IconName => {
  if (!cashewIcon) return 'star';
  const mapping: Record<string, IconName> = {
    'cutlery.png': 'coffee',
    'groceries.png': 'shoppingBag',
    'shopping.png': 'shoppingCart',
    'tram.png': 'bus',
    'popcorn.png': 'film',
    'bills.png': 'receipt',
    'gift.png': 'sparkles',
    'flower.png': 'sparkles',
    'briefcase.png': 'briefcase',
    'plane.png': 'bus',
    'coin.png': 'transaction',
    'bank.png': 'bank',
    'wallet.png': 'creditCard',
    'home.png': 'home',
    'car.png': 'bus',
    'heart.png': 'heart',
    'music.png': 'playSquare',
    'game-controller.png': 'playSquare',
    'camera.png': 'film',
    'phone.png': 'messageCircle',
    'laptop.png': 'database',
    'book.png': 'document',
    'coffee.png': 'coffee',
    'dumbbell.png': 'trendingUp',
    'stethoscope.png': 'shieldCheck',
    'graduation-cap.png': 'briefcase',
    'shirt.png': 'shoppingBag',
    'beach-umbrella.png': 'palette',
  };
  return mapping[cashewIcon] || 'star';
};

const mapFrequency = (reoccurrence: number | null): string => {
  switch (reoccurrence) {
    case 1:
      return 'DAILY';
    case 2:
      return 'WEEKLY';
    case 3:
      return 'MONTHLY';
    case 4:
      return 'YEARLY';
    case 0:
      return 'MONTHLY'; // Default custom to Monthly for now
    default:
      return 'MONTHLY';
  }
};

export const cashewPlugin: ImportPlugin = {
  id: 'cashew',
  name: 'Cashew Wallet',
  description: 'Restore from a Cashew Wallet raw database backup (.db or .sql)',
  icon: '🥜',

  detect(context: ImportFileContext): boolean {
    // 1. Check filename
    const isCashewExt =
      context.name.toLowerCase().includes('cashew') ||
      context.name.toLowerCase().endsWith('.sql') ||
      context.name.toLowerCase().endsWith('.db') ||
      context.name.toLowerCase().endsWith('.sqlite');

    // 2. Check Magic Header in rawBytes
    if (!context.rawBytes || context.rawBytes.length < 16) return false;

    let hasMagicHeader = true;
    for (let i = 0; i < SQLITE_MAGIC.length; i++) {
      if (context.rawBytes[i] !== SQLITE_MAGIC.charCodeAt(i)) {
        hasMagicHeader = false;
        break;
      }
    }

    return isCashewExt && hasMagicHeader;
  },

  async parse(
    context: ImportFileContext,
    options: {
      defaultCurrency: string;
      onProgress?: (message: string, progress: number) => void;
    },
  ): Promise<ParsedImportResult> {
    const { defaultCurrency: workplaceCurrency, onProgress } = options;
    logger.info('[CashewPlugin] Parsing SQLite database...');
    onProgress?.('Opening backup file...', 0.1);

    if (!context.rawBytes) {
      throw new Error('Raw file data is missing.');
    }

    const sqliteDir = `${files.document}SQLite`;
    const tempDbPath = `${sqliteDir}/${CASHEW_DB_NAME}`;

    try {
      // Ensure SQLite directory exists
      await files.ensureDirectory(sqliteDir);

      // Copy file to SQLite directory for expo-sqlite to open it
      await files.copy(context.uri, tempDbPath);

      // Open SQLite Database
      onProgress?.('Extracting database records...', 0.2);
      const db = await SQLite.openDatabaseAsync(CASHEW_DB_NAME);

      // Fetch Data
      const wallets: CashewWallet[] = await db.getAllAsync<CashewWallet>(
        'SELECT wallet_pk, name, colour, icon_name, currency, pinned, "order", budget_transaction_filters, member_transaction_filters, shared_key, shared_owner_member, shared_date_updated, shared_members, shared_all_members_ever, is_absolute_spending_limit FROM wallets',
      );
      const categories: CashewCategory[] = await db.getAllAsync<CashewCategory>(
        'SELECT category_pk, name, colour, icon_name, income, main_category_pk FROM categories',
      );

      // Fetch all transactions including unpaid/recurring
      const allTransactions: CashewTransaction[] = await db.getAllAsync<CashewTransaction>(
        'SELECT transaction_pk, name, amount, note, category_fk, wallet_fk, date_created, income, type, paired_transaction_fk, paid, period_length, reoccurrence, end_date, objective_loan_fk FROM transactions',
      );
      const budgets: CashewBudget[] = await db.getAllAsync(
        'SELECT budget_pk, name, amount, start_date, wallet_fks, category_fks, income, archived FROM budgets',
      );
      const scannerTemplates: CashewScannerTemplate[] = await db.getAllAsync(
        'SELECT scanner_template_pk, date_created, date_time_modified, template_name, contains, title_transaction_before, title_transaction_after, amount_transaction_before, amount_transaction_after, default_category_fk, wallet_fk, ignore FROM scanner_templates',
      );
      const objectives: CashewObjective[] = await db.getAllAsync(
        'SELECT objective_pk, type, name, amount, "order", colour, date_created, end_date, date_time_modified, icon_name, emoji_icon_name, income, pinned, archived, wallet_fk FROM objectives',
      );
      const appSettings: CashewAppSetting[] = await db.getAllAsync(
        'SELECT settings_pk, settings_json, date_updated FROM app_settings LIMIT 1',
      );

      const data: BatchImportData = {
        accounts: [],
        journals: [],
        transactions: [],
        plannedPayments: [],
        budgets: [],
        budgetScopes: [],
        currencies: [],
        exchangeRates: [],
        accountMetadata: [],
        journalMetadata: [],
        balanceSnapshots: [],
        transactionAutoPostRules: [],
      };

      const currencyMap = new Map<string, string>();

      // 1. Map Wallets to Accounts
      onProgress?.('Mapping wallets and categories...', 0.4);
      const accountsMap = new Map<string, AccountId>(); // Cashew wallet_pk -> App Account ID
      const walletCurrencies = new Map<string, string>();

      for (const w of wallets) {
        const newId = generator() as AccountId;
        accountsMap.set(w.wallet_pk, newId);
        const currency = (w.currency || workplaceCurrency).toUpperCase();
        walletCurrencies.set(w.wallet_pk, currency);
        currencyMap.set(w.wallet_pk, currency);

        data.accounts.push({
          id: newId,
          name: w.name,
          accountType: 'ASSET',
          currencyCode: currency,
          icon: getAppIconFromCashewIcon(w.icon_name),
          orderNum: w.order,
        });
      }

      // 2. Objectives (Loans only for now)
      for (const objective of objectives) {
        if (objective.type === 1) {
          // Loan
          const isLent = objective.income === 1;
          const accountId = objective.objective_pk as AccountId;
          data.accounts.push({
            id: accountId,
            name: `Loan: ${objective.name}`,
            accountType: isLent ? AccountType.ASSET : AccountType.LIABILITY,
            accountSubtype: AccountSubtype.LOAN,
            currencyCode: currencyMap.get(objective.wallet_fk) || workplaceCurrency,
            icon: (objective.icon_name as IconName) || 'handshake',
            orderNum: objective.order,
            createdAt: new Date(objective.date_created).getTime(),
            updatedAt: objective.date_time_modified
              ? new Date(objective.date_time_modified).getTime()
              : undefined,
          });

          // Add metadata for the loan
          data.accountMetadata!.push({
            id: generator(),
            accountId: accountId,
            notes: `Initial Amount: ${objective.amount}\nCreated: ${objective.date_created}${objective.end_date ? `\nEnd Date: ${objective.end_date}` : ''}`,
            createdAt: new Date(objective.date_created).getTime(),
          });
        }
      }

      // 3. Map Categories to Accounts (Income/Expense)
      const categoriesMap = new Map<string, AccountId>(); // Cashew category_pk -> App Category ID
      const parentCategoryMap = new Map<string, AccountId>(); // category_pk -> main_category_pk

      // First pass: create all categories
      for (const c of categories) {
        const newId = generator() as AccountId;
        categoriesMap.set(c.category_pk, newId);
        if (c.main_category_pk) {
          parentCategoryMap.set(c.category_pk, c.main_category_pk as AccountId);
        }

        data.accounts.push({
          id: newId,
          name: c.name || (c.category_pk === '0' ? 'Transfer / Correction' : 'Uncategorized'),
          accountType: c.income === 1 ? 'INCOME' : 'EXPENSE',
          currencyCode: workplaceCurrency,
          icon: getAppIconFromCashewIcon(c.icon_name),
        });
      }

      // Second pass: set parentAccountId for subcategories
      for (const [catPk, mainPk] of parentCategoryMap.entries()) {
        const accId = categoriesMap.get(catPk);
        const parentAccId = categoriesMap.get(mainPk);
        if (accId && parentAccId) {
          const acc = data.accounts.find(a => a.id === accId);
          if (acc) acc.parentAccountId = parentAccId;
        }
      }

      // 4. Special handling for category '0' (Transfer/Correction)
      const correctionCategoryPk = '0';
      const correctionAccountId = categoriesMap.get(correctionCategoryPk);
      if (correctionAccountId) {
        const acc = data.accounts.find(a => a.id === correctionAccountId);
        if (acc) {
          acc.name = 'Balance Adjustment';
          acc.icon = 'wrench';
        }
      }

      // 5. Map Transactions
      onProgress?.('Processing transactions...', 0.6);
      const processedCashewPks = new Set<string>();
      let skippedTransactions = 0;
      // Fallback categories for transactions with missing/unmapped category_fk
      let fallbackExpenseCategoryId: AccountId | undefined;
      let fallbackIncomeCategoryId: AccountId | undefined;

      const getFallbackCategoryId = (isIncomeTx: boolean): AccountId => {
        if (isIncomeTx) {
          if (!fallbackIncomeCategoryId) {
            fallbackIncomeCategoryId = generator() as AccountId;
            data.accounts.push({
              id: fallbackIncomeCategoryId,
              name: `Unknown Income (${workplaceCurrency})`,
              accountType: 'INCOME',
              currencyCode: workplaceCurrency,
              icon: 'help-circle',
            });
          }
          return fallbackIncomeCategoryId;
        } else {
          if (!fallbackExpenseCategoryId) {
            fallbackExpenseCategoryId = generator() as AccountId;
            data.accounts.push({
              id: fallbackExpenseCategoryId,
              name: `Unknown Expense (${workplaceCurrency})`,
              accountType: 'EXPENSE',
              currencyCode: workplaceCurrency,
              icon: 'help-circle',
            });
          }
          return fallbackExpenseCategoryId;
        }
      };

      for (const t of allTransactions) {
        if (processedCashewPks.has(t.transaction_pk)) continue;

        const isPaid = t.paid === 1;
        const journalDate = parseTimestampMs(t.date_created);
        const absoluteAmount = Math.abs(t.amount);
        const isIncome = t.income === 1;
        const walletCurrency = walletCurrencies.get(t.wallet_fk) || workplaceCurrency;

        // Case A: Transfer (category_fk === '0' AND paired_transaction_fk != null)
        if (t.category_fk === correctionCategoryPk && t.paired_transaction_fk) {
          const pair = allTransactions.find(pt => pt.transaction_pk === t.paired_transaction_fk);
          if (pair) {
            const fromAccId =
              t.amount < 0 ? accountsMap.get(t.wallet_fk) : accountsMap.get(pair.wallet_fk);
            const toAccId =
              t.amount > 0 ? accountsMap.get(t.wallet_fk) : accountsMap.get(pair.wallet_fk);
            const fromWalletPk = t.amount < 0 ? t.wallet_fk : pair.wallet_fk;
            const toWalletPk = t.amount > 0 ? t.wallet_fk : pair.wallet_fk;

            if (fromAccId && toAccId) {
              if (isPaid) {
                const journalId = generator() as JournalId;
                data.journals.push({
                  id: journalId,
                  journalDate,
                  currencyCode: walletCurrency,
                  status: 'POSTED',
                  totalAmount: absoluteAmount,
                  transactionCount: 2,
                  displayType: JournalDisplayType.TRANSFER,
                  description: t.name || 'Transfer',
                });

                data.transactions.push({
                  id: generator() as TransactionId,
                  accountId: fromAccId,
                  journalId,
                  amount: Math.abs(t.amount),
                  transactionType: 'CREDIT',
                  currencyCode: walletCurrencies.get(fromWalletPk) || walletCurrency,
                  transactionDate: journalDate,
                });

                data.transactions.push({
                  id: generator(),
                  accountId: toAccId,
                  journalId,
                  amount: Math.abs(pair.amount),
                  transactionType: 'DEBIT',
                  currencyCode: walletCurrencies.get(toWalletPk) || walletCurrency,
                  transactionDate: journalDate,
                });
              } else {
                // Planned Transfer
                if (t.reoccurrence === null) {
                  const journalId = generator() as JournalId;
                  data.journals.push({
                    id: journalId,
                    journalDate,
                    currencyCode: walletCurrency,
                    status: 'PLANNED',
                    totalAmount: absoluteAmount,
                    transactionCount: 2,
                    displayType: JournalDisplayType.TRANSFER,
                    description: t.name || 'Transfer',
                  });

                  data.transactions.push({
                    id: generator(),
                    accountId: fromAccId,
                    journalId,
                    amount: Math.abs(t.amount),
                    transactionType: 'CREDIT',
                    currencyCode: walletCurrencies.get(fromWalletPk) || walletCurrency,
                    transactionDate: journalDate,
                  });

                  data.transactions.push({
                    id: generator(),
                    accountId: toAccId,
                    journalId,
                    amount: Math.abs(pair.amount),
                    transactionType: 'DEBIT',
                    currencyCode: walletCurrencies.get(toWalletPk) || walletCurrency,
                    transactionDate: journalDate,
                  });
                } else {
                  data.plannedPayments!.push({
                    id: generator(),
                    name: t.name || 'Planned Transfer',
                    amount: absoluteAmount,
                    currencyCode: walletCurrency,
                    fromAccountId: fromAccId,
                    toAccountId: toAccId,
                    intervalN: t.period_length || 1,
                    intervalType: mapFrequency(t.reoccurrence),
                    startDate: journalDate,
                    nextOccurrence: journalDate,
                    status: 'ACTIVE',
                    isAutoPost: false,
                    endDate: t.end_date ? new Date(t.end_date * 1000).getTime() : undefined,
                    recurrenceDay: new Date(journalDate).getDate(),
                  });
                }
              }

              if (pair && pair.paid === t.paid) {
                processedCashewPks.add(t.transaction_pk);
                processedCashewPks.add(pair.transaction_pk);
                continue;
              }
            }
          }
        }

        // Case B: Normal Transaction or Correction or Recurring
        const accountId = accountsMap.get(t.wallet_fk);
        let categoryId = t.category_fk ? categoriesMap.get(t.category_fk) : undefined;
        if (!categoryId) {
          categoryId = getFallbackCategoryId(isIncome);
        }

        if (!accountId || !categoryId) {
          skippedTransactions++;
          continue;
        }

        const account = data.accounts.find(a => a.id === accountId);
        if (!account) {
          skippedTransactions++;
          continue;
        }

        if (isPaid) {
          const journalId = generator() as JournalId;
          data.journals.push({
            id: journalId,
            journalDate,
            currencyCode: walletCurrency,
            status: 'POSTED',
            totalAmount: absoluteAmount,
            transactionCount: t.objective_loan_fk ? 3 : 2,
            displayType: isIncome ? JournalDisplayType.INCOME : JournalDisplayType.EXPENSE,
            description: t.name || (isIncome ? 'Income' : 'Expense'),
            notes: t.note || undefined,
          });

          data.transactions.push({
            id: generator(),
            accountId,
            journalId,
            amount: absoluteAmount,
            transactionType: isIncome ? 'DEBIT' : 'CREDIT',
            currencyCode: walletCurrency,
            transactionDate: journalDate,
            notes: t.note || undefined,
          });

          data.transactions.push({
            id: generator(),
            accountId: categoryId,
            journalId,
            amount: absoluteAmount,
            transactionType: isIncome ? 'CREDIT' : 'DEBIT',
            currencyCode: walletCurrency,
            transactionDate: journalDate,
          });
        } else {
          if (t.reoccurrence === null) {
            const journalId = generator() as JournalId;
            data.journals.push({
              id: journalId,
              journalDate,
              currencyCode: walletCurrency,
              status: 'PLANNED',
              totalAmount: absoluteAmount,
              transactionCount: 2,
              displayType: isIncome ? JournalDisplayType.INCOME : JournalDisplayType.EXPENSE,
              description: t.name || (isIncome ? 'Income' : 'Expense'),
              notes: t.note || undefined,
            });

            data.transactions.push({
              id: generator(),
              accountId,
              journalId,
              amount: absoluteAmount,
              transactionType: isIncome ? 'DEBIT' : 'CREDIT',
              currencyCode: walletCurrency,
              transactionDate: journalDate,
              notes: t.note || undefined,
            });

            data.transactions.push({
              id: generator(),
              accountId: categoryId,
              journalId,
              amount: absoluteAmount,
              transactionType: isIncome ? 'CREDIT' : 'DEBIT',
              currencyCode: walletCurrency,
              transactionDate: journalDate,
            });
          } else if (data.plannedPayments) {
            data.plannedPayments!.push({
              id: generator(),
              name: t.name || 'Planned Payment',
              description: t.note || undefined,
              amount: absoluteAmount,
              currencyCode: walletCurrency,
              fromAccountId: isIncome ? categoryId : accountId,
              toAccountId: isIncome ? accountId : categoryId,
              intervalN: t.period_length || 1,
              intervalType: mapFrequency(t.reoccurrence),
              startDate: journalDate,
              nextOccurrence: journalDate,
              status: 'ACTIVE',
              isAutoPost: false,
              endDate: t.end_date ? new Date(t.end_date * 1000).getTime() : undefined,
              recurrenceDay: new Date(journalDate).getDate(),
            });
          }
        }

        processedCashewPks.add(t.transaction_pk);
      }

      // 6. Map Budgets
      onProgress?.('Mapping budgets and rules...', 0.8);
      if (budgets.length > 0 && data.budgets && data.budgetScopes) {
        for (const b of budgets) {
          const budgetId = generator();
          const startDate = new Date(b.start_date * 1000);
          const startMonth = startDate.toISOString().substring(0, 7);

          data.budgets.push({
            id: budgetId,
            name: b.name,
            amount: Math.abs(b.amount),
            currencyCode: workplaceCurrency,
            startMonth,
            active: b.archived === 0,
          });

          const parseFks = (fks: string | null): string[] => {
            try {
              return fks ? JSON.parse(fks) : [];
            } catch {
              return [];
            }
          };

          const walletFks = parseFks(b.wallet_fks);
          const categoryFks = parseFks(b.category_fks);

          for (const wFk of walletFks) {
            const accId = accountsMap.get(wFk);
            if (accId) {
              data.budgetScopes.push({
                id: generator(),
                budgetId: budgetId as BudgetId,
                accountId: accId,
              });
            }
          }

          for (const cFk of categoryFks) {
            const accId = categoriesMap.get(cFk);
            if (accId) {
              data.budgetScopes.push({
                id: generator(),
                budgetId: budgetId as BudgetId,
                accountId: accId,
              });
            }
          }
        }
      }

      // 7. Map SMS Rules
      if (scannerTemplates.length > 0 && data.transactionAutoPostRules) {
        for (const st of scannerTemplates) {
          const sourceAccId = accountsMap.get(st.wallet_fk);
          const categoryAccId = categoriesMap.get(st.default_category_fk);

          if (sourceAccId && categoryAccId) {
            data.transactionAutoPostRules.push({
              id: generator(),
              senderMatch: '*',
              bodyMatch: st.contains,
              isActive: true,
              sourceAccountId: sourceAccId,
              categoryAccountId: categoryAccId,
              conditionsJson: JSON.stringify([{ type: 'contains', value: st.contains }]),
              actionsJson: JSON.stringify([
                {
                  type: 'extract_amount',
                  before: st.amount_transaction_before,
                  after: st.amount_transaction_after,
                },
                {
                  type: 'extract_description',
                  before: st.title_transaction_before,
                  after: st.title_transaction_after,
                },
              ]),
            });
          }
        }
      }

      // 8. Map Exchange Rates
      if (appSettings.length > 0 && data.exchangeRates) {
        try {
          const settings = JSON.parse(appSettings[0].settings_json);
          const cachedRates = settings.cachedCurrencyExchange;
          if (cachedRates) {
            for (const [targetCurrency, rate] of Object.entries(cachedRates)) {
              data.exchangeRates.push({
                id: generator(),
                fromCurrency: workplaceCurrency,
                toCurrency: targetCurrency.toUpperCase(),
                rate: rate as number,
                effectiveDate: Date.now(),
                source: 'Cashew Backup',
              });
            }
          }
        } catch (e) {
          logger.warn('[CashewPlugin] Failed to parse exchange rates from settings', { error: e });
        }
      }

      // 9. Add Journal Metadata
      if (data.journalMetadata) {
        data.journals.forEach(journal => {
          data.journalMetadata!.push({
            id: generator(),
            journalId: journal.id,
            importSource: 'cashew',
            createdAt: Date.now(),
          });
        });
      }

      // Cleanup
      await db.closeAsync();
      await files.deleteFile(tempDbPath);

      onProgress?.('Finalizing...', 1.0);
      const workplace = { defaultCurrencyCode: workplaceCurrency };
      const canonical = canonicalImportFromBatchImportData(data, {
        importMetadata: {
          pluginId: 'cashew',
          workplace,
        },
      });

      return {
        canonical,
        workplace,
        stats: {
          accounts: data.accounts.length,
          transactions: data.transactions.length,
          journals: data.journals.length,
          budgets: data.budgets?.length || 0,
          plannedPayments: data.plannedPayments?.length || 0,
          auditLogs: 0,
          skippedTransactions,
        },
      };
    } catch (error) {
      await files.deleteFile(tempDbPath);
      throw error;
    }
  },
};
