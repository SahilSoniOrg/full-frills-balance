import { IconName } from '@/src/components/core/AppIcon';
import { Theme } from '@/src/constants/design-tokens';
import Account from '@/src/data/models/Account';
import {
  getAccountAccentColor,
  getAccountSections,
  getSectionColor,
} from '@/src/utils/accountCategory';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { logger } from '@/src/utils/logger';

export interface AccountCardViewModel {
  id: string;
  name: string;
  icon: IconName | null;
  accentColor: string;
  textColor: string;
  balanceText: string;
  monthlyIncomeText: string;
  monthlyExpenseText: string;
  showMonthlyStats: boolean;
  currencyCode: string;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  reconciledAt?: Date;
}

export interface AccountSectionViewModel {
  title: string;
  count: number;
  totalDisplay: string;
  totalColor: string;
  isCollapsed: boolean;
  data: AccountCardViewModel[];
}

interface BalancesByAccountId {
  balance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  currencyCode?: string;
}

interface TransformOptions {
  balancesByAccountId: Map<string, BalancesByAccountId | null>;
  defaultCurrency: string;
  showAccountMonthlyStats: boolean;
  isPrivacyMode: boolean;
  isLoading: boolean;
  collapsedSections: Set<string>;
  theme: Theme;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalIncome: number;
  totalExpense: number;
  expandedAccountIds: Set<string>;
  onContrast: (color: string) => string;
}

// OPTIMIZATION: Multi-layer caching to minimize re-renders and re-computations.
// 1. Static Metadata Cache (Name, Icons, Colors - invariant for account lifecycle)
const STATIC_META_CACHE = new Map<
  string,
  { accentColor: string; textColor: string; contrastColor: string }
>();

// 2. State-Based ViewModel Cache (Financial values, UI states)
// Using a two-generation "Bucket Cache" to provide smooth LRU-lite aging without full-wipe spikes.
let currentBucket = new Map<string, AccountCardViewModel>();
let oldBucket = new Map<string, AccountCardViewModel>();
const BUCKET_LIMIT = 1000;

