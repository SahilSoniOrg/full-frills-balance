import { createAccountTreeSnapshot } from '@/src/domain/accounts/accountTree';
import type { IconName } from '@/src/types/domainIcons';
import { Theme } from '@/src/constants/design-tokens';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { PlainAccount } from '@/src/types/plainDtos';
import {
  getAccountSections,
  getSectionColor,
  resolveAccountAppearance,
} from '@/src/design-system/accountPresentation';
import { getAccountIcon } from '@/src/design-system/accountIcon';
import { isAccountArchived, getVisibleRoots } from '@/src/domain/accounts/accountArchive';
import { Opacity } from '@/src/constants';
import { withOpacity } from '@/src/design-system/colorMath';

export interface AccountCardViewModel {
  id: AccountId;
  name: string;
  icon: IconName;
  accountType?: AccountType;
  /** Semantic account category color (asset/liability/etc.). */
  categoryColor: string;
  categoryIconBg?: string;
  /** User-selected account identity color, falling back to categoryColor. */
  accountColor: string;
  textColor: string;
  /** Raw balance — presentational layer formats using screen privacy flag. */
  balance: number;
  workplaceBalance?: number;
  workplaceCurrencyCode?: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  showMonthlyStats: boolean;
  currencyCode: string;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  reconciledAt?: Date;
  isArchived: boolean;
  /** Parent account name for sub-accounts. */
  parentName?: string;
}

export interface AccountSectionViewModel {
  title: string;
  count: number;
  /** Raw section total — presentational layer formats using screen privacy flag. */
  total: number;
  totalColor: string;
  isCollapsed: boolean;
  data: AccountCardViewModel[];
  accountIds: AccountId[];
  type?: string;
}

interface BalancesByAccountId {
  balance: number;
  workplaceBalance?: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  currencyCode?: string;
}

interface TransformOptions {
  balancesByAccountId: Map<string, BalancesByAccountId | null>;
  defaultCurrency: string;
  showAccountMonthlyStats: boolean;
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

export function transformAccountsToSections(
  accounts: PlainAccount[],
  options: TransformOptions,
): AccountSectionViewModel[] {
  if (!accounts.length) return [];

  const {
    balancesByAccountId,
    defaultCurrency,
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
    const tree = createAccountTreeSnapshot(typeAccounts);
    const accountsById = tree.accountsById;
    const rootAccounts = getVisibleRoots(typeAccounts);
    const flattenedData: AccountCardViewModel[] = [];

    const flatten = (account: AccountFields, depth: number) => {
      const balanceData = balancesByAccountId.get(account.id) || null;
      const balance = balanceData?.balance || 0;
      const workplaceBalance = balanceData?.workplaceBalance;
      const monthlyIncome = balanceData?.monthlyIncome || 0;
      const monthlyExpenses = balanceData?.monthlyExpenses || 0;
      const isExpanded = expandedAccountIds.has(account.id);
      const children = tree.getChildren(account.id);

      const { categoryColor, accentColor: accountColor } = resolveAccountAppearance(account, theme);
      const textColor = onContrast(accountColor);
      const categoryIconBg = withOpacity(categoryColor, Opacity.soft);

      const currencyCode = balanceData?.currencyCode || account.currencyCode;

      const viewModel: AccountCardViewModel = {
        id: account.id,
        name: account.name,
        icon: getAccountIcon(account),
        accountType: account.accountType,
        categoryColor,
        categoryIconBg,
        accountColor,
        textColor,
        balance,
        workplaceBalance,
        workplaceCurrencyCode: defaultCurrency,
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
        parentName: account.parentAccountId
          ? accountsById.get(account.parentAccountId)?.name
          : undefined,
      };

      flattenedData.push(viewModel);

      if (isExpanded) {
        children.forEach(child => flatten(child, depth + 1));
      }
    };

    const isCollapsed = collapsedSections.has(section.title);
    if (!isCollapsed) rootAccounts.forEach(root => flatten(root, 0));

    return {
      title: section.title,
      count: typeAccounts.length,
      total: sectionTotal,
      totalColor: sectionColor,
      isCollapsed,
      data: isCollapsed ? [] : flattenedData,
      accountIds: typeAccounts.map(a => a.id),
      type: section.type,
    };
  });

  return sections;
}
