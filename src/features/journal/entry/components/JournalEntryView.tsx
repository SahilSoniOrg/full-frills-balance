import { AccountPickerModal } from '@/src/features/accounts';
import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { Page } from '@/src/design-system';
import { BulkSaveSummaryModal } from '@/src/features/journal/entry/components/BulkSaveSummaryModal';
import { JournalEntryHeader } from '@/src/features/journal/entry/components/JournalEntryHeader';
import {
  JournalEntryModeBody,
  JournalEntryModeBodyProps,
} from '@/src/features/journal/entry/components/JournalEntryModeBody';
import { JournalMetaCard } from '@/src/features/journal/entry/components/JournalMetaCard';
import { JournalModeBar } from '@/src/features/journal/entry/components/JournalModeBar';
import { JournalEntryShell } from '@/src/features/journal/entry/hooks/useJournalEntryShell';
import { GuidedFooterAmountSlot } from '@/src/features/journal/entry/modes/guided/GuidedModePanel';
import { useModeSubmitBar } from '@/src/features/journal/entry/modes/ModeHandleContext';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function JournalEntryView(vm: JournalEntryShell) {
  const { theme } = useTheme();
  const [hideSuggestions, setHideSuggestions] = useState(false);
  const { submitLabel, isSubmitDisabled, isSubmitting, submit } = useModeSubmitBar();

  const {
    isLoading,
    headerTitle,
    showEditBanner,
    editBannerText,
    activeMode,
    onToggleMode,
    savedSummary,
    setSavedSummary,
    guidedFooterAmount,
  } = vm;

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
    onGuidedFooterAmountChange: vm.onGuidedFooterAmountChange,
    guidedVoiceActionsRef: vm.guidedVoiceActionsRef,
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
          <JournalModeBar
            mode={activeMode}
            onToggleMode={onToggleMode}
            isSimpleDisabled={vm.isSimpleModeDisabled}
          />
        </>
      }
      footer={
        <SubmitFooter
          onPress={submit}
          disabled={isSubmitDisabled}
          label={submitLabel}
          loading={isSubmitting}
          topSlot={
            guidedFooterAmount ? (
              <GuidedFooterAmountSlot footerAmount={guidedFooterAmount} />
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
            suggestions={vm.suggestions}
            hideSuggestions={hideSuggestions}
            onDescriptionFocus={onDescriptionFocus}
            onVoiceInputPress={
              activeMode === 'guided' ? () => vm.guidedVoiceActionsRef.current?.open() : undefined
            }
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
