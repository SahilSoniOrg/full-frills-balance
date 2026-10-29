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
  primaryPageFromRouteName,
  primaryRouteForGroup,
} from '@/src/navigation/primaryPages';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Spacing } from '@/src/constants';

/**
 * Accounts parent: fixed chrome + AppTabs, inner pager for Accounts ↔ Categories.
 */
export function AccountsGroupPager() {
  const pageNavigation = usePrimaryPageNavigation();
  const activeRouteName = pageNavigation?.activeRouteName ?? 'accounts';
  // While this shell stays mounted off-screen, ignore other groups' routes —
  // treating `index` as Accounts was snapping Categories → Accounts mid-pan.
  const groupRoute =
    primaryPageFromRouteName(activeRouteName)?.group === 'accounts'
      ? activeRouteName
      : primaryRouteForGroup('accounts');
  const activeTab = groupRoute === 'categories' ? 'categories' : 'accounts';
  const innerIndex = primaryInnerIndex(groupRoute);
  // Progress is owned by GroupInnerPager (scroll + programmatic sync). Do not
  // snap it from the route here — that made AppTabs show Categories while the
  // body was still on Accounts when setPage lagged.
  const innerProgress = useSharedValue(innerIndex);

  const accountsVm = useAccountsListViewModel('accounts');
  const categoriesVm = useAccountsListViewModel('categories');
  const activeVm = activeTab === 'categories' ? categoriesVm : accountsVm;

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
        group="accounts"
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
