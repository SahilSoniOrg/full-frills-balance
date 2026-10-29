import { AccountsListHeaderActions } from '@/src/features/accounts/components/AccountsListHeaderActions';
import {
  ACCOUNTS_GROUP_TAB_OPTIONS,
  AccountsListView,
} from '@/src/features/accounts/components/AccountsListView';
import { useAccountsListViewModel } from '@/src/features/accounts/hooks/useAccountsListViewModel';
import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { AppTabs } from '@/src/components/core';
import { GroupInnerPager } from '@/src/navigation/GroupInnerPager';
import { usePrimaryPageNavigation } from '@/src/navigation/primaryPageNavigation';
import {
  primaryAdjacentSwipeGroup,
  primaryEntryRouteForGroup,
  primaryInnerIndex,
} from '@/src/navigation/primaryPages';
import { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Spacing } from '@/src/constants';

/**
 * Accounts parent: fixed chrome + AppTabs, inner pager for Accounts ↔ Categories.
 */
export function AccountsGroupPager() {
  const pageNavigation = usePrimaryPageNavigation();
  const activeRouteName = pageNavigation?.activeRouteName ?? 'accounts';
  const activeTab = activeRouteName === 'categories' ? 'categories' : 'accounts';
  const innerIndex = primaryInnerIndex(activeTab);
  const innerProgress = useSharedValue(innerIndex);

  const accountsVm = useAccountsListViewModel('accounts');
  const categoriesVm = useAccountsListViewModel('categories');
  const activeVm = activeTab === 'categories' ? categoriesVm : accountsVm;

  useEffect(() => {
    innerProgress.value = innerIndex;
  }, [innerIndex, innerProgress]);

  const chrome = useMemo<TabScreenChrome>(() => {
    const baseChrome: TabScreenChrome = {
      screenTitle: 'Accounts',
      kind: 'tab',
      isSearchActive: activeVm.isSearching,
      headerActions: (
        <AccountsListHeaderActions
          isSearching={activeVm.isSearching}
          searchQuery={activeVm.searchQuery}
          onSearchChange={activeVm.onSearchChange}
          setIsSearching={activeVm.setIsSearching}
          onManageHierarchy={activeVm.onManageHierarchy}
          accountsForArchiveToggle={activeVm.accountsForArchiveToggle}
        />
      ),
    };
    return applySelectionChrome(baseChrome, {
      active: activeVm.isSelectionModeActive,
      onExit: activeVm.selectionChrome.exitSelectionMode,
    });
  }, [
    activeVm.accountsForArchiveToggle,
    activeVm.isSearching,
    activeVm.isSelectionModeActive,
    activeVm.onManageHierarchy,
    activeVm.onSearchChange,
    activeVm.searchQuery,
    activeVm.selectionChrome.exitSelectionMode,
    activeVm.setIsSearching,
  ]);

  const onIndexChange = useCallback(
    (index: number) => {
      const routeName = index === 1 ? 'categories' : 'accounts';
      pageNavigation?.navigateToPage(routeName);
    },
    [pageNavigation],
  );

  const onTabChange = useCallback(
    (tab: 'accounts' | 'categories') => {
      pageNavigation?.navigateToPage(tab);
    },
    [pageNavigation],
  );

  const onEdgeSwipe = useCallback(
    (direction: 'prev' | 'next') => {
      const adjacent = primaryAdjacentSwipeGroup('accounts', direction);
      if (!adjacent || !pageNavigation) return;
      pageNavigation.navigateToPage(primaryEntryRouteForGroup(adjacent, direction));
    },
    [pageNavigation],
  );

  return (
    <ScreenWithChrome
      chrome={chrome}
      scrollable={false}
      testID={activeTab === 'categories' ? 'categories-screen' : 'accounts-screen'}
    >
      <View style={styles.tabs}>
        <AppTabs
          options={ACCOUNTS_GROUP_TAB_OPTIONS}
          value={activeTab}
          onChange={onTabChange}
          pageProgress={innerProgress}
        />
      </View>
      <GroupInnerPager
        pageCount={2}
        index={innerIndex}
        pageProgress={innerProgress}
        onIndexChange={onIndexChange}
        onEdgeSwipe={onEdgeSwipe}
      >
        <AccountsListView {...accountsVm} chrome={chrome} embedded />
        <AccountsListView {...categoriesVm} chrome={chrome} embedded />
      </GroupInnerPager>
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  tabs: {
    paddingTop: Spacing.md,
  },
});
