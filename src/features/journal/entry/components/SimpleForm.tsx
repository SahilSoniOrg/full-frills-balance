import { KeyboardAwareScrollView } from '@/src/design-system/KeyboardAwareScrollView';
import { type CreateAccountIntent } from '@/src/components/account-selection';
import { TransferOpenItemsCard } from '@/src/features/journal/entry/components/TransferOpenItemsCard';
import type { OpenItemId, WorkplaceId } from '@/src/types/ids';
import type { PersonPickerGroup } from '@/src/components/account-selection/personAccountGrouping';
import { Size, Spacing } from '@/src/constants/design-tokens';
import type { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import type { TransferOpenItemPlan } from '@/src/features/journal/entry/transferOpenItemPlan';
import { useSimpleFormPeople } from '@/src/features/journal/entry/hooks/useSimpleFormPeople';
import { EntryTransactionCard } from './EntryTransactionCard';
import type { JournalMetaCardProps } from './JournalMetaCard';
import { PersonRepayableChoice } from './PersonRepayableChoice';
import { useSimpleFormExpansion, type AccountFlowHandle } from './useSimpleFormExpansion';
import type { AccountRole } from '@/src/types/domainJournal';
import React, { type RefObject, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, type TextInput } from 'react-native';

export interface SimpleFormProps {
  editor: ReturnType<typeof useSimpleJournalEditor>;
  accentColor: string;
  precision?: number;
  meta: JournalMetaCardProps;
  peopleGroups?: readonly PersonPickerGroup[];
  onScrollBeginDrag?: () => void;
  onCreateAccountRequest?: (role: AccountRole, intent: CreateAccountIntent) => void;
  autoFocusAmount?: boolean;
  autopilotFirstRole?: AccountRole;
  onCalculatorDone?: () => void;
  accountFlowRef?: RefObject<AccountFlowHandle | null>;
  workplaceId?: WorkplaceId;
  workplaceCurrency?: string;
  initialOpenItemId?: OpenItemId;
  onCreatePersonRequest?: () => void;
  onTransferOpenItemPlanChange?: (plan: TransferOpenItemPlan | null) => void;
}

export const SimpleForm = React.memo(function SimpleForm({
  editor,
  accentColor,
  precision = 2,
  meta,
  peopleGroups,
  onScrollBeginDrag,
  onCreateAccountRequest,
  autoFocusAmount = false,
  autopilotFirstRole,
  onCalculatorDone,
  accountFlowRef,
  workplaceId,
  workplaceCurrency,
  initialOpenItemId,
  onCreatePersonRequest,
  onTransferOpenItemPlanChange,
}: SimpleFormProps) {
  const amountInputRef = useRef<TextInput>(null);
  const sourceSection = editor.accountSections.find(section => section.role === 'source');
  const destinationSection = editor.accountSections.find(section => section.role === 'destination');
  const handleSelectSourceAccount = useCallback(
    (id: Parameters<NonNullable<typeof sourceSection>['onSelect']>[0]) =>
      sourceSection?.onSelect(id),
    [sourceSection],
  );
  const handleSelectDestinationAccount = useCallback(
    (id: Parameters<NonNullable<typeof destinationSection>['onSelect']>[0]) =>
      destinationSection?.onSelect(id),
    [destinationSection],
  );
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
    onSelectSource: handleSelectSourceAccount,
    onSelectDestination: handleSelectDestinationAccount,
  });

  useEffect(() => {
    if (!accountFlowRef) return;
    accountFlowRef.current = {
      start: startAutopilotAccountFlow,
      focusAmount: () => amountInputRef.current?.focus(),
    };
    return () => {
      accountFlowRef.current = null;
    };
  }, [accountFlowRef, startAutopilotAccountFlow]);

  const people = useSimpleFormPeople({
    editor,
    peopleGroups,
    workplaceId,
    workplaceCurrency,
    initialOpenItemId,
    onTransferOpenItemPlanChange,
  });

  return (
    <KeyboardAwareScrollView
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
        autoFocusAmount={autoFocusAmount}
        amountInputRef={amountInputRef}
        onCalculatorDone={onCalculatorDone}
        pair={editor.fxPair}
        onManualBaseRateChange={editor.setManualBaseRate}
        onConvertedAmountChange={editor.setConvertedAmount}
        onResetToApiRate={editor.resetToApiRate}
        accountSections={editor.accountSections}
        accounts={editor.allAccounts}
        peopleGroups={peopleGroups}
        sourceId={editor.sourceId}
        destinationId={editor.destinationId}
        expansionPosition={expansionPosition}
        onToggleExpansion={handleToggleExpansion}
        onSelectSource={handleSelectSource}
        onSelectDestination={handleSelectDestination}
        onSwapAccounts={editor.swapAccounts}
        onCreateAccountRequest={onCreateAccountRequest}
        onCreatePersonRequest={onCreatePersonRequest}
        exchangeRateContainerStyle={styles.fxCardSpacing}
      />
      {people.reducingCurrency && people.transferOpenItems.openItems.length > 0 && (
        <TransferOpenItemsCard
          items={people.transferOpenItems.openItems}
          totalOpenRemainder={people.transferOpenItems.totalOpenRemainder}
          currencyCode={people.reducingCurrency}
          precision={people.repaymentPrecision}
          quickFillChips={people.transferOpenItems.quickFillChips}
          allocationMode={people.transferOpenItems.allocationMode}
          onAllocationModeChange={people.transferOpenItems.setAllocationMode}
          selectedItemIds={people.transferOpenItems.selectedItemIds}
          onToggleItem={people.transferOpenItems.toggleItem}
          onSelectOnlyItem={people.transferOpenItems.selectOnlyItem}
          onQuickFillAmount={people.handleQuickFillAmount}
          activeAmount={people.reductionAmount}
        />
      )}
      {people.activePersonGroup && people.activePersonAccount && (
        <PersonRepayableChoice
          flow={people.personFlow}
          personName={people.activePersonGroup.personName}
          repayable={people.isPersonRepayable}
          onChange={people.handleTogglePersonRepayable}
        />
      )}
    </KeyboardAwareScrollView>
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
