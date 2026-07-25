import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { Spacing, Shape, Size } from '@/src/constants';
import { Page } from '@/src/design-system';
import { AdvancedForm } from '@/src/features/journal/entry/components/AdvancedForm';
import { JournalEntryHeader } from '@/src/features/journal/entry/components/JournalEntryHeader';
import { JournalMetaCard } from '@/src/features/journal/entry/components/JournalMetaCard';
import { JournalModeToggle } from '@/src/features/journal/entry/components/JournalModeToggle';
import { JournalSummary } from '@/src/features/journal/entry/components/JournalSummary';
import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import { SplitForm } from '@/src/features/journal/entry/components/SplitForm';
import { SimpleFormAmountInput } from '@/src/features/journal/entry/components/SimpleFormAmountInput';
import { JournalEntryViewModel } from '@/src/features/journal/entry/hooks/useJournalEntryViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { ActivityIndicator, StyleSheet, View, Modal, ScrollView } from 'react-native';
import { VoiceInputModal } from './VoiceInputModal';
import { BulkEntryGrid } from '@/src/features/journal';
import { AppButton, AppText, AppIcon } from '@/src/components/core';
import { AppNavigation } from '@/src/utils/navigation';

export function JournalEntryView(vm: JournalEntryViewModel) {
  const { theme } = useTheme();
  const [hideSuggestions, setHideSuggestions] = React.useState(false);
  const {
    isLoading,
    headerTitle,
    showEditBanner,
    editBannerText,
    activeMode,
    onToggleMode,
    simpleEditor,
    submitLabel,
    isSubmitDisabled,
    handleSubmit,
    setIsAmountFocused,
    workplaceId,
    isVoiceModalVisible,
    setIsVoiceModalVisible,
    handleApplyVoiceInput,
    savedSummary,
    setSavedSummary,
  } = vm;

  const isGuidedMode = activeMode === 'guided';

  // Reset hide suggestions when user focuses or types
  const handleSetDescription = React.useCallback(
    (desc: string) => {
      setHideSuggestions(false);
      vm.editor.setDescription(desc);
    },
    [vm.editor],
  );

  if (isLoading) {
    return (
      <Page header={<JournalEntryHeader title={headerTitle} />}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </Page>
    );
  }

  return (
    <Page
      keyboardAvoiding
      scrollable={activeMode !== 'bulk'} // Grid has its own ScrollView
      scrollViewProps={{
        onScrollBeginDrag: () => setHideSuggestions(true),
        scrollEventThrottle: 16,
      }}
      header={
        <>
          <JournalEntryHeader title={headerTitle} />
          <JournalModeToggle
            mode={activeMode}
            onToggleMode={onToggleMode}
            variant="bar"
            isSimpleDisabled={vm.isSimpleModeDisabled}
          />
        </>
      }
      footer={
        <SubmitFooter
          onPress={handleSubmit}
          disabled={isSubmitDisabled}
          label={submitLabel}
          loading={activeMode === 'bulk' && vm.bulkEditor.isSubmitting}
          topSlot={
            isGuidedMode ? (
              <SimpleFormAmountInput
                amount={vm.primaryDisplayAmount}
                setAmount={simpleEditor.setAmount}
                readOnly={false}
                activeColor={
                  simpleEditor.type === 'expense'
                    ? theme.expense
                    : simpleEditor.type === 'income'
                      ? theme.income
                      : theme.primary
                }
                displayCurrency={vm.primaryDisplayCurrency}
                onFocus={() => setIsAmountFocused(true)}
                onBlur={() => setIsAmountFocused(false)}
                variant="default"
              />
            ) : undefined
          }
        />
      }
    >
      <View style={styles.content}>
        {/* Description, date, and notes — same minimal layout in simple, split, and advanced */}
        {activeMode !== 'bulk' && (
          <JournalMetaCard
            date={vm.editor.journalDate}
            setDate={vm.editor.setJournalDate}
            time={vm.editor.journalTime}
            setTime={vm.editor.setJournalTime}
            description={vm.editor.description}
            setDescription={handleSetDescription}
            notes={vm.editor.notes}
            setNotes={vm.editor.setNotes}
            showBanner={showEditBanner}
            bannerText={editBannerText}
            variant="minimal"
            density="tight"
            suggestions={vm.suggestions}
            hideSuggestions={hideSuggestions}
            onDescriptionFocus={() => setHideSuggestions(false)}
            onVoiceInputPress={() => setIsVoiceModalVisible(true)}
          />
        )}

        {activeMode === 'guided' ? (
          <SimpleForm {...vm.simpleEditor} />
        ) : activeMode === 'split' ? (
          <SplitForm {...vm.splitEditor} />
        ) : activeMode === 'advanced' ? (
          <View style={{ paddingHorizontal: Spacing.lg }}>
            <AdvancedForm
              accounts={vm.accounts}
              editor={vm.editor}
              workplaceCurrency={vm.workplaceCurrency}
              onSelectAccountRequest={vm.advancedFormConfig.onSelectAccountRequest}
            />
            <JournalSummary
              totalDebits={vm.totalDebits}
              totalCredits={vm.totalCredits}
              isBalanced={vm.isBalanced}
              isBalancedDisplay={vm.isBalancedDisplay}
              availableCurrencies={vm.availableCurrencies}
              selectedCurrency={vm.selectedCurrency}
              onSelectCurrency={vm.onSelectCurrency}
              workplaceCurrency={vm.workplaceCurrency}
            />
          </View>
        ) : (
          <BulkEntryGrid
            rows={vm.bulkEditor.rows}
            submitError={vm.bulkEditor.submitError}
            accounts={vm.accounts}
            addRow={vm.bulkEditor.addRow}
            removeRow={vm.bulkEditor.removeRow}
            clearRows={vm.bulkEditor.clearRows}
            updateRowField={vm.bulkEditor.updateRowField}
          />
        )}
      </View>

      <AccountPickerModal
        visible={vm.showAccountPicker}
        title="Select Account"
        accounts={vm.selectableAccounts}
        selectedId={vm.selectedAccountId}
        onSelect={vm.onAccountSelected}
        onClose={vm.onCloseAccountPicker}
        onCreateRequest={vm.onCreateAccountRequest}
        excludeParentAccounts={true}
      />
      <VoiceInputModal
        visible={isVoiceModalVisible}
        onClose={() => setIsVoiceModalVisible(false)}
        onApply={handleApplyVoiceInput}
        workplaceId={workplaceId}
      />

      {/* Save Success Summary Popup Modal */}
      <Modal
        visible={!!savedSummary}
        transparent
        animationType="fade"
        onRequestClose={() => setSavedSummary(null)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
            <View style={styles.successHeader}>
              <AppIcon name="checkCircle" size={Size.iconLg} color={theme.primary} />
              <AppText variant="heading" weight="bold" style={styles.modalTitle}>
                Saved Successfully
              </AppText>
              <AppText variant="body" color="secondary" style={styles.modalSubtitle}>
                Recorded {savedSummary?.count} journals to the ledger.
              </AppText>
            </View>

            <ScrollView
              style={styles.summaryList}
              contentContainerStyle={styles.summaryListContent}
            >
              {savedSummary?.items.map((item, idx) => (
                <View
                  key={`${item.description}-${item.amount}-${idx}`}
                  style={[styles.summaryItem, { backgroundColor: theme.surfaceSecondary }]}
                >
                  <AppText
                    variant="body"
                    weight="semibold"
                    style={styles.itemDesc}
                    numberOfLines={1}
                  >
                    {item.description}
                  </AppText>
                  <AppText variant="body" weight="bold" style={{ color: theme.primary }}>
                    {item.amount.toFixed(2)} {item.currency}
                  </AppText>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <AppButton
                variant="outline"
                onPress={() => {
                  setSavedSummary(null);
                  vm.bulkEditor.clearRows();
                }}
                style={styles.modalButton}
              >
                Continue Bulk
              </AppButton>
              <AppButton
                variant="primary"
                onPress={() => {
                  setSavedSummary(null);
                  AppNavigation.back();
                }}
                style={styles.modalButton}
              >
                Done
              </AppButton>
            </View>
          </View>
        </View>
      </Modal>
    </Page>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalContent: {
    width: '100%',
    maxHeight: '85%',
    borderRadius: Shape.radius.r3,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.lg,
    ...Shape.elevation.lg,
  },
  successHeader: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  modalTitle: {
    marginTop: Spacing.sm,
  },
  modalSubtitle: {
    textAlign: 'center',
  },
  summaryList: {
    width: '100%',
    maxHeight: 220,
  },
  summaryListContent: {
    gap: Spacing.sm,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: Shape.radius.r2,
  },
  itemDesc: {
    flex: 1,
    marginRight: Spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
    marginTop: Spacing.sm,
  },
  modalButton: {
    flex: 1,
  },
});
