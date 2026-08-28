import { AccountPickerModal } from '@/src/components/account-selection';
import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { EmptyStateView } from '@/src/components/common/EmptyStateView';
import { Page } from '@/src/design-system';
import { JournalEntryHeader } from '@/src/features/journal/entry/components/JournalEntryHeader';
import { JournalEntryModeBody } from '@/src/features/journal/entry/components/JournalEntryModeBody';
import { JournalMetaCard } from '@/src/features/journal/entry/components/JournalMetaCard';
import { JournalModeBar } from '@/src/features/journal/entry/components/JournalModeBar';
import { JournalEntryShell } from '@/src/features/journal/entry/hooks/useJournalEntryShell';
import { GuidedFooterAmountSlot } from '@/src/features/journal/entry/modes/guided/GuidedModePanel';
import { useJournalEntryPresentationState } from '@/src/features/journal/entry/hooks/useJournalEntryPresentationState';
import { useTheme } from '@/src/hooks/use-theme';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function JournalEntryView(vm: JournalEntryShell) {
  const { theme } = useTheme();
  const {
    hideSuggestions,
    isSubmitting,
    isBatchMode,
    submitLabel,
    isSubmitDisabled,
    batchSubmitDisabled,
    onScrollBeginDrag,
    onDescriptionFocus,
    setDescription,
    onSelectSuggestion,
    modeBodyProps,
  } = useJournalEntryPresentationState(vm);

  const {
    isLoading,
    loadState,
    headerTitle,
    showEditBanner,
    editBannerText,
    activeMode,
    onToggleMode,
    guidedFooterAmount,
  } = vm;

  if (isLoading) {
    return (
      <Page
        header={
          <JournalEntryHeader title={headerTitle} onClose={vm.onClose} mode={vm.activeMode} />
        }
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </Page>
    );
  }

  if (loadState === 'not_found' || loadState === 'error') {
    return (
      <Page
        header={
          <JournalEntryHeader title={headerTitle} onClose={vm.onClose} mode={vm.activeMode} />
        }
      >
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
      scrollable={!isBatchMode}
      scrollViewProps={{
        onScrollBeginDrag,
        scrollEventThrottle: 16,
      }}
      header={
        <>
          <JournalEntryHeader title={headerTitle} onClose={vm.onClose} mode={activeMode} />
          <JournalModeBar
            mode={activeMode}
            onToggleMode={onToggleMode}
            isSimpleDisabled={vm.isSimpleModeDisabled}
          />
        </>
      }
      footer={
        <SubmitFooter
          onPress={vm.onSubmit}
          disabled={isBatchMode ? batchSubmitDisabled : isSubmitDisabled}
          label={isBatchMode ? `Post ${vm.batchEditor.rows.length} transactions` : submitLabel}
          loading={isBatchMode ? vm.batchEditor.isSubmitting : isSubmitting}
          topSlot={
            !isBatchMode && guidedFooterAmount ? (
              <GuidedFooterAmountSlot footerAmount={guidedFooterAmount} />
            ) : undefined
          }
        />
      }
    >
      <View style={styles.content}>
        {!isBatchMode && (
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
            suggestionState={vm.suggestionState}
            hideSuggestions={hideSuggestions}
            onDescriptionFocus={onDescriptionFocus}
            onVoiceInputPress={
              activeMode === 'basic' ? () => vm.guidedVoiceActionsRef.current?.open() : undefined
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
