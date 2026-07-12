import { CashFlowCard } from '@/src/components/common/CashFlowCard';
import { NetWorthCard } from '@/src/components/common/NetWorthCard';
import {
  AppTabs,
  AppText,
  ExpandableSearchButton,
  FloatingActionButton,
  IconButton,
} from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Opacity, Shape, Size, Spacing } from '@/src/constants';
import { AccountCard } from '@/src/features/accounts/components/AccountCard';
import { AccountsListViewModel } from '@/src/features/accounts/hooks/useAccountsListViewModel';
import {
  AccountCardViewModel,
  AccountSectionViewModel,
} from '@/src/features/accounts/utils/transformAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { ActivityIndicator, SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';

const TAB_OPTIONS = [
  { id: 'accounts' as const, label: 'Accounts' },
  { id: 'categories' as const, label: 'Categories' },
] as const;

export function AccountsListView({
  sections,
  isRefreshing,
  onRefresh,
  onToggleSection,
  onAccountPress,
  onCollapseAccount,
  onCreateAccount,
  onReorderPress,
  onManageHierarchy,
  onTogglePrivacy,
  isPrivacyMode,
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
  searchQuery,
  isSearching,
  onSearchChange,
  setIsSearching,
  activeTab,
  setActiveTab,
}: AccountsListViewModel) {
  const { theme } = useTheme();

  const headerActions = (
    <View style={[styles.headerActions, isSearching && styles.headerActionsSearchActive]}>
      {!isSearching ? (
        <>
          <IconButton
            name={isPrivacyMode ? 'eyeOff' : 'eye'}
            size={Size.iconSm}
            variant="surface"
            onPress={onTogglePrivacy}
            accessibilityLabel={isPrivacyMode ? 'Show balances' : 'Hide balances'}
          />
          <IconButton
            name="reorder"
            size={Size.iconSm}
            variant="surface"
            onPress={onReorderPress}
            accessibilityLabel="Reorder accounts"
          />
          <IconButton
            name="hierarchy"
            size={Size.iconSm}
            variant="surface"
            onPress={onManageHierarchy}
            accessibilityLabel="Manage hierarchy"
          />
        </>
      ) : null}
      <ExpandableSearchButton
        value={searchQuery}
        onChangeText={onSearchChange}
        onExpandChange={setIsSearching}
        placeholder="Search accounts..."
      />
    </View>
  );

  return (
    <Screen
      title="Accounts"
      showBack={false}
      alignTitle="left"
      isSearchActive={isSearching}
      headerActions={headerActions}
    >
      <View style={styles.container}>
        <View style={styles.tabContainer}>
          <AppTabs options={TAB_OPTIONS} value={activeTab} onChange={setActiveTab} />
        </View>

        <SectionList
          sections={sections}
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          keyExtractor={(item: AccountCardViewModel) => item.id}
          renderSectionHeader={({ section }: { section: AccountSectionViewModel }) => {
            const isStartOfGroup =
              section.type === 'EXPENSE' ||
              section.type === 'LIABILITY' ||
              section.type === 'EQUITY';
            return (
              <TouchableOpacity
                onPress={() => onToggleSection(section.title)}
                activeOpacity={Opacity.heavy}
                style={[styles.sectionHeaderContainer, isStartOfGroup && { marginTop: Spacing.xl }]}
                accessibilityLabel={`${section.title} section, ${section.count} accounts`}
                accessibilityRole="button"
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
                    <AppText variant="body" weight="bold" style={{ color: section.totalColor }}>
                      {section.totalDisplay}
                    </AppText>
                    <IconButton
                      name={section.isCollapsed ? 'chevronRight' : 'chevronDown'}
                      size={Size.iconSm}
                      variant="clear"
                      iconColor={theme.textSecondary}
                      onPress={() => onToggleSection(section.title)}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          renderItem={({
            item,
            section,
          }: {
            item: AccountCardViewModel;
            section: AccountSectionViewModel;
          }) => {
            if (section.isCollapsed) return null;
            return (
              <AccountCard
                account={item}
                onPress={() => onAccountPress(item.id)}
                onCollapse={() => onCollapseAccount(item.id)}
                dividerColor="divider"
                surfaceColor="surface"
              />
            );
          }}
          ListHeaderComponent={
            activeTab === 'accounts' ? (
              <View style={styles.header}>
                <NetWorthCard
                  netWorth={netWorth}
                  totalAssets={totalAssets}
                  totalLiabilities={totalLiabilities}
                  currencyCode={currencyCode}
                  isLoading={isLoading}
                  hidden={isPrivacyMode}
                  onToggleHidden={onTogglePrivacy}
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
                  hidden={isPrivacyMode}
                  onToggleHidden={onTogglePrivacy}
                />
              </View>
            )
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

        {!isSearching ? (
          <FloatingActionButton
            onPress={onCreateAccount}
            label={activeTab === 'categories' ? 'New Category' : 'New Account'}
            placement="end"
            accessibilityLabel={
              activeTab === 'categories' ? 'Create a new category' : 'Create a new account'
            }
          />
        ) : null}
      </View>
    </Screen>
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
    paddingBottom: Spacing.xxxl,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  headerActionsSearchActive: {
    flex: 1,
  },
  sectionHeaderContainer: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
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