export function transformAccountsToSections(
  accounts: Account[],
  options: TransformOptions,
): AccountSectionViewModel[] {
  const startTime = Date.now();
  let cacheHits = 0;
  let totalAccounts = 0;

  if (!accounts.length) return [];

  const {
    balancesByAccountId,
    defaultCurrency,
    showAccountMonthlyStats,
    isPrivacyMode,
    isLoading,
    collapsedSections,
    theme,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalIncome,
    totalExpense,
    expandedAccountIds,
    onContrast,
  } = options;

  const rawSections = getAccountSections(accounts);

  const sections = rawSections.map(section => {
    const sectionColor = getSectionColor(section.title, theme);

    let sectionTotal = 0;
    if (section.title === 'Assets') sectionTotal = totalAssets;
    else if (section.title === 'Liabilities') sectionTotal = totalLiabilities;
    else if (section.title === 'Equity') sectionTotal = totalEquity;
    else if (section.title === 'Income') sectionTotal = totalIncome;
    else if (section.title === 'Expenses') sectionTotal = totalExpense;

    const totalDisplay = isPrivacyMode
      ? '••••'
      : CurrencyFormatter.formatShort(sectionTotal, defaultCurrency);

    const typeAccounts = section.data;
    const accountsByParent = new Map<string, Account[]>();
    typeAccounts.forEach(a => {
      if (a.parentAccountId) {
        const children = accountsByParent.get(a.parentAccountId) || [];
        children.push(a);
        accountsByParent.set(a.parentAccountId, children);
      }
    });

    const rootAccounts = typeAccounts.filter(
      a => !a.parentAccountId || !typeAccounts.find(p => p.id === a.parentAccountId),
    );
    const flattenedData: AccountCardViewModel[] = [];

    const flatten = (account: Account, depth: number) => {
      totalAccounts++;
      const balanceData = balancesByAccountId.get(account.id) || null;
      const balance = balanceData?.balance || 0;
      const monthlyIncome = balanceData?.monthlyIncome || 0;
      const monthlyExpenses = balanceData?.monthlyExpenses || 0;
      const isExpanded = expandedAccountIds.has(account.id);
      const children = accountsByParent.get(account.id) || [];

      // CACHE KEY: Specific to THIS instance's volatile state
      // M-5 FIX: Remove isLoading from the key to preserve cache once loading finishes.
      // M-5 FIX: Round numbers to 2 decimals to prevent floating-point drift misses.
      const roundedBalance = Math.round(balance * 100) / 100;
      const roundedIncome = Math.round(monthlyIncome * 100) / 100;
      const roundedExpenses = Math.round(monthlyExpenses * 100) / 100;
      const stateKey = `${account.id}:${roundedBalance}:${roundedIncome}:${roundedExpenses}:${isExpanded}:${isPrivacyMode}:${showAccountMonthlyStats}:${theme.asset}`;

      // Try current bucket then old bucket (aging)
      let viewModel = currentBucket.get(stateKey) || oldBucket.get(stateKey);

      if (viewModel) {
        cacheHits++;
        // If found in old bucket, migrate to current (promote)
        if (!currentBucket.has(stateKey)) {
          if (currentBucket.size >= BUCKET_LIMIT) {
            oldBucket = currentBucket;
            currentBucket = new Map();
          }
          currentBucket.set(stateKey, viewModel);
        }

        flattenedData.push(viewModel);
        if (isExpanded) {
          children.forEach(child => flatten(child, depth + 1));
        }
        return;
      }

      // LAYER 1: Static Metadata (Colors/Icons)
      const metaKey = `${account.id}:${account.accountType}:${account.name}:${theme.background}`;
      let meta = STATIC_META_CACHE.get(metaKey);

      if (!meta) {
        const accentColor = getAccountAccentColor(account.accountType, theme);
        const textColor = onContrast(accentColor);
        meta = { accentColor, textColor, contrastColor: textColor };
        STATIC_META_CACHE.set(metaKey, meta);
      }

      const currencyCode = balanceData?.currencyCode || account.currencyCode;
      const mask = '••••';

      const balanceText = isLoading
        ? '...'
        : isPrivacyMode
          ? mask
          : CurrencyFormatter.format(balance, currencyCode);
      const monthlyIncomeText = isLoading
        ? '...'
        : isPrivacyMode
          ? mask
          : CurrencyFormatter.format(monthlyIncome, currencyCode);
      const monthlyExpenseText = isLoading
        ? '...'
        : isPrivacyMode
          ? mask
          : CurrencyFormatter.format(monthlyExpenses, currencyCode);

      viewModel = {
        id: account.id,
        name: account.name,
        icon: account.icon || null,
        accentColor: meta.accentColor,
        textColor: meta.textColor,
        balanceText,
        monthlyIncomeText,
        monthlyExpenseText,
        showMonthlyStats: showAccountMonthlyStats,
        currencyCode: account.currencyCode,
        depth,
        hasChildren: children.length > 0,
        isExpanded,
        reconciledAt: account.reconciledAt,
      };

      // Bucket Management (Aging)
      if (currentBucket.size >= BUCKET_LIMIT) {
        oldBucket = currentBucket;
        currentBucket = new Map();
      }
      currentBucket.set(stateKey, viewModel);

      flattenedData.push(viewModel);

      if (isExpanded) {
        children.forEach(child => flatten(child, depth + 1));
      }
    };

    rootAccounts.forEach(root => flatten(root, 0));

    return {
      title: section.title,
      count: typeAccounts.length,
      totalDisplay,
      totalColor: sectionColor,
      isCollapsed: collapsedSections.has(section.title),
      data: flattenedData,
    };
  });

  const duration = Date.now() - startTime;
  logger.info(`[Trace] transformAccountsToSections: ${duration}ms`, {
    accounts: totalAccounts,
    cacheHits,
    hitRate: totalAccounts > 0 ? `${((cacheHits / totalAccounts) * 100).toFixed(1)}%` : '0%',
  });

  return sections;
}
