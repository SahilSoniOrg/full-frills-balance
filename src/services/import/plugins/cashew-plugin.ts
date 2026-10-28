import { CanonicalImportBuilder } from '@/src/services/import/canonicalImportBuilder';
import {
  mapToNearestAccountColor,
  normalizeHexColor,
  parseSerializedIds,
  parseTimestampMs,
} from '@/src/services/import/plugins/importPluginHelpers';
import { ImportFileContext, ImportPlugin, ParsedImportResult } from '@/src/services/import/types';
import {
  AccountSubtype,
  AccountType,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/types/enums';
import { Icon, type IconName } from '@/src/types/domainIcons';
import { files } from '@/src/utils/files';
import { countAccountsVsCategories } from '@/src/utils/accountCategory';
import { logger } from '@/src/utils/logger';
import * as SQLite from 'expo-sqlite';

const CASHEW_DB_NAME = 'cashew_import.sqlite';
const SQLITE_MAGIC = 'SQLite format 3\x00';

type CashewSqliteDb = {
  getAllAsync: <T>(sql: string, ...params: unknown[]) => Promise<T[]>;
  closeAsync: () => Promise<void>;
};

const WALLET_SELECT_COLUMNS = [
  'wallet_pk',
  'name',
  'colour',
  'icon_name',
  'currency',
  '"order"',
  'archived',
  'date_time_modified',
] as const;

const CATEGORY_SELECT_COLUMNS = [
  'category_pk',
  'name',
  'colour',
  'icon_name',
  'income',
  'main_category_pk',
  '"order"',
  'archived',
  'date_time_modified',
] as const;

const TRANSACTION_SELECT_COLUMNS = [
  'transaction_pk',
  'name',
  'amount',
  'note',
  'category_fk',
  'sub_category_fk',
  'wallet_fk',
  'date_created',
  'income',
  'type',
  'paired_transaction_fk',
  'paid',
  'period_length',
  'reoccurrence',
  'end_date',
  'objective_loan_fk',
  'objective_fk',
] as const;

const BUDGET_SELECT_COLUMNS = [
  'budget_pk',
  'name',
  'amount',
  'start_date',
  'wallet_fks',
  'category_fks',
  'income',
  'archived',
  'period_length',
  'reoccurrence',
] as const;

const OBJECTIVE_SELECT_COLUMNS = [
  'objective_pk',
  'type',
  'name',
  'amount',
  '"order"',
  'colour',
  'date_created',
  'end_date',
  'date_time_modified',
  'icon_name',
  'emoji_icon_name',
  'income',
  'pinned',
  'archived',
  'wallet_fk',
] as const;

/** Prefer real columns; missing ones become NULL AS <name> so older backups still parse. */
const selectList = (columns: readonly string[], available: Set<string>): string =>
  columns
    .map(column => {
      const name = column.replace(/^"|"$/g, '');
      return available.has(name) ? column : `NULL AS ${name}`;
    })
    .join(', ');

const tableColumnSet = async (db: CashewSqliteDb, table: string): Promise<Set<string>> => {
  const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(info.map(row => row.name));
};

// --- Cashew DB Interfaces ---
interface CashewWallet {
  wallet_pk: string;
  name: string;
  colour: string;
  icon_name: string;
  currency: string | null;
  order: number;
  archived: number;
  date_time_modified: number | null;
}

interface CashewCategory {
  category_pk: string;
  name: string | null;
  colour: string | null;
  icon_name: string | null;
  income: number;
  main_category_pk: string | null;
  order: number;
  archived: number;
  date_time_modified: number | null;
}

interface CashewTransaction {
  transaction_pk: string;
  name: string | null;
  amount: number;
  note: string | null;
  category_fk: string | null;
  sub_category_fk: string | null;
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
  objective_fk: string | null;
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
  period_length: number;
  reoccurrence: number | null;
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

const normalizeCashewColor = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined;
  const flutterColor = value.trim().match(/^0x[0-9a-f]{8}$/i);
  return flutterColor ? `#${flutterColor[0].slice(-6)}` : normalizeHexColor(value);
};

/** Cashew uses a large negative sentinel for "never modified"; ignore those. */
const archivedAtFromCashew = (
  archived: number,
  dateTimeModified: number | string | null | undefined,
): number | undefined => {
  if (archived !== 1 || dateTimeModified === null || dateTimeModified === undefined) {
    return undefined;
  }
  if (typeof dateTimeModified === 'number' && dateTimeModified <= 0) {
    return undefined;
  }
  if (typeof dateTimeModified === 'string') {
    const asNumber = Number(dateTimeModified);
    if (Number.isFinite(asNumber) && asNumber <= 0) {
      return undefined;
    }
  }
  return parseTimestampMs(dateTimeModified);
};

const monthForTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getAppIconFromCashewIcon = (cashewIcon: string | null): IconName => {
  if (!cashewIcon) return Icon.Star;
  const mapping: Record<string, IconName> = {
    'cutlery.png': Icon.Coffee,
    'groceries.png': Icon.ShoppingBag,
    'shopping.png': Icon.ShoppingCart,
    'tram.png': Icon.Bus,
    'popcorn.png': Icon.Film,
    'bills.png': Icon.Receipt,
    'gift.png': Icon.Sparkles,
    'flower.png': Icon.Sparkles,
    'briefcase.png': Icon.Briefcase,
    'plane.png': Icon.Bus,
    'coin.png': Icon.Transaction,
    'bank.png': Icon.Bank,
    'wallet.png': Icon.CreditCard,
    'home.png': Icon.Home,
    'car.png': Icon.Bus,
    'heart.png': Icon.Heart,
    'music.png': Icon.PlaySquare,
    'game-controller.png': Icon.PlaySquare,
    'camera.png': Icon.Film,
    'phone.png': Icon.MessageCircle,
    'laptop.png': Icon.Database,
    'book.png': Icon.Document,
    'coffee.png': Icon.Coffee,
    'dumbbell.png': Icon.TrendingUp,
    'stethoscope.png': Icon.ShieldCheck,
    'graduation-cap.png': Icon.Briefcase,
    'shirt.png': Icon.ShoppingBag,
    'beach-umbrella.png': Icon.Palette,
  };
  return mapping[cashewIcon] || Icon.Star;
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
  description: 'Restore from a Cashew Wallet SQLite backup (.db, .sqlite, or .sql)',
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
      const db = (await SQLite.openDatabaseAsync(CASHEW_DB_NAME)) as CashewSqliteDb;

      // Older Cashew backups omit columns added in later app versions. Probe once
      // per table and SELECT missing fields as NULL instead of failing the restore.
      const [walletCols, categoryCols, transactionCols, budgetCols, objectiveCols] =
        await Promise.all([
          tableColumnSet(db, 'wallets'),
          tableColumnSet(db, 'categories'),
          tableColumnSet(db, 'transactions'),
          tableColumnSet(db, 'budgets'),
          tableColumnSet(db, 'objectives'),
        ]);

      const wallets: CashewWallet[] = await db.getAllAsync<CashewWallet>(
        `SELECT ${selectList(WALLET_SELECT_COLUMNS, walletCols)} FROM wallets`,
      );
      const categories: CashewCategory[] = await db.getAllAsync<CashewCategory>(
        `SELECT ${selectList(CATEGORY_SELECT_COLUMNS, categoryCols)} FROM categories ORDER BY ${
          categoryCols.has('order') ? '"order"' : 'rowid'
        }`,
      );
      const allTransactions: CashewTransaction[] = await db.getAllAsync<CashewTransaction>(
        `SELECT ${selectList(TRANSACTION_SELECT_COLUMNS, transactionCols)} FROM transactions`,
      );
      const budgets: CashewBudget[] = await db.getAllAsync<CashewBudget>(
        `SELECT ${selectList(BUDGET_SELECT_COLUMNS, budgetCols)} FROM budgets`,
      );
      const objectives: CashewObjective[] = await db.getAllAsync(
        `SELECT ${selectList(OBJECTIVE_SELECT_COLUMNS, objectiveCols)} FROM objectives`,
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
          color: mapToNearestAccountColor(normalizeCashewColor(w.colour)),
          orderNum: w.order,
          archivedAt: archivedAtFromCashew(w.archived, w.date_time_modified),
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
            // Lent loans are receivables (assets); borrowed loans are liabilities.
            accountSubtype: isLent ? AccountSubtype.RECEIVABLE : AccountSubtype.LOAN,
            currencyCode: walletCurrencies.get(objective.wallet_fk) || workplaceCurrency,
            icon: getAppIconFromCashewIcon(objective.icon_name),
            color: mapToNearestAccountColor(normalizeCashewColor(objective.colour)),
            orderNum: objective.order,
            archivedAt: archivedAtFromCashew(objective.archived, objective.date_time_modified),
          });
        }
      }

      // 3. Categories
      for (const c of categories) {
        builder.registerCategory({
          id: c.category_pk,
          name: c.name || (c.category_pk === '0' ? 'Balance Adjustment' : 'Uncategorized'),
          parentCategoryId: c.main_category_pk || undefined,
          orderNum: c.order,
          archivedAt: archivedAtFromCashew(c.archived, c.date_time_modified),
          defaultType: c.income === 1 ? AccountType.INCOME : AccountType.EXPENSE,
          icon: getAppIconFromCashewIcon(c.icon_name),
          color: mapToNearestAccountColor(normalizeCashewColor(c.colour)),
        });
      }

      const loansById = new Map(
        objectives
          .filter(objective => objective.type === 1)
          .map(objective => [objective.objective_pk, objective]),
      );

      // 4. Map Transactions
      onProgress?.('Processing transactions...', 0.6);
      const processedCashewPks = new Set<string>();
      const transactionsByPk = new Map(
        allTransactions.map(row => [row.transaction_pk, row] as const),
      );
      // Cashew only writes `paired_transaction_fk` on one side of a transfer.
      // Suppress only mirrors of rows that actually take the transfer path so a
      // failed pair (wrong category, unpaid with no recurrence, missing pair)
      // does not silently drop both sides.
      const takesTransferPath = (row: CashewTransaction): boolean => {
        if (String(row.category_fk) !== '0' || !row.paired_transaction_fk) return false;
        if (!transactionsByPk.has(row.paired_transaction_fk)) return false;
        return row.paid === 1 || row.reoccurrence !== null;
      };
      const pairedTransferTargets = new Set(
        allTransactions.flatMap(t =>
          takesTransferPath(t) && t.paired_transaction_fk ? [t.paired_transaction_fk] : [],
        ),
      );
      let skippedTransactions = 0;
      const pluginSkippedItems: { type: string; id: string; reason: string }[] = [];

      for (const t of allTransactions) {
        if (processedCashewPks.has(t.transaction_pk)) continue;
        if (!t.paired_transaction_fk && pairedTransferTargets.has(t.transaction_pk)) {
          processedCashewPks.add(t.transaction_pk);
          continue;
        }

        const isPaid = t.paid === 1;
        const journalDate = parseTimestampMs(t.date_created);
        const absoluteAmount = Math.abs(t.amount);
        const isIncome = t.income === 1;
        const walletCurrency = walletCurrencies.get(t.wallet_fk) || workplaceCurrency;

        // Case A: Transfer (category_fk === '0' AND paired_transaction_fk != null)
        if (takesTransferPath(t) && t.paired_transaction_fk) {
          const pair = transactionsByPk.get(t.paired_transaction_fk)!;
          const sourceTransaction = t.amount < 0 ? t : pair;
          const destinationTransaction = t.amount < 0 ? pair : t;
          const fromWalletPk = sourceTransaction.wallet_fk;
          const toWalletPk = destinationTransaction.wallet_fk;
          const sourceAmount = Math.abs(sourceTransaction.amount);
          const targetAmount = Math.abs(destinationTransaction.amount);
          const sourceCurrency = walletCurrencies.get(fromWalletPk) || workplaceCurrency;

          if (isPaid) {
            builder.addTransaction({
              id: t.transaction_pk,
              date: journalDate,
              amount: sourceAmount,
              targetAmount,
              currencyCode: sourceCurrency,
              type: 'TRANSFER',
              sourceAccountId: fromWalletPk,
              targetAccountId: toWalletPk,
              description: t.name || 'Transfer',
              notes: t.note || undefined,
            });
          } else {
            builder.addPlannedPayment({
              id: t.transaction_pk,
              name: t.name || 'Transfer Rule',
              description: t.note || undefined,
              amount: sourceAmount,
              currencyCode: sourceCurrency,
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

        // Savings-goal contributions (objective_fk) have no FFB equivalent yet.
        // Skip so they do not inflate expenses via Balance Correction (category 0).
        if (t.objective_fk && !t.objective_loan_fk) {
          skippedTransactions++;
          pluginSkippedItems.push({
            type: 'transaction',
            id: t.transaction_pk,
            reason: `Savings goal transaction '${t.name || t.transaction_pk}' was skipped (no FFB goal model).`,
          });
          processedCashewPks.add(t.transaction_pk);
          continue;
        }

        // Cashew stores loan movements as wallet transactions with an objective link.
        // Model them as transfers so lending and repayments do not become expenses.
        const linkedLoan = t.objective_loan_fk ? loansById.get(t.objective_loan_fk) : undefined;
        if (linkedLoan && t.wallet_fk) {
          const walletToLoan = t.amount < 0;
          const fromAccountId = walletToLoan ? t.wallet_fk : linkedLoan.objective_pk;
          const toAccountId = walletToLoan ? linkedLoan.objective_pk : t.wallet_fk;

          if (isPaid) {
            builder.addTransaction({
              id: t.transaction_pk,
              date: journalDate,
              amount: absoluteAmount,
              currencyCode: walletCurrency,
              type: 'TRANSFER',
              sourceAccountId: fromAccountId,
              targetAccountId: toAccountId,
              description: t.name || 'Loan movement',
              notes: t.note || undefined,
            });
          } else if (t.reoccurrence !== null) {
            builder.addPlannedPayment({
              id: t.transaction_pk,
              name: t.name || 'Loan payment',
              description: t.note || undefined,
              amount: absoluteAmount,
              currencyCode: walletCurrency,
              fromAccountId,
              toAccountId,
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
          continue;
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
            categoryId: t.sub_category_fk || t.category_fk || undefined,
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
            toAccountId: t.sub_category_fk || t.category_fk || undefined,
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
        if (b.income === 1) {
          pluginSkippedItems.push({
            type: 'budget',
            id: b.budget_pk,
            reason: `Income budget '${b.name}' was skipped (FFB budgets are expense-scoped).`,
          });
          continue;
        }

        const startDateMs = parseTimestampMs(b.start_date);
        const startDate = new Date(startDateMs);
        const categoryFks = parseSerializedIds(b.category_fks || undefined);
        const walletFks = parseSerializedIds(b.wallet_fks || undefined);

        builder.addBudget({
          id: b.budget_pk,
          name: b.name,
          amount: Math.abs(b.amount),
          currencyCode: workplaceCurrency,
          startMonth: monthForTimestamp(startDateMs),
          active: b.archived === 0,
          categoryIds: categoryFks,
          assetAccountIds: walletFks,
          intervalN: b.period_length || 1,
          intervalType: b.reoccurrence === null ? undefined : mapFrequency(b.reoccurrence),
          startDate: startDateMs,
          recurrenceDay: startDate.getDate(),
          recurrenceMonth: startDate.getMonth() + 1,
        });
      }

      // Cleanup
      await db.closeAsync();
      await files.deleteFile(tempDbPath);

      onProgress?.('Finalizing...', 1.0);
      const { canonical, issues } = builder.build();

      const skippedItems = [
        ...pluginSkippedItems,
        ...issues.map(issue => ({
          type: issue.entity,
          id: issue.sourceId || 'builder-issue',
          reason: issue.message,
        })),
      ];

      return {
        canonical,
        workplace,
        stats: {
          ...countAccountsVsCategories(canonical.accounts),
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
