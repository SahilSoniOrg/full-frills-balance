import { KeyboardAwareScrollView } from '@/src/design-system/KeyboardAwareScrollView';
import { type CreateAccountIntent } from '@/src/components/account-selection';
import { TransferOpenItemsCard } from '@/src/features/journal/entry/components/TransferOpenItemsCard';
import { useTransferOpenItems } from '@/src/features/journal/entry/hooks/useTransferOpenItems';
import type { AccountId, OpenItemId, PersonId, WorkplaceId } from '@/src/types/ids';
import type { PersonPickerGroup } from '@/src/components/account-selection/personAccountGrouping';
import { Size, Spacing } from '@/src/constants/design-tokens';
import { expectedPersonAccount } from '@/src/domain/people';
import { AccountType } from '@/src/types/enums';
import type { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
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
  onTransferOpenItemPlanChange?: (
    plan: {
      personId: PersonId;
      targetAccountId: AccountId;
      allocationMode: 'fifo' | 'pick';
      allocations: readonly { openItemId: OpenItemId; amount: number }[];
    } | null,
  ) => void;
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

  const activePersonLegRole =
    editor.type === 'expense' ? 'destination' : editor.type === 'income' ? 'source' : null;
  const activePersonAccountId =
    activePersonLegRole === 'destination'
      ? editor.destinationId
      : activePersonLegRole === 'source'
        ? editor.sourceId
        : undefined;
  const activePersonGroup = activePersonAccountId
    ? peopleGroups?.find(group => group.accountIds.includes(activePersonAccountId))
    : undefined;
  const activePersonAccount = activePersonAccountId
    ? editor.allAccounts.find(account => account.id === activePersonAccountId)
    : undefined;
  const personFlow = activePersonLegRole === 'source' ? 'inflow' : 'outflow';
  const isPersonRepayable = Boolean(
    activePersonAccount &&
    (personFlow === 'outflow'
      ? activePersonAccount.accountType === AccountType.ASSET
      : activePersonAccount.accountType === AccountType.LIABILITY),
  );
  const transferPersonAccountId =
    editor.type === 'transfer'
      ? peopleGroups?.find(group => group.accountIds.includes(editor.destinationId))
        ? editor.destinationId
        : peopleGroups?.find(group => group.accountIds.includes(editor.sourceId))
          ? editor.sourceId
          : undefined
      : undefined;
  const transferPersonGroup = transferPersonAccountId
    ? peopleGroups?.find(group => group.accountIds.includes(transferPersonAccountId))
    : undefined;
  const transferTargetAccountId =
    transferPersonAccountId === editor.destinationId ? editor.sourceId : editor.destinationId;
  const transferOpenItems = useTransferOpenItems({
    workplaceId: workplaceId!,
    workplaceCurrency: workplaceCurrency ?? editor.displayCurrency,
    personId: workplaceId ? (transferPersonGroup?.personId as PersonId | undefined) : undefined,
    initialOpenItemId,
    transferAmountText: editor.amount,
    precision,
    currencyCode: editor.displayCurrency,
  });
  useEffect(() => {
    if (
      editor.type !== 'transfer' ||
      !transferPersonGroup ||
      !transferTargetAccountId ||
      !workplaceId
    ) {
      onTransferOpenItemPlanChange?.(null);
      return;
    }
    onTransferOpenItemPlanChange?.({
      personId: transferPersonGroup.personId as PersonId,
      targetAccountId: transferTargetAccountId,
      allocationMode: transferOpenItems.allocationMode,
      allocations: transferOpenItems.selectedAllocations,
    });
  }, [
    editor.type,
    onTransferOpenItemPlanChange,
    transferOpenItems.allocationMode,
    transferOpenItems.selectedAllocations,
    transferPersonGroup,
    transferTargetAccountId,
    workplaceId,
  ]);

  const handleTogglePersonRepayable = useCallback(
    (nextRepayable: boolean) => {
      if (!activePersonGroup || !activePersonLegRole) return;
      const expected = expectedPersonAccount(personFlow, nextRepayable);
      const matchingAccount = editor.allAccounts.find(
        account =>
          activePersonGroup.accountIds.includes(account.id) &&
          account.accountType === expected.type,
      );
      if (matchingAccount) {
        if (activePersonLegRole === 'destination') handleSelectDestination(matchingAccount.id);
        else handleSelectSource(matchingAccount.id);
        return;
      }
      onCreateAccountRequest?.(activePersonLegRole, {
        suggestedName: `${activePersonGroup.personName} (${expected.role})`,
        type: expected.type,
      });
    },
    [
      activePersonGroup,
      activePersonLegRole,
      editor.allAccounts,
      handleSelectDestination,
      handleSelectSource,
      onCreateAccountRequest,
      personFlow,
    ],
  );

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
      {editor.type === 'transfer' &&
        transferPersonGroup &&
        transferOpenItems.openItems.length > 0 && (
          <TransferOpenItemsCard
            items={transferOpenItems.openItems}
            totalOpenRemainder={transferOpenItems.totalOpenRemainder}
            currencyCode={editor.displayCurrency}
            quickFillChips={transferOpenItems.quickFillChips}
            allocationMode={transferOpenItems.allocationMode}
            onAllocationModeChange={transferOpenItems.setAllocationMode}
            selectedItemIds={transferOpenItems.selectedItemIds}
            onToggleItem={id =>
              transferOpenItems.setSelectedItemIds(current => ({ ...current, [id]: !current[id] }))
            }
            onQuickFillAmount={val => editor.setAmount(Number(val).toFixed(precision))}
            activeAmount={Number(editor.amount.replace(/,/g, ''))}
          />
        )}
      {activePersonGroup && activePersonAccount && (
        <PersonRepayableChoice
          flow={personFlow}
          personName={activePersonGroup.personName}
          repayable={isPersonRepayable}
          onChange={handleTogglePersonRepayable}
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
