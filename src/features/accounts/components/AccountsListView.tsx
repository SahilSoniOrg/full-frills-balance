import { LIST_SELECTION_LONG_PRESS_MS } from '@/src/constants/gesture-constants';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { CashFlowCard } from '@/src/components/shared/CashFlowCard';
import { NetWorthCard } from '@/src/components/shared/NetWorthCard';
import {
  EmptyStateView,
  ErrorStateView,
  Icon,
  IconButton,
  AppTabs,
  AppText,
  PressScaleTouchable,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { AccountCard } from '@/src/features/accounts/components/AccountCard';
import { AccountsListModals } from '@/src/features/accounts/components/AccountsListModals';
import { SelectionActionBar } from '@/src/components/shared/SelectionActionBar';
import { SelectionIndicator } from '@/src/components/shared/SelectionIndicator';
import { AccountsListViewModel } from '@/src/features/accounts/hooks/useAccountsListViewModel';
import {
  AccountCardViewModel,
  AccountSectionViewModel,
} from '@/src/features/accounts/utils/transformAccounts';
import { FlashList } from '@shopify/flash-list';
import {
  buildAccountListRows,
  type AccountListRow,
} from '@/src/features/accounts/helpers/accountListRows';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { showIncompleteFxDetails } from '@/src/utils/incompleteFxDetails';

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
  selectionChrome,
  totalSelectableAccounts,
  modals,
  onCollapseAccount,
  onCreateAccount,
  isLoading,
  error,
  retry,
  netWorth,
  totalAssets,
  totalLiabilities,
  inflowPeriod,
  setInflowPeriod,
  inflowIncome,
  inflowExpense,
  isPeriodLoading,
  hasUnvaluedEntries,
  currencyCode,
  activeTab,
  setActiveTab,
  chrome,
}: AccountsListViewModel & { chrome: TabScreenChrome }) {
  const { theme } = useTheme();

  const rows = useMemo(() => buildAccountListRows(sections), [sections]);
  const keyExtractor = useCallback((item: AccountListRow) => item.key, []);

  const handleToggleSection = useCallback(
    (title: string) => {
      // LayoutAnimation requires disabling recycling, recreating cards on every toggle.
      onToggleSection(title);
    },
    [onToggleSection],
  );

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
          <PressScaleTouchable
            onPress={() => handleToggleSection(section.title)}
            onLongPress={() => onToggleSectionSelect(sectionAccountIds)}
            delayLongPress={LIST_SELECTION_LONG_PRESS_MS}
            style={styles.sectionHeaderPressable}
            accessibilityLabel={`${section.title} section, ${section.count} accounts`}
            accessibilityHint={section.isCollapsed ? 'Expand section' : 'Collapse section'}
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
              </View>
            </View>
          </PressScaleTouchable>

          <View
            style={styles.sectionSelectButton}
            testID={`section-control-${section.title.toLowerCase()}`}
          >
            {isSelectionModeActive && sectionAccountIds.length > 0 ? (
              <PressScaleTouchable
                onPress={() => onToggleSectionSelect(sectionAccountIds)}
                hitSlop={{
                  top: Spacing.sm,
                  bottom: Spacing.sm,
                  left: Spacing.sm,
                  right: Spacing.sm,
                }}
                style={styles.sectionSelectButton}
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: isAllSectionSelected ? true : isSomeSectionSelected ? 'mixed' : false,
                }}
                accessibilityLabel={`Select all ${section.title} accounts`}
                testID={`section-select-${section.title.toLowerCase()}`}
              >
                <SelectionIndicator
                  selected={isAllSectionSelected ? true : isSomeSectionSelected ? 'mixed' : false}
                />
              </PressScaleTouchable>
            ) : (
              <IconButton
                name={section.isCollapsed ? Icon.ChevronRight : Icon.ChevronDown}
                size={Size.iconSm}
                style={styles.sectionSelectButton}
                variant="clear"
                iconColor={theme.textSecondary}
                onPress={() => handleToggleSection(section.title)}
                accessibilityLabel={`${section.isCollapsed ? 'Expand' : 'Collapse'} ${section.title} section`}
              />
            )}
          </View>
        </View>
      );
    },
    [
      currencyCode,
      handleToggleSection,
      isSelectionModeActive,
      onToggleSectionSelect,
      selectedAccountIds,
      theme.surfaceSecondary,
      theme.textSecondary,
    ],
  );

  const renderRow = useCallback(
    ({ item }: { item: AccountListRow }) =>
      item.kind === 'section'
        ? renderSectionHeader({ section: item.section })
        : renderItem({ item: item.account, section: item.section }),
    [renderItem, renderSectionHeader],
  );

  const extraData = useMemo(
    () => ({
      selectedAccountIds,
      isSelectionModeActive,
    }),
    [selectedAccountIds, isSelectionModeActive],
  );

  if (error && sections.length === 0) {
    return (
      <ScreenWithChrome chrome={chrome} scrollable={false}>
        <ErrorStateView message="We could not load accounts." onRetry={retry} />
      </ScreenWithChrome>
    );
  }

  return (
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <View style={styles.container}>
        <View style={styles.tabContainer}>
          <AppTabs options={TAB_OPTIONS} value={activeTab} onChange={setActiveTab} />
        </View>

        <FlashList
          keyboardShouldPersistTaps="handled"
          data={rows}
          keyExtractor={keyExtractor}
          renderItem={renderRow}
          getItemType={item => item.kind}
          maintainVisibleContentPosition={{ disabled: true }}
          extraData={extraData}
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
                    warning={
                      inflowPeriod === '30days' && hasUnvaluedEntries
                        ? AppConfig.strings.reports.incompleteFxWarning
                        : undefined
                    }
                    onWarningPress={
                      inflowPeriod === '30days' && hasUnvaluedEntries
                        ? () =>
                            showIncompleteFxDetails({
                              context: 'cash-flow',
                              currencyCode,
                            })
                        : undefined
                    }
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
                <EmptyStateView
                  title={
                    activeTab === 'categories'
                      ? AppConfig.strings.accounts.emptyCategoriesTitle
                      : AppConfig.strings.accounts.emptyTitle
                  }
                  subtitle={
                    activeTab === 'categories'
                      ? AppConfig.strings.accounts.emptyCategoriesSubtitle
                      : AppConfig.strings.accounts.emptySubtitle
                  }
                  primaryActionLabel={
                    activeTab === 'categories'
                      ? AppConfig.strings.accounts.categoryForm.createCategory
                      : AppConfig.strings.accounts.picker.createAccount
                  }
                  onPrimaryAction={onCreateAccount}
                  style={styles.emptyStateContent}
                />
              )}
            </View>
          }
          contentContainerStyle={styles.listContainer}
        />

        <SelectionActionBar
          isVisible={isSelectionModeActive}
          selectedCount={selectedAccountIds.size}
          totalCount={totalSelectableAccounts}
          onClear={selectionChrome.exitSelectionMode}
          onSelectAll={selectionChrome.selectAll}
          onDeselectAll={selectionChrome.clearItems}
          actions={selectionChrome.actions}
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
    minWidth: Size.touchTarget,
    minHeight: Size.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
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
