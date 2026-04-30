import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { Spacing } from '@/src/constants';
import { Page } from '@/src/design-system';
import { AdvancedForm } from '@/src/features/journal/entry/components/AdvancedForm';
import { JournalEntryHeader } from '@/src/features/journal/entry/components/JournalEntryHeader';
import { JournalMetaCard } from '@/src/features/journal/entry/components/JournalMetaCard';
import { JournalModeToggle } from '@/src/features/journal/entry/components/JournalModeToggle';
import { JournalSummary } from '@/src/features/journal/entry/components/JournalSummary';
import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import { SimpleFormAmountInput } from '@/src/features/journal/entry/components/SimpleFormAmountInput';
import { JournalEntryViewModel } from '@/src/features/journal/entry/hooks/useJournalEntryViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function JournalEntryView(vm: JournalEntryViewModel) {
  const { theme } = useTheme();
  const {
    isLoading,
    headerTitle,
    showEditBanner,
    editBannerText,
    isGuidedMode,
    onToggleGuidedMode,
    simpleEditor,
    submitLabel,
    isSubmitDisabled,
    handleSubmit,
    setIsAmountFocused,
  } = vm;

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
      scrollable
      header={
        <JournalEntryHeader
          title={headerTitle}
          rightSlot={
            <JournalModeToggle
              isGuidedMode={isGuidedMode}
              setIsGuidedMode={onToggleGuidedMode}
              variant="compact"
              isSimpleDisabled={vm.isSimpleModeDisabled}
            />
          }
        />
      }
      footer={
        <SubmitFooter
          onPress={handleSubmit}
          disabled={isSubmitDisabled}
          label={submitLabel}
          topSlot={
            isGuidedMode ? (
              <SimpleFormAmountInput
                amount={vm.primaryDisplayAmount}
                setAmount={simpleEditor.setAmount}
                readOnly={!isGuidedMode}
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
        {/* Shared Metadata Card */}
        <JournalMetaCard
          date={vm.editor.journalDate}
          setDate={vm.editor.setJournalDate}
          time={vm.editor.journalTime}
          setTime={vm.editor.setJournalTime}
          description={vm.editor.description}
          setDescription={vm.editor.setDescription}
          showBanner={showEditBanner}
          bannerText={editBannerText}
          variant={isGuidedMode ? 'minimal' : 'default'}
        />

        {isGuidedMode ? (
          <SimpleForm {...vm.simpleEditor} />
        ) : (
          <View style={{ paddingHorizontal: Spacing.lg }}>
            <AdvancedForm
              accounts={vm.accounts}
              editor={vm.editor}
              onSelectAccountRequest={vm.advancedFormConfig.onSelectAccountRequest}
            />
            <JournalSummary
              totalDebits={vm.totalDebits}
              totalCredits={vm.totalCredits}
              isBalanced={vm.isBalanced}
              availableCurrencies={vm.availableCurrencies}
              selectedCurrency={vm.selectedCurrency}
              onSelectCurrency={vm.onSelectCurrency}
            />
          </View>
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
  content: {},
});
