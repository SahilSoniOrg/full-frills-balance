import { AccountPickerModal } from '@/src/components/account-selection';
import { SubmitFooter } from '@/src/components/forms/SubmitFooter';
import { EmptyStateView } from '@/src/components/shared/EmptyStateView';
import { ChromeMotion, Scale } from '@/src/constants';
import { Page } from '@/src/design-system';
import { JournalEntryHeader } from '@/src/features/journal/entry/components/JournalEntryHeader';
import { JournalEntryModeBody } from '@/src/features/journal/entry/components/JournalEntryModeBody';
import { JournalMetaCard } from '@/src/features/journal/entry/components/JournalMetaCard';
import { JournalModeBar } from '@/src/features/journal/entry/components/JournalModeBar';
import { JournalEntryShell } from '@/src/features/journal/entry/hooks/useJournalEntryShell';
import { GuidedFooterAmountSlot } from '@/src/features/journal/entry/modes/guided/GuidedModePanel';
import { useJournalEntryPresentationState } from '@/src/features/journal/entry/hooks/useJournalEntryPresentationState';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { MotiView } from 'moti';
import { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  findNodeHandle,
  GestureResponderEvent,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Icon } from '@/src/types/domainIcons';

export function JournalEntryView(vm: JournalEntryShell) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const descriptionInputRef = useRef<TextInput>(null);
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
    editor,
    isLoading,
    loadState,
    headerTitle,
    showEditBanner,
    editBannerText,
    activeMode,
    onToggleMode,
    onSelectAccountRequest,
    guidedFooterAmount,
  } = vm;

  const focusDescription = useCallback(() => {
    setTimeout(() => descriptionInputRef.current?.focus(), 0);
  }, []);

  const startGuidedAccountFlow = useCallback(() => {
    if (activeMode !== 'basic') return;
    const sourceLineId = editor.getLineIdByRole('source');
    if (sourceLineId) {
      onSelectAccountRequest(sourceLineId, { autoAdvance: true });
    }
  }, [activeMode, editor, onSelectAccountRequest]);

  const handleSelectSuggestion = useCallback(
    (suggestion: Parameters<typeof onSelectSuggestion>[0]) => {
      onSelectSuggestion(suggestion);
      startGuidedAccountFlow();
    },
    [onSelectSuggestion, startGuidedAccountFlow],
  );

  const dismissContentInput = useCallback((event: GestureResponderEvent) => {
    if (event.target !== event.currentTarget) return;
    const focusedInput = TextInput.State.currentlyFocusedInput();
    if (focusedInput) TextInput.State.blurTextInput(focusedInput);
    Keyboard.dismiss();
  }, []);

  const dismissInputOnOutsideTouch = useCallback((event: GestureResponderEvent) => {
    const focusedInput = TextInput.State.currentlyFocusedInput();
    if (!focusedInput) return false;

    const focusedTarget = findNodeHandle(
      focusedInput as unknown as Parameters<typeof findNodeHandle>[0],
    );
    if (focusedTarget && String(event.nativeEvent.target) !== String(focusedTarget)) {
      TextInput.State.blurTextInput(focusedInput);
      Keyboard.dismiss();
    }
    return false;
  }, []);

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
          icon={Icon.Error}
          primaryActionLabel="Go Back"
          onPrimaryAction={vm.onClose}
        />
      </Page>
    );
  }

  const showSavePulse = vm.saveSuccessPulse && !reduceMotion;

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
        <MotiView
          animate={{ scale: showSavePulse ? 1.03 : Scale.identity }}
          transition={ChromeMotion.spring}
        >
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
        </MotiView>
      }
    >
      <View
        style={styles.content}
        onStartShouldSetResponderCapture={dismissInputOnOutsideTouch}
        onStartShouldSetResponder={event => event.target === event.currentTarget}
        onResponderRelease={dismissContentInput}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            const focusedInput = TextInput.State.currentlyFocusedInput();
            if (focusedInput) TextInput.State.blurTextInput(focusedInput);
            Keyboard.dismiss();
          }}
          accessible={false}
        />
        {!isBatchMode && (
          <JournalMetaCard
            date={vm.editor.journalDate}
            setDate={vm.editor.setJournalDate}
            time={vm.editor.journalTime}
            setTime={vm.editor.setJournalTime}
            description={vm.editor.description}
            setDescription={setDescription}
            onSelectSuggestion={handleSelectSuggestion}
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
            onDescriptionSubmitEditing={startGuidedAccountFlow}
            descriptionInputRef={descriptionInputRef}
            onVoiceInputPress={
              activeMode === 'basic' ? () => vm.guidedVoiceActionsRef.current?.open() : undefined
            }
          />
        )}

        <JournalEntryModeBody {...modeBodyProps} onGuidedDescriptionFocus={focusDescription} />
      </View>

      <AccountPickerModal
        visible={vm.showAccountPicker}
        title={vm.accountPickerTitle}
        accounts={vm.selectableAccounts}
        selectedId={vm.selectedAccountId}
        onSelect={vm.onAccountSelected}
        onClose={vm.onCloseAccountPicker}
        onDismiss={vm.onAccountPickerDismiss}
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
    position: 'relative',
  },
});
