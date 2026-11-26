import { LIST_SELECTION_LONG_PRESS_MS } from '@/src/constants/gesture-constants';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { CashFlowCard } from '@/src/components/shared/CashFlowCard';
import { NetWorthCard } from '@/src/components/shared/NetWorthCard';
import {
  EmptyStateView,
  ErrorStateView,
  DisclosureToggle,
  PressScaleTouchable,
} from '@/src/components/core';
import { AppConfig, Layout, Size, Spacing } from '@/src/constants';
import { AccountCard } from '@/src/features/accounts/components/AccountCard';
import { AccountsListModals } from '@/src/features/accounts/components/AccountsListModals';
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
import { Inline } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { showIncompleteFxDetails } from '@/src/services/currency/incompleteFxDetails';

export function AccountsListView({
  sections,
  onToggleSection,
  onToggleSectionSelect,
  onAccountPress,
  onAccountLongPress,
  onAccountActionPress,
  selectedAccountIds,
  isSelectionModeActive,
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
}: AccountsListViewModel) {
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
      const selectionCheckbox =
        isSelectionModeActive && sectionAccountIds.length > 0 ? (
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
        ) : null;

      return (
        <Inline
          align="center"
          gap="sm"
          style={[styles.sectionHeaderContainer, isStartOfGroup && { marginTop: Spacing.xl }]}
        >
          <DisclosureToggle
            label={section.title}
            meta={section.count}
            expanded={!section.isCollapsed}
            onToggle={() => handleToggleSection(section.title)}
            onLongPress={() => onToggleSectionSelect(sectionAccountIds)}
            delayLongPress={LIST_SELECTION_LONG_PRESS_MS}
            accessibilityLabel={`${section.title} section, ${section.count} accounts`}
            accessibilityHint={section.isCollapsed ? 'Expand section' : 'Collapse section'}
            style={styles.sectionHeaderPressable}
            testID={`section-control-${section.title.toLowerCase()}`}
          />
          {selectionCheckbox}
          <MoneyText
            amount={section.total}
            currencyCode={currencyCode}
            formatStyle="short"
            variant="body"
            weight="bold"
            style={{ color: section.totalColor }}
          />
        </Inline>
      );
    },
    [
      currencyCode,
      handleToggleSection,
      isSelectionModeActive,
      onToggleSectionSelect,
      selectedAccountIds,
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

  const body = (
    <View style={styles.container}>
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

      <AccountsListModals {...modals} />
    </View>
  );

  if (error && sections.length === 0) {
    return <ErrorStateView message="We could not load accounts." onRetry={retry} />;
  }
  return body;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Layout.listBottomInset.tab,
  },
  header: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  sectionHeaderContainer: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  sectionHeaderPressable: {
    flex: 1,
    minWidth: 0,
  },
  sectionSelectButton: {
    minWidth: Size.touchTarget,
    minHeight: Size.touchTarget,
    justifyContent: 'center',
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
