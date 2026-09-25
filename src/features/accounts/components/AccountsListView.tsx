import { MoneyText } from '@/src/components/shared/MoneyText';
import { CashFlowCard } from '@/src/components/shared/CashFlowCard';
import { NetWorthCard } from '@/src/components/shared/NetWorthCard';
import {
  EmptyStateView,
  ErrorStateView,
  Icon,
  AppIcon,
  AppTabs,
  AppText,
  PressScaleTouchable,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, BorderWidth, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import { AccountCard } from '@/src/features/accounts/components/AccountCard';
import { AccountsListModals } from '@/src/features/accounts/components/AccountsListModals';
import { SelectionActionBar } from '@/src/components/shared/SelectionActionBar';
import { AccountsListViewModel } from '@/src/features/accounts/hooks/useAccountsListViewModel';
import {
  AccountCardViewModel,
  AccountSectionViewModel,
} from '@/src/features/accounts/utils/transformAccounts';
import { useEaseInLayoutAnimation } from '@/src/hooks/useEaseInLayoutAnimation';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';

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
  const prepareLayoutAnimation = useEaseInLayoutAnimation();

  const keyExtractor = useCallback((item: AccountCardViewModel) => item.id, []);

  const handleToggleSection = useCallback(
    (title: string) => {
      prepareLayoutAnimation();
      onToggleSection(title);
    },
    [onToggleSection, prepareLayoutAnimation],
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
                <AppIcon
                  name={section.isCollapsed ? Icon.ChevronRight : Icon.ChevronDown}
                  size={Size.iconSm}
                  color={theme.textSecondary}
                />
              </View>
            </View>
          </PressScaleTouchable>

          {isSelectionModeActive && sectionAccountIds.length > 0 && (
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
                {isAllSectionSelected && (
                  <AppIcon name={Icon.Check} size={Size.xxs} color={theme.onPrimary} />
                )}
                {isSomeSectionSelected && (
                  <View
                    style={{
                      width: Spacing.sm,
                      height: BorderWidth.medium,
                      backgroundColor: theme.primary,
                      borderRadius: BorderWidth.thin,
                    }}
                  />
                )}
              </View>
            </PressScaleTouchable>
          )}
        </View>
      );
    },
    [
      currencyCode,
      handleToggleSection,
      isSelectionModeActive,
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
                    warning={
                      inflowPeriod === '30days' && hasUnvaluedEntries
                        ? AppConfig.strings.reports.incompleteFxWarning
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
          stickySectionHeadersEnabled={false}
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
  sectionSelectionIndicator: {
    width: Size.md,
    height: Size.md,
    borderRadius: Shape.radius.full,
    borderWidth: BorderWidth.medium,
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
