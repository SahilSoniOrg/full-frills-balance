import { AccountPickerModal } from '@/src/components/account-selection';
import { AppIcon, AppText, Icon } from '@/src/components/core';
import { EmptyStateView } from '@/src/components/shared/EmptyStateView';
import { AppConfig } from '@/src/constants';
import { Opacity, Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { Page } from '@/src/design-system';
import { useJournalEntryPresentationState } from '@/src/features/journal/entry/hooks/useJournalEntryPresentationState';
import { JournalEntryShell } from '@/src/features/journal/entry/hooks/useJournalEntryShell';
import { JOURNAL_ENTRY_MODE_OPTIONS } from '@/src/features/journal/entry/journalEntryMode';
import { type JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { AdvancedModePanel } from '@/src/features/journal/entry/modes/advanced/AdvancedModePanel';
import { BatchModePanel } from '@/src/features/journal/entry/modes/batch/BatchModePanel';
import { SimpleModePanel } from '@/src/features/journal/entry/modes/simple/SimpleModePanel';
import { SplitModePanel } from '@/src/features/journal/entry/modes/split/SplitModePanel';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/utils/color-math';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { JournalEntryModeInfoModal } from './JournalEntryModeInfoModal';
import { JournalEntryModePickerModal } from './JournalEntryModePickerModal';
import { JournalEntrySubmitBar } from './JournalEntrySubmitBar';
import { JournalMetaCard, type JournalMetaCardProps } from './JournalMetaCard';
import type { AccountFlowHandle, AutopilotAppliedAccount } from './useSimpleFormExpansion';

export type JournalEntryViewProps = JournalEntryShell;

export function JournalEntryView(props: JournalEntryViewProps) {
  const { theme, fonts } = useTheme();
  const [helpMode, setHelpMode] = useState<JournalEntryScreenMode | null>(null);
  const [isVoiceModalVisible, setIsVoiceModalVisible] = useState(false);
  const [isModePickerVisible, setIsModePickerVisible] = useState(false);
  const descriptionInputRef = useRef<TextInput>(null);
  const accountFlowRef = useRef<AccountFlowHandle | null>(null);

  const presentation = useJournalEntryPresentationState(props);
  const {
    isSubmitting,
    isBatchMode,
    submitLabel,
    isSubmitDisabled,
    missingRequirementHint,
    batchSubmitDisabled,
    hideSuggestions,
    onDescriptionFocus,
    setDescription,
    onSelectSuggestion,
  } = presentation;

  const focusDescription = useCallback(() => {
    setTimeout(() => descriptionInputRef.current?.focus(), 0);
  }, []);

  const startGuidedAccountFlow = useCallback(
    (applied?: AutopilotAppliedAccount) => {
      if (props.activeMode !== 'basic') return;
      accountFlowRef.current?.start(applied);
    },
    [props.activeMode],
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: Parameters<typeof onSelectSuggestion>[0]) => {
      const applied = onSelectSuggestion(suggestion);
      startGuidedAccountFlow(applied);
    },
    [onSelectSuggestion, startGuidedAccountFlow],
  );

  const {
    isLoading,
    loadState,
    headerTitle,
    activeMode,
    onToggleMode,
    accounts,
    editor,
    workplaceId,
    workplaceCurrency,
    guidedAutopilot,
    onSelectAccountRequest,
    showAccountPicker,
    accountPickerTitle,
    isSplitModeDisabled,
    selectableAccounts,
    selectedAccountId,
    onAccountSelected,
    onCloseAccountPicker,
    onAccountPickerDismiss,
    onCreateAccountRequest,
    onCreateAccountRequestForRole,
    onCreateAccountRequestForBatchRow,
    onCreateAccountRequestForSplitRow,
    suggestions,
    suggestionState,
    showEditBanner,
    editBannerText,
    saveSuccessPulse,
    onClose,
  } = props;

  const currentModeOption =
    JOURNAL_ENTRY_MODE_OPTIONS.find(opt => opt.id === activeMode) || JOURNAL_ENTRY_MODE_OPTIONS[0];
  const valuationCurrency = editor.valuationCurrency;

  if (isLoading) {
    return (
      <Page>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </Page>
    );
  }

  if (loadState === 'not_found' || loadState === 'error') {
    return (
      <Page>
        <EmptyStateView
          title={loadState === 'not_found' ? 'Transaction not found' : 'Unable to load transaction'}
          subtitle="The transaction could not be loaded. Go back and try again."
          icon={Icon.Error}
          primaryActionLabel="Go Back"
          onPrimaryAction={onClose}
        />
      </Page>
    );
  }

  const journalMetaProps: JournalMetaCardProps = {
    description: editor.description,
    setDescription,
    date: editor.journalDate,
    setDate: editor.setJournalDate,
    time: editor.journalTime,
    setTime: editor.setJournalTime,
    notes: editor.notes,
    setNotes: editor.setNotes,
    suggestions,
    suggestionState,
    onSelectSuggestion: handleSelectSuggestion,
    activeTabType: activeMode === 'basic' ? editor.transactionType : undefined,
    accounts,
    onDescriptionFocus,
    hideSuggestions,
    onVoiceInputPress: activeMode === 'basic' ? () => setIsVoiceModalVisible(true) : undefined,
    showBanner: showEditBanner,
    bannerText: editBannerText,
    onDescriptionSubmitEditing: startGuidedAccountFlow,
    descriptionInputRef,
  };
  const journalMetaCard = !isBatchMode ? <JournalMetaCard {...journalMetaProps} /> : null;

  return (
    <Page
      testID="journal-entry-screen"
      keyboardAvoiding
      scrollable={!isBatchMode && activeMode !== 'basic'}
      scrollViewProps={
        activeMode !== 'basic'
          ? {
              keyboardShouldPersistTaps: 'handled',
              onScrollBeginDrag: presentation.onScrollBeginDrag,
              scrollEventThrottle: 16,
              contentContainerStyle: { paddingBottom: Spacing.xxxxl + Size.xxl },
            }
          : undefined
      }
      header={
        <View style={[styles.headerContainer, { backgroundColor: theme.background }]}>
          {/* Top Bar: Close, title, and mode selector */}
          <View style={styles.topNavRow}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.headerIconButton}
              accessibilityLabel={AppConfig.strings.common.cancel}
              accessibilityRole="button"
            >
              <AppIcon name={Icon.Close} size={Size.iconMd} color={theme.text} />
            </TouchableOpacity>

            <View style={styles.titleWrap}>
              <AppText
                variant="heading"
                style={[styles.headerTitle, { fontFamily: fonts.bold }]}
                numberOfLines={1}
              >
                {headerTitle}
              </AppText>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setIsModePickerVisible(true)}
                style={[
                  styles.modeBadgePill,
                  {
                    backgroundColor: withOpacity(theme.primary, Opacity.soft),
                    borderColor: withOpacity(theme.primary, Opacity.medium),
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Transaction mode: ${currentModeOption.label}. Tap to change mode.`}
                testID="journal-entry-mode-selector-trigger"
                hitSlop={{
                  top: Spacing.sm,
                  bottom: Spacing.sm,
                  left: Spacing.sm,
                  right: Spacing.sm,
                }}
              >
                <AppText variant="caption" weight="bold" style={{ color: theme.primary }}>
                  {currentModeOption.label}
                </AppText>
                <AppIcon name={Icon.ChevronDown} size={Size.xxs} color={theme.primary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      }
      footer={
        <JournalEntrySubmitBar
          onPress={props.onSubmit}
          disabled={isBatchMode ? batchSubmitDisabled : isSubmitDisabled}
          label={isBatchMode ? `Post ${props.batchEditor.rows.length} transactions` : submitLabel}
          loading={isBatchMode ? props.batchEditor.isSubmitting : isSubmitting}
          saveSuccessPulse={saveSuccessPulse}
          missingRequirementHint={missingRequirementHint}
        />
      }
    >
      <View style={styles.bodyContent}>
        {/* Simple mode */}
        {activeMode === 'basic' ? (
          <SimpleModePanel
            accounts={accounts}
            editor={editor}
            guidedAutopilot={guidedAutopilot}
            onCreateAccountRequestForRole={onCreateAccountRequestForRole}
            onSelectAccountRequest={onSelectAccountRequest}
            workplaceCurrency={valuationCurrency}
            workplaceId={workplaceId}
            meta={journalMetaProps}
            voiceModalVisible={isVoiceModalVisible}
            onVoiceModalVisibleChange={setIsVoiceModalVisible}
            onScrollBeginDrag={presentation.onScrollBeginDrag}
            onCalculatorDone={focusDescription}
            accountFlowRef={accountFlowRef}
          />
        ) : activeMode === 'allocation' ? (
          <>
            {journalMetaCard}
            <SplitModePanel
              accounts={accounts}
              workplaceCurrency={valuationCurrency}
              editor={editor}
              onCreateAccountRequestForRow={onCreateAccountRequestForSplitRow}
            />
          </>
        ) : activeMode === 'expert' ? (
          <>
            {journalMetaCard}
            <AdvancedModePanel
              editor={editor}
              workplaceCurrency={valuationCurrency}
              onSelectAccountRequest={onSelectAccountRequest}
            />
          </>
        ) : (
          <BatchModePanel
            editor={props.batchEditor}
            accounts={accounts}
            workplaceCurrency={workplaceCurrency}
            workplaceId={workplaceId}
            summary={props.batchSummary}
            onContinue={props.onContinueBatch}
            onDone={props.onDoneBatch}
            onCreateAccountRequestForRow={onCreateAccountRequestForBatchRow}
          />
        )}
      </View>

      {/* Account Picker Modal */}
      <AccountPickerModal
        visible={showAccountPicker}
        title={accountPickerTitle}
        accounts={selectableAccounts}
        selectedId={selectedAccountId}
        onSelect={onAccountSelected}
        onClose={onCloseAccountPicker}
        onDismiss={onAccountPickerDismiss}
        onCreateRequest={onCreateAccountRequest}
        excludeParentAccounts={true}
      />

      {/* Mode Picker Bottom Sheet */}
      <JournalEntryModePickerModal
        visible={isModePickerVisible}
        activeMode={activeMode}
        isSimpleDisabled={props.isSimpleModeDisabled}
        isSplitDisabled={isSplitModeDisabled}
        onSelectMode={onToggleMode}
        onHelpMode={mode => {
          setIsModePickerVisible(false);
          setHelpMode(mode);
        }}
        onClose={() => setIsModePickerVisible(false)}
      />

      {/* Per-mode Help */}
      {helpMode && (
        <JournalEntryModeInfoModal
          visible
          mode={helpMode}
          isActive={helpMode === activeMode}
          canUseMode={
            helpMode === 'basic'
              ? !props.isSimpleModeDisabled
              : helpMode === 'allocation'
                ? !isSplitModeDisabled
                : true
          }
          onUseMode={onToggleMode}
          onClose={() => setHelpMode(null)}
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    paddingBottom: Spacing.xs,
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  headerIconButton: {
    padding: Spacing.xs,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: Spacing.sm,
    justifyContent: 'center',
  },
  headerTitle: {
    textAlign: 'left',
  },
  modeBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  bodyContent: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
  },
});
