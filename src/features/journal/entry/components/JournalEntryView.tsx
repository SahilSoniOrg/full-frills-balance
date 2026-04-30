import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { AppConfig, Spacing } from '@/src/constants';
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
import React, { useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, View } from 'react-native';

export function JournalEntryView(vm: JournalEntryViewModel) {
  const { theme } = useTheme();
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const {
    isLoading,
    headerTitle,
    showEditBanner,
    editBannerText,
    isGuidedMode,
    onToggleGuidedMode,
    simpleEditor,
    editor,
    simpleFormIsValid,
    advancedFormIsValid,
  } = vm;

  const handleSubmit = () => {
    if (isGuidedMode) {
      if (isAmountFocused && !simpleFormIsValid) {
        Keyboard.dismiss();
      } else {
        simpleEditor.handleSave();
      }
    } else {
      editor.submit();
    }
  };

  const isSubmitDisabled = isGuidedMode
    ? isAmountFocused
      ? false
      : !simpleFormIsValid
    : !advancedFormIsValid;

  const getSubmitLabel = () => {
    if (isGuidedMode) {
      if (isAmountFocused && !simpleFormIsValid) {
        return AppConfig.strings.transactionFlow.continue;
      }
      return simpleEditor.isSubmitting
        ? AppConfig.strings.transactionFlow.saving
        : AppConfig.strings.transactionFlow.save(simpleEditor.type);
    }

    if (editor.isSubmitting) {
      return editor.isEdit
        ? AppConfig.strings.advancedEntry.updating
        : AppConfig.strings.advancedEntry.creating;
    }

    return editor.isEdit
      ? AppConfig.strings.advancedEntry.updateJournal
      : AppConfig.strings.advancedEntry.createJournal;
  };

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
          label={getSubmitLabel()}
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
        {isGuidedMode ? (
          <View>
            <JournalMetaCard
              date={vm.editor.journalDate}
              setDate={vm.editor.setJournalDate}
              time={vm.editor.journalTime}
              setTime={vm.editor.setJournalTime}
              description={vm.editor.description}
              setDescription={vm.editor.setDescription}
              showBanner={showEditBanner}
              bannerText={editBannerText}
              variant="minimal"
            />

            <SimpleForm {...vm.simpleEditor} />
          </View>
        ) : (
          <View>
            <JournalMetaCard
              date={vm.editor.journalDate}
              setDate={vm.editor.setJournalDate}
              time={vm.editor.journalTime}
              setTime={vm.editor.setJournalTime}
              description={vm.editor.description}
              setDescription={vm.editor.setDescription}
              showBanner={showEditBanner}
              bannerText={editBannerText}
            />

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
