import { IconName } from '@/src/components/core';
import type { AccountFields } from '@/src/types/domain';
import { getAccountIcon } from '@/src/utils/accountIcon';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountBalance, AccountId, PlainAccount } from '@/src/types/domain';
import { getAccountAccentColor, resolveAccountAccentColor } from '@/src/utils/accountCategory';
import { useCallback, useMemo, useState } from 'react';

export interface SubAccountViewModel {
  id: string;
  name: string;
  icon: IconName;
  balanceAmount: number;
  currencyCode: string;
  categoryColor: string;
  accountColor: string;
  level: number;
  isGroup: boolean;
}

export interface UseAccountHierarchyTreeOptions {
  accountId: AccountId;
  account: AccountFields | PlainAccount | null;
  accounts: (AccountFields | PlainAccount)[];
  rawSubBalances: AccountBalance[];
  workplaceCurrency: string;
  dashboardLoading: boolean;
}

export function useAccountHierarchyTree(options: UseAccountHierarchyTreeOptions) {
  const { accountId, account, accounts, rawSubBalances, workplaceCurrency, dashboardLoading } =
    options;
  const { theme } = useTheme();

  const [isSubAccountsModalVisible, setIsSubAccountsModalVisible] = useState(false);

  const isParent = useMemo(
    () => accounts.some(a => a.parentAccountId === accountId && a.deletedAt === null),
    [accounts, accountId],
  );

  const subAccountCount = useMemo(
    () => accounts.filter(a => a.parentAccountId === accountId && a.deletedAt === null).length,
    [accounts, accountId],
  );

  const subBalances = useMemo(
    () =>
      new Map<string, AccountBalance>(rawSubBalances.map((b: AccountBalance) => [b.accountId, b])),
    [rawSubBalances],
  );

  const descendants = useMemo(() => {
    if (!account || !accounts.length) return [];
    const buildSubTree = (
      parentId: string,
      level: number,
    ): { account: AccountFields | PlainAccount; level: number }[] => {
      const result: { account: AccountFields | PlainAccount; level: number }[] = [];
      const children = accounts
        .filter(a => a.parentAccountId === parentId && a.deletedAt === null)
        .sort((a, b) => (a.orderNum || 0) - (b.orderNum || 0));
      for (const child of children) {
        result.push({ account: child, level });
        result.push(...buildSubTree(child.id, level + 1));
      }
      return result;
    };
    return buildSubTree(accountId, 0);
  }, [account, accounts, accountId]);

  const subAccounts = useMemo(() => {
    return descendants.map(({ account: child, level }) => {
      const subBalance = subBalances.get(child.id);
      const categoryColor = getAccountAccentColor(child.accountType, theme);
      const accountColor = resolveAccountAccentColor(child, theme);
      const isGroup = accounts.some(a => a.parentAccountId === child.id && a.deletedAt === null);
      const currencyCode = subBalance?.currencyCode || child.currencyCode || workplaceCurrency;
      return {
        id: child.id,
        name: child.name,
        icon: getAccountIcon(child),
        balanceAmount: subBalance?.balance ?? 0,
        currencyCode,
        categoryColor,
        accountColor,
        level,
        isGroup,
      };
    });
  }, [descendants, subBalances, workplaceCurrency, theme, accounts]);

  const onShowSubAccounts = useCallback(() => setIsSubAccountsModalVisible(true), []);
  const onHideSubAccounts = useCallback(() => setIsSubAccountsModalVisible(false), []);

  return {
    isParent,
    subAccountCount,
    subAccounts,
    subAccountsLoading: dashboardLoading,
    isSubAccountsModalVisible,
    onShowSubAccounts,
    onHideSubAccounts,
  };
}
