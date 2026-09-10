import { IconName } from '@/src/components/core';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountBalance } from '@/src/types/domainReadModels';
import { AccountId } from '@/src/types/ids';
import { PlainAccount } from '@/src/types/plainDtos';
import { isUndeletedAccount, type AccountTreeSnapshot } from '@/src/services/accounts/accountTree';
import { getAccountAccentColor, resolveAccountAccentColor } from '@/src/utils/accountCategory';
import { getAccountIcon } from '@/src/utils/accountIcon';
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
  account: PlainAccount | null;
  treeSnapshot: AccountTreeSnapshot<PlainAccount>;
  rawSubBalances: AccountBalance[];
  workplaceCurrency: string;
  dashboardLoading: boolean;
}

export function useAccountHierarchyTree(options: UseAccountHierarchyTreeOptions) {
  const { accountId, account, treeSnapshot, rawSubBalances, workplaceCurrency, dashboardLoading } =
    options;
  const { theme } = useTheme();

  const [isSubAccountsModalVisible, setIsSubAccountsModalVisible] = useState(false);

  const isParent = useMemo(
    () => treeSnapshot.getChildren(accountId).some(isUndeletedAccount),
    [accountId, treeSnapshot],
  );

  const subAccountCount = useMemo(
    () => treeSnapshot.getChildren(accountId).filter(isUndeletedAccount).length,
    [accountId, treeSnapshot],
  );

  const subBalances = useMemo(
    () =>
      new Map<string, AccountBalance>(rawSubBalances.map((b: AccountBalance) => [b.accountId, b])),
    [rawSubBalances],
  );

  const descendants = useMemo(() => {
    if (!account) return [];
    const buildSubTree = (
      parentId: AccountId,
      level: number,
    ): { account: PlainAccount; level: number }[] => {
      const result: { account: PlainAccount; level: number }[] = [];
      const children = treeSnapshot.getChildren(parentId).filter(isUndeletedAccount);
      for (const child of children) {
        result.push({ account: child, level });
        result.push(...buildSubTree(child.id, level + 1));
      }
      return result;
    };
    return buildSubTree(accountId, 0);
  }, [account, accountId, treeSnapshot]);

  const subAccounts = useMemo(() => {
    return descendants.map(({ account: child, level }) => {
      const subBalance = subBalances.get(child.id);
      const categoryColor = getAccountAccentColor(child.accountType, theme);
      const accountColor = resolveAccountAccentColor(child, theme);
      const isGroup = treeSnapshot.getChildren(child.id).some(isUndeletedAccount);
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
  }, [descendants, subBalances, workplaceCurrency, theme, treeSnapshot]);

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
