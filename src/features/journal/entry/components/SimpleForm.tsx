import { KeyboardAwareScrollView } from '@/src/design-system/KeyboardAwareScrollView';
import { type CreateAccountIntent } from '@/src/components/account-selection';
import { TransferOpenItemsCard } from '@/src/features/journal/entry/components/TransferOpenItemsCard';
import { useTransferOpenItems } from '@/src/features/journal/entry/hooks/useTransferOpenItems';
import type { AccountId, OpenItemId, PersonId, WorkplaceId } from '@/src/types/ids';
import type { PersonPickerGroup } from '@/src/components/account-selection/personAccountGrouping';
import { Size, Spacing } from '@/src/constants/design-tokens';
import { classifyPersonDebtPosting, expectedPersonAccount } from '@/src/domain/people';
import { ensurePersonAccount } from '@/src/services/people';
import { showErrorAlert } from '@/src/services/feedback/alerts';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { formatRoundedAmount } from '@/src/domain/money/money';
import { parseSimpleAmountInput } from '@/src/services/journal/simpleJournalHelpers';
import { asPersonId } from '@/src/types/ids';
import { AccountType, JournalStatus, TransactionType } from '@/src/types/enums';
import type { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { EntryTransactionCard } from './EntryTransactionCard';
import type { JournalMetaCardProps } from './JournalMetaCard';
import { PersonRepayableChoice } from './PersonRepayableChoice';
import { useSimpleFormExpansion, type AccountFlowHandle } from './useSimpleFormExpansion';
import type { AccountRole } from '@/src/types/domainJournal';
import React, { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
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
  const reducingTarget =
    editor.type === 'transfer' && editor.savedStatus !== JournalStatus.POSTED
      ? [
          { id: editor.destinationId, direction: TransactionType.DEBIT },
          { id: editor.sourceId, direction: TransactionType.CREDIT },
        ].flatMap(({ id, direction }) => {
          const account = editor.allAccounts.find(row => row.id === id);
          const group = peopleGroups?.find(row => row.accountIds.includes(id));
          return account &&
            group &&
            classifyPersonDebtPosting({
              accountType: account.accountType,
              transactionType: direction,
            }) === 'reducing'
            ? [{ account, group, direction }]
            : [];
        })[0]
      : undefined;
  const reducingAccountId = reducingTarget?.account.id;
  const reducingPersonId = reducingTarget ? asPersonId(reducingTarget.group.personId) : undefined;
  const reducingCurrency = reducingTarget?.account.currencyCode;
  const { precision: repaymentPrecision } = useCurrencyPrecision(reducingCurrency);
  const isConvertedDestination = Boolean(
    reducingTarget?.direction === TransactionType.DEBIT && editor.isCrossCurrency,
  );
  const reductionAmount = isConvertedDestination
    ? (editor.fxPair.convertedAmount ?? 0)
    : parseSimpleAmountInput(editor.amount);
  const transferOpenItems = useTransferOpenItems({
    workplaceId,
    personId: reducingPersonId,
    accountId: reducingAccountId,
    initialOpenItemId,
    transferAmount: reductionAmount,
    precision: repaymentPrecision,
  });
  const { allocationMode, selectedAllocations, isLoading, error } = transferOpenItems;
  useEffect(() => {
    if (!reducingAccountId || !reducingPersonId || !workplaceId || isLoading || error) {
      onTransferOpenItemPlanChange?.(null);
    } else {
      onTransferOpenItemPlanChange?.({
        personId: reducingPersonId,
        targetAccountId: reducingAccountId,
        allocationMode,
        allocations: selectedAllocations,
      });
    }
    return () => onTransferOpenItemPlanChange?.(null);
  }, [
    allocationMode,
    error,
    isLoading,
    onTransferOpenItemPlanChange,
    reducingAccountId,
    reducingPersonId,
    selectedAllocations,
    workplaceId,
  ]);

  const { setDestinationId, setSourceId } = editor;
  const [isResolvingAccount, setIsResolvingAccount] = useState(false);
  const latestPersonLeg = useRef(activePersonAccountId);
  latestPersonLeg.current = activePersonAccountId;
  const handleTogglePersonRepayable = useCallback(
    async (nextRepayable: boolean) => {
      if (!activePersonGroup || !activePersonLegRole || !workplaceId || isResolvingAccount) return;
      const currency = activePersonAccount?.currencyCode ?? workplaceCurrency;
      if (!currency) return;
      setIsResolvingAccount(true);
      try {
        const role = expectedPersonAccount(personFlow, nextRepayable).role;
        const account = await ensurePersonAccount(
          workplaceId,
          asPersonId(activePersonGroup.personId),
          role,
          currency,
        );
        if (latestPersonLeg.current !== activePersonAccountId) return;
        if (activePersonLegRole === 'destination') setDestinationId(account.id, account);
        else setSourceId(account.id, account);
      } catch (error) {
        showErrorAlert(
          error instanceof Error ? error.message : 'Could not select a person account',
        );
      } finally {
        setIsResolvingAccount(false);
      }
    },
    [
      activePersonAccount?.currencyCode,
      activePersonAccountId,
      activePersonGroup,
      activePersonLegRole,
      isResolvingAccount,
      personFlow,
      setDestinationId,
      setSourceId,
      workplaceCurrency,
      workplaceId,
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
      {reducingCurrency && transferOpenItems.openItems.length > 0 && (
        <TransferOpenItemsCard
          items={transferOpenItems.openItems}
          totalOpenRemainder={transferOpenItems.totalOpenRemainder}
          currencyCode={reducingCurrency}
          precision={repaymentPrecision}
          quickFillChips={transferOpenItems.quickFillChips}
          allocationMode={transferOpenItems.allocationMode}
          onAllocationModeChange={transferOpenItems.setAllocationMode}
          selectedItemIds={transferOpenItems.selectedItemIds}
          onToggleItem={transferOpenItems.toggleItem}
          onSelectOnlyItem={transferOpenItems.selectOnlyItem}
          onQuickFillAmount={val => {
            const amount = parseSimpleAmountInput(val);
            if (isConvertedDestination) {
              if (!editor.setRepaymentDestinationAmount(amount)) {
                showErrorAlert('Enter the exchange rate before filling a repayment amount');
                return;
              }
            } else {
              editor.setAmount(formatRoundedAmount(amount, precision));
            }
          }}
          activeAmount={reductionAmount}
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
