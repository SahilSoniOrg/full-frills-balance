import { generator } from '@/src/data/database/idGenerator';
import { CanonicalImportBuilder } from '@/src/services/import/canonicalImportBuilder';
import {
  mapToNearestAccountColor,
  normalizeHexColor,
  parseTimestampMs,
} from '@/src/services/import/plugins/importPluginHelpers';
import { ImportFileContext, ImportPlugin, ParsedImportResult } from '@/src/services/import/types';
import {
  AccountSubtype,
  AccountType,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/types/enums';
import { IconName } from '@/src/types/domainIcons';
import { files } from '@/src/utils/files';
import { logger } from '@/src/utils/logger';
import * as SQLite from 'expo-sqlite';

const CASHEW_DB_NAME = 'cashew_import.sqlite';
const SQLITE_MAGIC = 'SQLite format 3\x00';

// --- Cashew DB Interfaces ---
interface CashewWallet {
  wallet_pk: string;
  name: string;
  colour: string;
  icon_name: string;
  currency: string | null;
  pinned: number;
  order: number;
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
  income: number;
  main_category_pk: string | null;
}

interface CashewTransaction {
  transaction_pk: string;
  name: string | null;
  amount: number;
  note: string | null;
  category_fk: string | null;
  wallet_fk: string;
  date_created: number | string;
  income: number;
  type: number | null;
  paired_transaction_fk: string | null;
  paid: number;
  period_length: number | null;
  reoccurrence: number | null;
  end_date: number | null;
  objective_loan_fk: string | null;
}

interface CashewBudget {
  budget_pk: string;
  name: string;
  amount: number;
  start_date: number;
  wallet_fks: string | null;
  category_fks: string | null;
  income: number;
  archived: number;
}

interface CashewObjective {
  objective_pk: string;
  type: number;
  name: string;
  amount: number;
  order: number;
  colour: string | null;
  date_created: string;
  end_date: string | null;
  date_time_modified: string | null;
  icon_name: string | null;
  emoji_icon_name: string | null;
  income: number;
  pinned: number;
  archived: number;
  wallet_fk: string;
}

interface CashewAppSetting {
  settings_pk: number;
  settings_json: string;
  date_updated: string;
}

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

const mapFrequency = (reoccurrence: number | null): PlannedPaymentInterval => {
  switch (reoccurrence) {
    case 1:
      return PlannedPaymentInterval.DAILY;
    case 2:
      return PlannedPaymentInterval.WEEKLY;
    case 3:
      return PlannedPaymentInterval.MONTHLY;
    case 4:
      return PlannedPaymentInterval.YEARLY;
    default:
      return PlannedPaymentInterval.MONTHLY;
  }
};

export const cashewPlugin: ImportPlugin = {
  id: 'cashew',
  name: 'Cashew Wallet',
  description: 'Restore from a Cashew Wallet raw database backup (.db or .sql)',
  icon: '🥜',

  detect(context: ImportFileContext): boolean {
    const isCashewExt =
      context.name.toLowerCase().includes('cashew') ||
      context.name.toLowerCase().endsWith('.sql') ||
      context.name.toLowerCase().endsWith('.db') ||
      context.name.toLowerCase().endsWith('.sqlite');

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
      await files.ensureDirectory(sqliteDir);
      await files.copy(context.uri, tempDbPath);

      onProgress?.('Extracting database records...', 0.2);
      const db = await SQLite.openDatabaseAsync(CASHEW_DB_NAME);

      const wallets: CashewWallet[] = await db.getAllAsync<CashewWallet>(
        'SELECT wallet_pk, name, colour, icon_name, currency, pinned, "order", budget_transaction_filters, member_transaction_filters, shared_key, shared_owner_member, shared_date_updated, shared_members, shared_all_members_ever, is_absolute_spending_limit FROM wallets',
      );
      const categories: CashewCategory[] = await db.getAllAsync<CashewCategory>(
        'SELECT category_pk, name, colour, icon_name, income, main_category_pk FROM categories',
      );
      const allTransactions: CashewTransaction[] = await db.getAllAsync<CashewTransaction>(
        'SELECT transaction_pk, name, amount, note, category_fk, wallet_fk, date_created, income, type, paired_transaction_fk, paid, period_length, reoccurrence, end_date, objective_loan_fk FROM transactions',
      );
      const budgets: CashewBudget[] = await db.getAllAsync(
        'SELECT budget_pk, name, amount, start_date, wallet_fks, category_fks, income, archived FROM budgets',
      );
      const objectives: CashewObjective[] = await db.getAllAsync(
        'SELECT objective_pk, type, name, amount, "order", colour, date_created, end_date, date_time_modified, icon_name, emoji_icon_name, income, pinned, archived, wallet_fk FROM objectives',
      );
      const appSettings: CashewAppSetting[] = await db.getAllAsync(
        'SELECT settings_pk, settings_json, date_updated FROM app_settings LIMIT 1',
      );

      const builder = new CanonicalImportBuilder(workplaceCurrency);
      const workplace = { defaultCurrencyCode: workplaceCurrency };
      builder.setMetadata({
        pluginId: 'cashew',
        workplace,
      });

      // 1. Wallets
      onProgress?.('Mapping wallets and categories...', 0.4);
      const walletCurrencies = new Map<string, string>();

      for (const w of wallets) {
        const currency = (w.currency || workplaceCurrency).toUpperCase();
        walletCurrencies.set(w.wallet_pk, currency);
        builder.addAccount({
          id: w.wallet_pk,
          name: w.name,
          accountType: AccountType.ASSET,
          currencyCode: currency,
          icon: getAppIconFromCashewIcon(w.icon_name),
          color: mapToNearestAccountColor(normalizeHexColor(w.colour)),
          orderNum: w.order,
        });
      }

      // 2. Objectives (Loans)
      for (const objective of objectives) {
        if (objective.type === 1) {
          const isLent = objective.income === 1;
          builder.addAccount({
            id: objective.objective_pk,
            name: `Loan: ${objective.name}`,
            accountType: isLent ? AccountType.ASSET : AccountType.LIABILITY,
            accountSubtype: AccountSubtype.LOAN,
            currencyCode: walletCurrencies.get(objective.wallet_fk) || workplaceCurrency,
            icon: (objective.icon_name as IconName) || 'handshake',
            color: mapToNearestAccountColor(normalizeHexColor(objective.colour)),
            orderNum: objective.order,
          });
        }
      }

      // 3. Categories
      for (const c of categories) {
        builder.registerCategory({
          id: c.category_pk,
          name: c.name || (c.category_pk === '0' ? 'Balance Adjustment' : 'Uncategorized'),
          defaultType: c.income === 1 ? AccountType.INCOME : AccountType.EXPENSE,
          icon: getAppIconFromCashewIcon(c.icon_name),
          color: mapToNearestAccountColor(normalizeHexColor(c.colour)),
        });
      }

      // 4. Map Transactions
      onProgress?.('Processing transactions...', 0.6);
      const processedCashewPks = new Set<string>();
      let skippedTransactions = 0;

      for (const t of allTransactions) {
        if (processedCashewPks.has(t.transaction_pk)) continue;

        const isPaid = t.paid === 1;
        const journalDate = parseTimestampMs(t.date_created);
        const absoluteAmount = Math.abs(t.amount);
        const isIncome = t.income === 1;
        const walletCurrency = walletCurrencies.get(t.wallet_fk) || workplaceCurrency;

        // Case A: Transfer (category_fk === '0' AND paired_transaction_fk != null)
        if (t.category_fk === '0' && t.paired_transaction_fk) {
          const pair = allTransactions.find(pt => pt.transaction_pk === t.paired_transaction_fk);
          if (pair) {
            const fromWalletPk = t.amount < 0 ? t.wallet_fk : pair.wallet_fk;
            const toWalletPk = t.amount > 0 ? t.wallet_fk : pair.wallet_fk;

            if (isPaid) {
              builder.addTransaction({
                id: t.transaction_pk,
                date: journalDate,
                amount: absoluteAmount,
                currencyCode: walletCurrency,
                type: 'TRANSFER',
                sourceAccountId: fromWalletPk,
                targetAccountId: toWalletPk,
                description: t.name || 'Transfer',
                notes: t.note || undefined,
              });
            } else if (t.reoccurrence !== null) {
              builder.addPlannedPayment({
                id: t.transaction_pk,
                name: t.name || 'Transfer Rule',
                description: t.note || undefined,
                amount: absoluteAmount,
                currencyCode: walletCurrency,
                fromAccountId: fromWalletPk,
                toAccountId: toWalletPk,
                type: 'TRANSFER',
                intervalN: t.period_length || 1,
                intervalType: mapFrequency(t.reoccurrence),
                startDate: journalDate,
                nextOccurrence: journalDate,
                status: PlannedPaymentStatus.ACTIVE,
                isAutoPost: false,
                endDate: t.end_date ? new Date(t.end_date * 1000).getTime() : undefined,
                recurrenceDay: new Date(journalDate).getDate(),
              });
            }

            processedCashewPks.add(t.transaction_pk);
            processedCashewPks.add(pair.transaction_pk);
            continue;
          }
        }

        // Case B: Normal Transaction or Recurring
        if (!t.wallet_fk) {
          skippedTransactions++;
          continue;
        }

        if (isPaid) {
          builder.addTransaction({
            id: t.transaction_pk,
            date: journalDate,
            amount: absoluteAmount,
            currencyCode: walletCurrency,
            type: isIncome ? 'INCOME' : 'EXPENSE',
            sourceAccountId: t.wallet_fk,
            categoryId: t.category_fk || undefined,
            description: t.name || (isIncome ? 'Income' : 'Expense'),
            notes: t.note || undefined,
          });
        } else if (t.reoccurrence !== null) {
          builder.addPlannedPayment({
            id: t.transaction_pk,
            name: t.name || 'Planned Payment',
            description: t.note || undefined,
            amount: absoluteAmount,
            currencyCode: walletCurrency,
            fromAccountId: t.wallet_fk,
            toAccountId: t.category_fk || undefined,
            type: isIncome ? 'INCOME' : 'EXPENSE',
            intervalN: t.period_length || 1,
            intervalType: mapFrequency(t.reoccurrence),
            startDate: journalDate,
            nextOccurrence: journalDate,
            status: PlannedPaymentStatus.ACTIVE,
            isAutoPost: false,
            endDate: t.end_date ? new Date(t.end_date * 1000).getTime() : undefined,
            recurrenceDay: new Date(journalDate).getDate(),
          });
        }

        processedCashewPks.add(t.transaction_pk);
      }

      // 5. Budgets
      onProgress?.('Mapping budgets and rules...', 0.8);
      for (const b of budgets) {
        const startDate = new Date(b.start_date * 1000);
        const startMonth = startDate.toISOString().substring(0, 7);

        let categoryFks: string[] = [];
        try {
          if (b.category_fks) categoryFks = JSON.parse(b.category_fks);
        } catch {
          categoryFks = [];
        }

        builder.addBudget({
          id: b.budget_pk,
          name: b.name,
          amount: Math.abs(b.amount),
          currencyCode: workplaceCurrency,
          startMonth,
          active: b.archived === 0,
          categoryIds: categoryFks,
        });
      }

      // 6. Exchange Rates
      if (appSettings.length > 0) {
        try {
          const settings = JSON.parse(appSettings[0].settings_json);
          const cachedRates = settings.cachedCurrencyExchange;
          if (cachedRates) {
            for (const [targetCurrency, rate] of Object.entries(cachedRates)) {
              builder.addExchangeRate({
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

      // Cleanup
      await db.closeAsync();
      await files.deleteFile(tempDbPath);

      onProgress?.('Finalizing...', 1.0);
      const { canonical, issues } = builder.build();

      const skippedItems = issues.map(issue => ({
        type: issue.entity,
        id: issue.sourceId || 'builder-issue',
        reason: issue.message,
      }));

      return {
        canonical,
        workplace,
        stats: {
          accounts: canonical.accounts.length,
          transactions: canonical.transactions.length,
          journals: canonical.journals.length,
          budgets: canonical.budgets?.length || 0,
          plannedPayments: canonical.plannedPayments?.length || 0,
          auditLogs: 0,
          skippedTransactions:
            skippedTransactions + issues.filter(i => i.severity === 'error').length,
          skippedItems,
        },
      };
    } catch (error) {
      await files.deleteFile(tempDbPath);
      throw error;
    }
  },
};
