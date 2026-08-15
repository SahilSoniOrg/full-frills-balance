import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { JournalEntryListView } from '@/src/components/common/JournalEntryListView';
import { AppButton, AppText } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Spacing } from '@/src/constants';
import { AccountDetailsListHeader } from '@/src/features/accounts/components/AccountDetailsListHeader';
import { AccountReconcileDialog } from '@/src/features/accounts/components/AccountReconcileDialog';
import { SubAccountListModal } from '@/src/features/accounts/components/SubAccountListModal';
import { AccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { JournalListModals } from '@/src/features/journal';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function AccountDetailsView({
  chrome,
  ...vm
}: AccountDetailsViewModel & { chrome: ScreenNavChrome }) {
  const { theme } = useTheme();
  const {
    accountLoading,
    accountMissing,
    onBack,
    listHeader,
    isDatePickerVisible,
    hideDatePicker,
    periodFilter,
    onDateSelect,
    journalsLoading,
    journalsLoadingMore,
    journalItems,
    onLoadMore,
    subAccounts,
    subAccountsLoading,
    isSubAccountsModalVisible,
    onHideSubAccounts,
    selectedIds,
    isSelectionModeActive,
    onLongPressItem,
    selectAll,
    clearItems,
    onShareSelected,
    exitSelectionMode,
    actions,
    modals,
  } = vm;

  const selectionChrome = useMemo(
    () => ({
      exitSelectionMode,
      selectAll,
      clearItems,
      onShareSelected,
      actions,
    }),
    [exitSelectionMode, selectAll, clearItems, onShareSelected, actions],
  );

  return (
    <ScreenWithChrome chrome={chrome}>
      {accountLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : accountMissing ? (
        <View style={styles.errorContainer}>
          <AppText variant="body" color="error">
            Account not found
          </AppText>
          <AppButton variant="outline" onPress={onBack}>
            Go Back
          </AppButton>
        </View>
      ) : (
        <>
          <JournalEntryListView
            items={journalItems}
            isLoading={journalsLoading}
            isLoadingMore={journalsLoadingMore}
            onEndReached={onLoadMore}
            emptyTitle="No journal entries yet"
            emptySubtitle="Journal entries for this account will appear here."
            selectedIds={selectedIds}
            onLongPressItem={onLongPressItem}
            isSelectionModeActive={isSelectionModeActive}
            selectionChrome={selectionChrome}
            ListHeaderComponent={<AccountDetailsListHeader {...listHeader} />}
            contentContainerStyle={styles.listContainer}
            style={styles.list}
          />

          <DateRangePicker
            visible={isDatePickerVisible}
            onClose={hideDatePicker}
            currentFilter={periodFilter}
            onSelect={onDateSelect}
          />

          <SubAccountListModal
            visible={isSubAccountsModalVisible}
            onClose={onHideSubAccounts}
            parentName={listHeader.summary.accountName}
            subAccounts={subAccounts}
            isLoading={subAccountsLoading}
          />

          <AccountReconcileDialog
            visible={vm.isReconcileModalVisible}
            onClose={() => vm.setIsReconcileModalVisible(false)}
            onConfirm={vm.onConfirmReconcile}
            balanceAmount={vm.balanceAmount ?? 0}
            currencyCode={vm.currencyCode}
            unreconciledCount={vm.unreconciledCount}
          />

          {modals ? <JournalListModals {...modals} /> : null}
        </>
      )}
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.lg,
  },
  list: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxxl,
  },
});
