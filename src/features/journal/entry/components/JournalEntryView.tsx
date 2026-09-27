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
import { memo, useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { JournalEntryModeInfoModal } from './JournalEntryModeInfoModal';
import { JournalEntryModePickerModal } from './JournalEntryModePickerModal';
import { JournalEntrySubmitBar } from './JournalEntrySubmitBar';
import { JournalMetaCard, type JournalMetaCardProps } from './JournalMetaCard';
import type { AccountFlowHandle, AutopilotAppliedAccount } from './useSimpleFormExpansion';

export type JournalEntryViewProps = JournalEntryShell;

/**
 * Mount a mode on first use, then retain its subtree while another mode is active.
 * Ignoring prop changes while inactive prevents hidden forms from rerendering on
 * every journal edit; activation supplies the latest props to the retained tree.
 */
const KeepAliveModePanel = memo(
  function KeepAliveModePanel({
    active,
    children,
    visited,
  }: {
    active: boolean;
    children: ReactNode;
    visited: boolean;
  }) {
    if (!visited) return null;

    return (
      <View
        style={[styles.modePanel, !active && styles.modePanelHidden]}
        pointerEvents={active ? 'auto' : 'none'}
        accessibilityElementsHidden={!active}
        importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      >
        {children}
      </View>
    );
  },
  (previous, next) => !previous.active && !next.active && previous.visited === next.visited,
);

export function JournalEntryView(props: JournalEntryViewProps) {
  const { theme, fonts } = useTheme();
  const [helpMode, setHelpMode] = useState<JournalEntryScreenMode | null>(null);
  const notesAdded =
    props.editor.notes.trim() !== '' || props.editor.lines.some(line => line.notes.trim() !== '');
  const [showEntryNotes, setShowEntryNotes] = useState(notesAdded);
  const [notesWereAdded, setNotesWereAdded] = useState(notesAdded);
  if (notesAdded !== notesWereAdded) {
    setNotesWereAdded(notesAdded);
    if (notesAdded) setShowEntryNotes(true);
  }
  const [isVoiceModalVisible, setIsVoiceModalVisible] = useState(false);
  const [isModePickerVisible, setIsModePickerVisible] = useState(false);
  const [visitedModes, setVisitedModes] = useState<Set<JournalEntryScreenMode>>(
    () => new Set([props.activeMode]),
  );
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
  const dismissDescriptionOnScroll = useCallback(() => {
    descriptionInputRef.current?.blur();
    presentation.onScrollBeginDrag();
  }, [presentation.onScrollBeginDrag]);

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
      if (
        props.activeMode === 'basic' &&
        suggestion.route.sources.length === 1 &&
        suggestion.route.destinations.length === 1
      ) {
        return;
      }
      startGuidedAccountFlow(applied);
    },
    [onSelectSuggestion, props.activeMode, startGuidedAccountFlow],
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
    onCreateAccountForTarget,
    suggestions,
    suggestionState,
    showEditBanner,
    editBannerText,
    saveSuccessPulse,
    onClose,
  } = props;

  const handleModeChange = useCallback(
    (mode: JournalEntryScreenMode) => {
      setVisitedModes(previous => {
        if (previous.has(mode)) return previous;
        const next = new Set(previous);
        next.add(mode);
        return next;
      });
      onToggleMode(mode);
    },
    [onToggleMode],
  );

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
    notesAdded,
    showNotes: showEntryNotes,
    onNotesVisibilityChange: setShowEntryNotes,
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
              onScrollBeginDrag: dismissDescriptionOnScroll,
              scrollEventThrottle: 16,
              testID: 'journal-entry-page-scroll-view',
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
        <KeepAliveModePanel active={activeMode === 'basic'} visited={visitedModes.has('basic')}>
          <SimpleModePanel
            accounts={accounts}
            editor={editor}
            guidedAutopilot={guidedAutopilot}
            onCreateAccountForTarget={onCreateAccountForTarget}
            onSelectAccountRequest={onSelectAccountRequest}
            workplaceCurrency={valuationCurrency}
            workplaceId={workplaceId}
            meta={journalMetaProps}
            voiceModalVisible={activeMode === 'basic' && isVoiceModalVisible}
            onVoiceModalVisibleChange={setIsVoiceModalVisible}
            onScrollBeginDrag={dismissDescriptionOnScroll}
            onCalculatorDone={focusDescription}
            accountFlowRef={accountFlowRef}
          />
        </KeepAliveModePanel>
        <KeepAliveModePanel
          active={activeMode === 'allocation'}
          visited={visitedModes.has('allocation')}
        >
          <>
            {journalMetaCard}
            <SplitModePanel
              accounts={accounts}
              workplaceCurrency={valuationCurrency}
              editor={editor}
              onCreateAccountForTarget={onCreateAccountForTarget}
            />
          </>
        </KeepAliveModePanel>
        <KeepAliveModePanel active={activeMode === 'expert'} visited={visitedModes.has('expert')}>
          <>
            {journalMetaCard}
            <AdvancedModePanel
              accounts={accounts}
              editor={editor}
              workplaceCurrency={valuationCurrency}
              onCreateAccountForTarget={onCreateAccountForTarget}
              showLineNotes={showEntryNotes}
            />
          </>
        </KeepAliveModePanel>
        <KeepAliveModePanel active={activeMode === 'batch'} visited={visitedModes.has('batch')}>
          <BatchModePanel
            editor={props.batchEditor}
            accounts={accounts}
            workplaceCurrency={workplaceCurrency}
            workplaceId={workplaceId}
            summary={activeMode === 'batch' ? props.batchSummary : null}
            onContinue={props.onContinueBatch}
            onDone={props.onDoneBatch}
            onCreateAccountForTarget={onCreateAccountForTarget}
          />
        </KeepAliveModePanel>
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
        onSelectMode={handleModeChange}
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
          onUseMode={handleModeChange}
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
  modePanelHidden: {
    display: 'none',
  },
  modePanel: {
    flex: 1,
  },
});
