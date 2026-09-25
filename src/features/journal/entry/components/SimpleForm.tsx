import { type CreateAccountIntent } from '@/src/components/account-selection';
import { Size, Spacing } from '@/src/constants/design-tokens';
import type { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { EntryTransactionCard } from './EntryTransactionCard';
import type { JournalMetaCardProps } from './JournalMetaCard';
import { useSimpleFormExpansion, type AccountFlowHandle } from './useSimpleFormExpansion';
import type { AccountRole } from '@/src/types/domainJournal';
import React, { type RefObject, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

export interface SimpleFormProps {
  editor: ReturnType<typeof useSimpleJournalEditor>;
  accentColor: string;
  precision?: number;
  meta: JournalMetaCardProps;
  onScrollBeginDrag?: () => void;
  onCreateAccountRequest?: (role: AccountRole, intent: CreateAccountIntent) => void;
  autoOpenCalculator?: boolean;
  autopilotFirstRole?: AccountRole;
  onCalculatorDone?: () => void;
  accountFlowRef?: RefObject<AccountFlowHandle | null>;
}

export const SimpleForm = React.memo(function SimpleForm({
  editor,
  accentColor,
  precision = 2,
  meta,
  onScrollBeginDrag,
  onCreateAccountRequest,
  autoOpenCalculator = false,
  autopilotFirstRole,
  onCalculatorDone,
  accountFlowRef,
}: SimpleFormProps) {
  const sourceSection = editor.accountSections.find(section => section.role === 'source');
  const destinationSection = editor.accountSections.find(section => section.role === 'destination');
  const {
    expansionPosition,
    handleSelectDestination,
    handleSelectSource,
    handleToggleExpansion,
    startAutopilotAccountFlow,
  } = useSimpleFormExpansion({
    type: editor.type,
    sourceId: editor.sourceId,
    destinationId: editor.destinationId,
    autopilotFirstRole,
    onSelectSource: id => sourceSection?.onSelect(id),
    onSelectDestination: id => destinationSection?.onSelect(id),
  });

  useEffect(() => {
    if (!accountFlowRef) return;
    accountFlowRef.current = { start: startAutopilotAccountFlow };
    return () => {
      accountFlowRef.current = null;
    };
  }, [accountFlowRef, startAutopilotAccountFlow]);

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={onScrollBeginDrag}
      scrollEventThrottle={16}
      testID="simple-entry-scroll-view"
    >
      <EntryTransactionCard
        density="hero"
        meta={meta}
        type={editor.type}
        onChangeType={editor.setType}
        accentColor={accentColor}
        amount={editor.amount}
        onChangeAmount={editor.setAmount}
        currency={editor.displayCurrency}
        precision={precision}
        autoOpenCalculator={autoOpenCalculator}
        onCalculatorDone={onCalculatorDone}
        pair={editor.fxPair}
        onManualBaseRateChange={editor.setManualBaseRate}
        onConvertedAmountChange={editor.setConvertedAmount}
        onResetToApiRate={editor.resetToApiRate}
        accountSections={editor.accountSections}
        accounts={editor.allAccounts}
        sourceId={editor.sourceId}
        destinationId={editor.destinationId}
        expansionPosition={expansionPosition}
        onToggleExpansion={handleToggleExpansion}
        onSelectSource={handleSelectSource}
        onSelectDestination={handleSelectDestination}
        onSwapAccounts={editor.swapAccounts}
        onCreateAccountRequest={onCreateAccountRequest}
        exchangeRateContainerStyle={styles.fxCardSpacing}
      />
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xxxxl + Size.xxl,
  },
  fxCardSpacing: {
    marginTop: Spacing.none,
  },
});
