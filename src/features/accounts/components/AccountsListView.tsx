import { MoneyText } from '@/src/components/common/MoneyText';
import { CashFlowCard } from '@/src/components/common/CashFlowCard';
import { NetWorthCard } from '@/src/components/common/NetWorthCard';
import { AppIcon, AppTabs, AppText } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { AccountCard } from '@/src/features/accounts/components/AccountCard';
import { AccountsListModals } from '@/src/features/accounts/components/AccountsListModals';
import { SelectionActionBar } from '@/src/components/common/SelectionActionBar';
import { AccountsListViewModel } from '@/src/features/accounts/hooks/useAccountsListViewModel';
import {
  AccountCardViewModel,
  AccountSectionViewModel,
} from '@/src/features/accounts/utils/transformAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';

const TAB_OPTIONS = [
  { id: 'accounts' as const, label: 'Accounts' },
  { id: 'categories' as const, label: 'Categories' },
] as const;

export function AccountsListView({
  sections,
  onToggleSection,
  onToggleSectionSelect,
  onAccountPress,
  onAccountLongPress,
  onAccountActionPress,
  selectedAccountIds,
  isSelectionModeActive,
  onSelectAll,
  onDeselectAll,
  onClearSelection,
  selectionActions,
  totalSelectableAccounts,
  modals,
  onCollapseAccount,
  isLoading,
  netWorth,
  totalAssets,
  totalLiabilities,
  inflowPeriod,
  setInflowPeriod,
  inflowIncome,
  inflowExpense,
  isPeriodLoading,
  currencyCode,
  activeTab,
  setActiveTab,
  chrome,
}: AccountsListViewModel & { chrome: TabScreenChrome }) {
  const { theme } = useTheme();

  const keyExtractor = useCallback((item: AccountCardViewModel) => item.id, []);

  const renderItem = useCallback(
    ({ item, section }: { item: AccountCardViewModel; section: AccountSectionViewModel }) => {
      if (section.isCollapsed) return null;
      return (
        <AccountCard
          account={item}
          isLoading={isLoading}
          onPress={onAccountPress}
          onLongPress={onAccountLongPress}
          onActionPress={onAccountActionPress}
          onCollapse={onCollapseAccount}
          dividerColor="divider"
          surfaceColor="surface"
          isSelected={selectedAccountIds.has(item.id)}
          isSelectionModeActive={isSelectionModeActive}
        />
      );
    },
    [
      isLoading,
      onAccountPress,
      onAccountLongPress,
      onAccountActionPress,
      onCollapseAccount,
      selectedAccountIds,
      isSelectionModeActive,
    ],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: AccountSectionViewModel }) => {
      const isStartOfGroup =
        section.type === 'EXPENSE' || section.type === 'LIABILITY' || section.type === 'EQUITY';

      const sectionAccountIds = section.accountIds;
      const isAllSectionSelected =
        sectionAccountIds.length > 0 && sectionAccountIds.every(id => selectedAccountIds.has(id));
      const isSomeSectionSelected =
        !isAllSectionSelected && sectionAccountIds.some(id => selectedAccountIds.has(id));

      return (
        <View style={[styles.sectionHeaderContainer, isStartOfGroup && { marginTop: Spacing.xl }]}>
          <TouchableOpacity
            onPress={() => onToggleSection(section.title)}
            onLongPress={() => onToggleSectionSelect(sectionAccountIds)}
            activeOpacity={Opacity.heavy}
            style={styles.sectionHeaderPressable}
            accessibilityLabel={`${section.title} section, ${section.count} accounts`}
            accessibilityRole="button"
            accessibilityState={{ expanded: !section.isCollapsed }}
          >
            <View style={[styles.summaryRow, { flex: 1 }]}>
              <View style={styles.flexRowGapSm}>
                <AppText variant="subheading" weight="bold" color="secondary">
                  {section.title}
                </AppText>
                <View style={[styles.countBadge, { backgroundColor: theme.surfaceSecondary }]}>
                  <AppText variant="caption" weight="bold" color="tertiary">
                    {section.count}
                  </AppText>
                </View>
              </View>
              <View style={styles.flexRowGapMd}>
                <MoneyText
                  amount={section.total}
                  currencyCode={currencyCode}
                  formatStyle="short"
                  variant="body"
                  weight="bold"
                  style={{ color: section.totalColor }}
                />
                <AppIcon
                  name={section.isCollapsed ? 'chevronRight' : 'chevronDown'}
                  size={Size.iconSm}
                  color={theme.textSecondary}
                />
              </View>
            </View>
          </TouchableOpacity>

          {isSelectionModeActive && sectionAccountIds.length > 0 && (
            <TouchableOpacity
              onPress={() => onToggleSectionSelect(sectionAccountIds)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.sectionSelectButton}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isAllSectionSelected }}
              accessibilityLabel={`Select all ${section.title} accounts`}
              testID={`section-select-${section.title.toLowerCase()}`}
            >
              <View
                style={[
                  styles.sectionSelectionIndicator,
                  {
                    borderColor:
                      isAllSectionSelected || isSomeSectionSelected
                        ? theme.primary
                        : withOpacity(theme.textSecondary, Opacity.medium),
                    backgroundColor: isAllSectionSelected
                      ? theme.primary
                      : isSomeSectionSelected
                        ? withOpacity(theme.primary, Opacity.soft)
                        : 'transparent',
                  },
                ]}
              >
                {isAllSectionSelected && <AppIcon name="check" size={12} color={theme.onPrimary} />}
                {isSomeSectionSelected && (
                  <View
                    style={{
                      width: 8,
                      height: 2,
                      backgroundColor: theme.primary,
                      borderRadius: 1,
                    }}
                  />
                )}
              </View>
            </TouchableOpacity>
          )}
        </View>
      );
    },
    [
      currencyCode,
      isSelectionModeActive,
      onToggleSection,
      onToggleSectionSelect,
      selectedAccountIds,
      theme.onPrimary,
      theme.primary,
      theme.surfaceSecondary,
      theme.textSecondary,
    ],
  );

  const extraData = useMemo(
    () => ({
      selectedAccountIds,
      isSelectionModeActive,
    }),
    [selectedAccountIds, isSelectionModeActive],
  );

  return (
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <View style={styles.container}>
        <View style={styles.tabContainer}>
          <AppTabs options={TAB_OPTIONS} value={activeTab} onChange={setActiveTab} />
        </View>

        <SectionList
          sections={sections}
          keyExtractor={keyExtractor}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          extraData={extraData}
          // Account cards are deliberately tall. Keep initial render fast and avoid Android clipping bugs.
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={false}
          updateCellsBatchingPeriod={30}
          ListHeaderComponent={
            <View>
              {activeTab === 'accounts' ? (
                <View style={styles.header}>
                  <NetWorthCard
                    netWorth={netWorth}
                    totalAssets={totalAssets}
                    totalLiabilities={totalLiabilities}
                    currencyCode={currencyCode}
                    isLoading={isLoading}
                  />
                </View>
              ) : (
                <View style={styles.header}>
                  <CashFlowCard
                    totalIncome={inflowIncome}
                    totalExpense={inflowExpense}
                    inflowPeriod={inflowPeriod}
                    onChangePeriod={setInflowPeriod}
                    currencyCode={currencyCode}
                    isLoading={isLoading || isPeriodLoading}
                  />
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              {isLoading ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <View style={styles.emptyStateContent}>
                  <AppText variant="body" color="secondary">
                    {activeTab === 'categories'
                      ? 'No categories yet. Create your first category to get started!'
                      : 'No accounts yet. Create your first account to get started!'}
                  </AppText>
                </View>
              )}
            </View>
          }
          contentContainerStyle={styles.listContainer}
          stickySectionHeadersEnabled={false}
        />

        <SelectionActionBar
          isVisible={isSelectionModeActive}
          selectedCount={selectedAccountIds.size}
          totalCount={totalSelectableAccounts}
          onClear={onClearSelection}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
          actions={selectionActions}
        />

        <AccountsListModals {...modals} />
      </View>
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabContainer: {
    paddingTop: Spacing.md,
  },
  listContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Size.buttonLg + Spacing.xl,
  },
  header: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flexRowGapSm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  flexRowGapMd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  sectionHeaderContainer: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeaderPressable: {
    flex: 1,
  },
  sectionSelectButton: {
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionSelectionIndicator: {
    width: 22,
    height: 22,
    borderRadius: Shape.radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  countBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs / 2,
    borderRadius: Shape.radius.sm,
    minWidth: Size.iconSm,
    alignItems: 'center',
  },
  emptyState: {
    marginTop: Spacing.xxl,
    alignItems: 'center',
  },
  emptyStateContent: {
    alignItems: 'center',
  },
});
