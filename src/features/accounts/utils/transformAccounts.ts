import { IconName } from '@/src/components/core/AppIcon';
import { Theme } from '@/src/constants/design-tokens';
import Account from '@/src/data/models/Account';
import { AccountId, AccountType, PlainAccount } from '@/src/types/domain';
import {
  getAccountSections,
  getSectionColor,
  resolveAccountAppearance,
} from '@/src/utils/accountCategory';
import { getAccountIcon } from '@/src/utils/accountIcon';
import { isAccountArchived, getVisibleRoots } from '@/src/utils/accountArchive';
import { logger } from '@/src/utils/logger';

export interface AccountCardViewModel {
  id: AccountId;
  name: string;
  icon: IconName;
  accountType?: AccountType;
  /** Semantic account category color (asset/liability/etc.). */
  categoryColor: string;
  /** User-selected account identity color, falling back to categoryColor. */
  accountColor: string;
  textColor: string;
  /** Raw balance — presentational layer formats using screen privacy flag. */
  balance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  showMonthlyStats: boolean;
  currencyCode: string;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  reconciledAt?: Date;
  isArchived: boolean;
}

export interface AccountSectionViewModel {
  title: string;
  count: number;
  /** Raw section total — presentational layer formats using screen privacy flag. */
  total: number;
  totalColor: string;
  isCollapsed: boolean;
  data: AccountCardViewModel[];
  type?: string;
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
  { categoryColor: string; accountColor: string; textColor: string; contrastColor: string }
>();

// 2. State-Based ViewModel Cache (Financial values, UI states)
// Using a two-generation "Bucket Cache" to provide smooth LRU-lite aging without full-wipe spikes.
let currentBucket = new Map<string, AccountCardViewModel>();
let oldBucket = new Map<string, AccountCardViewModel>();
const BUCKET_LIMIT = 1000;

export function transformAccountsToSections(
  accounts: (Account | PlainAccount)[],
  options: TransformOptions,
): AccountSectionViewModel[] {
  const startTime = Date.now();
  let cacheHits = 0;
  let totalAccounts = 0;

  if (!accounts.length) return [];

  const {
    balancesByAccountId,
    showAccountMonthlyStats,
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
    const sectionColor = getSectionColor(section.type || section.title, theme);

    let sectionTotal = 0;
    if (section.type === AccountType.ASSET) sectionTotal = totalAssets;
    else if (section.type === AccountType.LIABILITY) sectionTotal = totalLiabilities;
    else if (section.type === AccountType.EQUITY) sectionTotal = totalEquity;
    else if (section.type === AccountType.INCOME) sectionTotal = totalIncome;
    else if (section.type === AccountType.EXPENSE) sectionTotal = totalExpense;

    const typeAccounts = section.data;
    const accountsByParent = new Map<string, (Account | PlainAccount)[]>();
    typeAccounts.forEach(a => {
      if (a.parentAccountId) {
        const children = accountsByParent.get(a.parentAccountId) || [];
        children.push(a);
        accountsByParent.set(a.parentAccountId, children);
      }
    });

    const rootAccounts = getVisibleRoots(typeAccounts);
    const flattenedData: AccountCardViewModel[] = [];

    const flatten = (account: Account | PlainAccount, depth: number) => {
      totalAccounts++;
      const balanceData = balancesByAccountId.get(account.id) || null;
      const balance = balanceData?.balance || 0;
      const monthlyIncome = balanceData?.monthlyIncome || 0;
      const monthlyExpenses = balanceData?.monthlyExpenses || 0;
      const isExpanded = expandedAccountIds.has(account.id);
      const children = accountsByParent.get(account.id) || [];

      // CACHE KEY: account identity + record version + rendered fields + volatile UI flags.
      // updatedAt covers WatermelonDB model mutations; name+icon+color cover PlainAccount snapshots
      // that may reconstruct fields without bumping updatedAt.
      // Privacy is intentionally excluded — leaves format from a screen-level flag.
      const updatedAtTs =
        account.updatedAt instanceof Date
          ? account.updatedAt.getTime()
          : account.updatedAt
            ? new Date(account.updatedAt).getTime()
            : 0;
      // Round financial values to 2dp to avoid fp drift causing phantom cache misses.
      const roundedBalance = Math.round(balance * 100) / 100;
      const roundedIncome = Math.round(monthlyIncome * 100) / 100;
      const roundedExpenses = Math.round(monthlyExpenses * 100) / 100;
      // hasChildren is keyed explicitly: child writes don't bump this account's updatedAt.
      const archivedAtTs =
        account.archivedAt instanceof Date
          ? account.archivedAt.getTime()
          : account.archivedAt
            ? new Date(account.archivedAt).getTime()
            : 0;
      const stateKey = `${account.id}:${updatedAtTs}:${archivedAtTs}:${account.name}:${account.icon ?? ''}:${account.color ?? ''}:${depth}:${children.length > 0}:${isExpanded}:${showAccountMonthlyStats}:${roundedBalance}:${roundedIncome}:${roundedExpenses}`;

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
      const metaKey = `${account.id}:${account.accountType}:${account.color ?? ''}:${theme.background}`;
      let meta = STATIC_META_CACHE.get(metaKey);

      if (!meta) {
        const { categoryColor, accentColor: accountColor } = resolveAccountAppearance(
          account,
          theme,
        );
        // Account cards use accountColor as their solid surface, so derive
        // readable foreground text from that surface.
        const textColor = onContrast(accountColor);
        meta = { categoryColor, accountColor, textColor, contrastColor: textColor };
        STATIC_META_CACHE.set(metaKey, meta);
      }

      const currencyCode = balanceData?.currencyCode || account.currencyCode;

      const createdViewModel: AccountCardViewModel = {
        id: account.id,
        name: account.name,
        icon: getAccountIcon(account),
        accountType: account.accountType,
        categoryColor: meta.categoryColor,
        accountColor: meta.accountColor,
        textColor: meta.textColor,
        balance,
        monthlyIncome,
        monthlyExpenses,
        showMonthlyStats: showAccountMonthlyStats || isExpanded,
        currencyCode,
        depth,
        hasChildren: children.length > 0,
        isExpanded,
        reconciledAt: account.reconciledAt
          ? account.reconciledAt instanceof Date
            ? account.reconciledAt
            : new Date(account.reconciledAt)
          : undefined,
        isArchived: isAccountArchived(account),
      };

      viewModel = createdViewModel;

      // Bucket Management (Aging)
      if (currentBucket.size >= BUCKET_LIMIT) {
        oldBucket = currentBucket;
        currentBucket = new Map();
      }
      currentBucket.set(stateKey, createdViewModel);

      flattenedData.push(createdViewModel);

      if (isExpanded) {
        children.forEach(child => flatten(child, depth + 1));
      }
    };

    rootAccounts.forEach(root => flatten(root, 0));

    return {
      title: section.title,
      count: typeAccounts.length,
      total: sectionTotal,
      totalColor: sectionColor,
      isCollapsed: collapsedSections.has(section.title),
      data: flattenedData,
      type: section.type,
    };
  });

  const duration = Date.now() - startTime;
  logger.debug(`[Trace] transformAccountsToSections: ${duration}ms`, {
    accounts: totalAccounts,
    cacheHits,
    hitRate: totalAccounts > 0 ? `${((cacheHits / totalAccounts) * 100).toFixed(1)}%` : '0%',
  });

  return sections;
}
