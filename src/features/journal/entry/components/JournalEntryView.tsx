import { AccountPickerModal } from '@/src/components/account-selection';
import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { EmptyStateView } from '@/src/components/common/EmptyStateView';
import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { Page } from '@/src/design-system';
import { JournalEntryHeader } from '@/src/features/journal/entry/components/JournalEntryHeader';
import {
  JournalEntryModeBody,
  JournalEntryModeBodyProps,
} from '@/src/features/journal/entry/components/JournalEntryModeBody';
import { JournalMetaCard } from '@/src/features/journal/entry/components/JournalMetaCard';
import { JournalModeBar } from '@/src/features/journal/entry/components/JournalModeBar';
import { JournalEntryShell } from '@/src/features/journal/entry/hooks/useJournalEntryShell';
import { GuidedFooterAmountSlot } from '@/src/features/journal/entry/modes/guided/GuidedModePanel';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function JournalEntryView(vm: JournalEntryShell) {
  const { theme } = useTheme();
  const [hideSuggestions, setHideSuggestions] = useState(false);
  const submitLabel = vm.modeSubmitState?.submitLabel ?? '';
  const isSubmitDisabled = vm.modeSubmitState?.isSubmitDisabled ?? true;
  const isSubmitting = vm.modeSubmitState?.isSubmitting ?? false;

  const {
    isLoading,
    loadState,
    headerTitle,
    showEditBanner,
    editBannerText,
    activeMode,
    onToggleMode,
    guidedFooterAmount,
    loadSuggestions,
    editor,
    onSelectSuggestion: handleSelectSuggestion,
  } = vm;

  const onScrollBeginDrag = useCallback(() => setHideSuggestions(true), []);
  const onDescriptionFocus = useCallback(() => {
    setHideSuggestions(false);
    loadSuggestions();
  }, [loadSuggestions]);
  const setDescription = useCallback(
    (desc: string) => {
      setHideSuggestions(false);
      loadSuggestions();
      editor.setDescription(desc);
    },
    [editor, loadSuggestions],
  );
  const onSelectSuggestion = useCallback(
    (suggestion: JournalAutofillSuggestion) => {
      setHideSuggestions(false);
      handleSelectSuggestion(suggestion);
    },
    [handleSelectSuggestion],
  );

  const modeBodyProps: JournalEntryModeBodyProps = {
    activeMode: vm.activeMode,
    accounts: vm.accounts,
    editor: vm.editor,
    splitDraft: vm.splitDraft,
    onSubmitStateChange: vm.onSubmitStateChange,
    workplaceId: vm.workplaceId,
    workplaceCurrency: vm.workplaceCurrency,
    onSelectAccountRequest: vm.onSelectAccountRequest,
    onGuidedFooterAmountChange: vm.onGuidedFooterAmountChange,
    guidedVoiceActionsRef: vm.guidedVoiceActionsRef,
  };

  if (isLoading) {
    return (
      <Page header={<JournalEntryHeader title={headerTitle} onClose={vm.onClose} />}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </Page>
    );
  }

  if (loadState === 'not_found' || loadState === 'error') {
    return (
      <Page header={<JournalEntryHeader title={headerTitle} onClose={vm.onClose} />}>
        <EmptyStateView
          title={loadState === 'not_found' ? 'Transaction not found' : 'Unable to load transaction'}
          subtitle={
            loadState === 'error'
              ? 'The transaction could not be loaded. Go back and try again.'
              : 'This transaction may have been deleted or moved.'
          }
          icon="error"
          primaryActionLabel="Go Back"
          onPrimaryAction={vm.onClose}
        />
      </Page>
    );
  }

  return (
    <Page
      testID="journal-entry-screen"
      keyboardAvoiding
      scrollable
      scrollViewProps={{
        onScrollBeginDrag,
        scrollEventThrottle: 16,
      }}
      header={
        <>
          <JournalEntryHeader title={headerTitle} onClose={vm.onClose} />
          <JournalModeBar
            mode={activeMode}
            onToggleMode={onToggleMode}
            isSimpleDisabled={vm.isSimpleModeDisabled}
            onOpenBatch={AppNavigation.toBulkJournalEntry}
          />
        </>
      }
      footer={
        <SubmitFooter
          onPress={vm.onSubmit}
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
        <JournalMetaCard
          date={vm.editor.journalDate}
          setDate={vm.editor.setJournalDate}
          time={vm.editor.journalTime}
          setTime={vm.editor.setJournalTime}
          description={vm.editor.description}
          setDescription={setDescription}
          onSelectSuggestion={onSelectSuggestion}
          activeTabType={activeMode === 'basic' ? vm.editor.transactionType : undefined}
          accounts={vm.accounts}
          notes={vm.editor.notes}
          setNotes={vm.editor.setNotes}
          showBanner={showEditBanner}
          bannerText={editBannerText}
          suggestions={vm.suggestions}
          hideSuggestions={hideSuggestions}
          onDescriptionFocus={onDescriptionFocus}
          onVoiceInputPress={
            activeMode === 'basic' ? () => vm.guidedVoiceActionsRef.current?.open() : undefined
          }
        />

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
