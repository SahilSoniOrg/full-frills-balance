import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { Page } from '@/src/design-system';
import { BulkSaveSummaryModal } from '@/src/features/journal/entry/components/BulkSaveSummaryModal';
import { JournalEntryHeader } from '@/src/features/journal/entry/components/JournalEntryHeader';
import {
  JournalEntryModeBody,
  JournalEntryModeBodyProps,
} from '@/src/features/journal/entry/components/JournalEntryModeBody';
import { JournalMetaCard } from '@/src/features/journal/entry/components/JournalMetaCard';
import { JournalModeToggle } from '@/src/features/journal/entry/components/JournalModeToggle';
import { SimpleFormAmountInput } from '@/src/features/journal/entry/components/SimpleFormAmountInput';
import { VoiceInputModal } from '@/src/features/journal/entry/components/VoiceInputModal';
import { JournalEntryViewModel } from '@/src/features/journal/entry/hooks/useJournalEntryViewModel';
import { resolveSimpleTypeAccentColor } from '@/src/features/journal/entry/journalEntryPresentation';
import { useActiveModeHandle } from '@/src/features/journal/entry/modes/ModeHandleContext';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function JournalEntryView(vm: JournalEntryViewModel) {
  const { theme } = useTheme();
  const [hideSuggestions, setHideSuggestions] = useState(false);
  const modeHandle = useActiveModeHandle();

  const {
    isLoading,
    headerTitle,
    showEditBanner,
    editBannerText,
    activeMode,
    onToggleMode,
    workplaceId,
    isVoiceModalVisible,
    setIsVoiceModalVisible,
    handleApplyVoiceInput,
    savedSummary,
    setSavedSummary,
  } = vm;

  const submitLabel = modeHandle?.submitLabel ?? '';
  const isSubmitDisabled = modeHandle?.isSubmitDisabled ?? true;
  const handleSubmit = modeHandle?.submit ?? (() => {});
  const isSubmitting = modeHandle?.isSubmitting ?? false;
  const footerAmount = modeHandle?.footerAmount;

  const onScrollBeginDrag = useCallback(() => setHideSuggestions(true), []);
  const onDescriptionFocus = useCallback(() => setHideSuggestions(false), []);
  const setDescription = useCallback(
    (desc: string) => {
      setHideSuggestions(false);
      vm.editor.setDescription(desc);
    },
    [vm.editor],
  );

  const modeBodyProps: JournalEntryModeBodyProps = {
    activeMode: vm.activeMode,
    accounts: vm.accounts,
    editor: vm.editor,
    workplaceId: vm.workplaceId,
    workplaceCurrency: vm.workplaceCurrency,
    onSelectAccountRequest: vm.onSelectAccountRequest,
    onBulkSaveSuccess: vm.onBulkSaveSuccess,
    bulkActionsRef: vm.bulkActionsRef,
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
      testID="journal-entry-screen"
      keyboardAvoiding
      scrollable={activeMode !== 'bulk'}
      scrollViewProps={{
        onScrollBeginDrag,
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
          loading={isSubmitting}
          topSlot={
            footerAmount ? (
              <SimpleFormAmountInput
                amount={footerAmount.amount}
                setAmount={footerAmount.setAmount}
                readOnly={false}
                activeColor={resolveSimpleTypeAccentColor(footerAmount.accentType, theme)}
                displayCurrency={footerAmount.displayCurrency}
                onFocus={footerAmount.onFocus}
                onBlur={footerAmount.onBlur}
                variant="default"
              />
            ) : undefined
          }
        />
      }
    >
      <View style={styles.content}>
        {activeMode !== 'bulk' && (
          <JournalMetaCard
            date={vm.editor.journalDate}
            setDate={vm.editor.setJournalDate}
            time={vm.editor.journalTime}
            setTime={vm.editor.setJournalTime}
            description={vm.editor.description}
            setDescription={setDescription}
            notes={vm.editor.notes}
            setNotes={vm.editor.setNotes}
            showBanner={showEditBanner}
            bannerText={editBannerText}
            variant="minimal"
            density="tight"
            suggestions={vm.suggestions}
            hideSuggestions={hideSuggestions}
            onDescriptionFocus={onDescriptionFocus}
            onVoiceInputPress={() => setIsVoiceModalVisible(true)}
          />
        )}

        <JournalEntryModeBody {...modeBodyProps} />
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

      <BulkSaveSummaryModal
        summary={savedSummary}
        onClose={() => setSavedSummary(null)}
        onContinueBulk={() => {
          setSavedSummary(null);
          vm.bulkActionsRef.current?.clearRows();
        }}
        onDone={() => {
          setSavedSummary(null);
          AppNavigation.back();
        }}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
});
