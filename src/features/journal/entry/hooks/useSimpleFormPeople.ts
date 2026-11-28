import { classifyPersonDebtPosting, expectedPersonAccount } from '@/src/domain/people';
import { ensurePersonAccount } from '@/src/services/people';
import { showErrorAlert } from '@/src/services/feedback/alerts';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { formatRoundedAmount } from '@/src/domain/money/money';
import { parseSimpleAmountInput } from '@/src/services/journal/simpleJournalHelpers';
import { asPersonId } from '@/src/types/ids';
import type { AccountId, OpenItemId, PersonId, WorkplaceId } from '@/src/types/ids';
import { AccountType, JournalStatus, TransactionType } from '@/src/types/enums';
import type { PersonPickerGroup } from '@/src/components/account-selection/personAccountGrouping';
import type { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import type { TransferOpenItemPlan } from '@/src/features/journal/entry/transferOpenItemPlan';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTransferOpenItems } from './useTransferOpenItems';

type SimpleEditor = ReturnType<typeof useSimpleJournalEditor>;

type Props = {
  editor: SimpleEditor;
  peopleGroups?: readonly PersonPickerGroup[];
  workplaceId?: WorkplaceId;
  workplaceCurrency?: string;
  initialOpenItemId?: OpenItemId;
  onTransferOpenItemPlanChange?: (plan: TransferOpenItemPlan | null) => void;
};

export function useSimpleFormPeople({
  editor,
  peopleGroups,
  workplaceId,
  workplaceCurrency,
  initialOpenItemId,
  onTransferOpenItemPlanChange,
}: Props) {
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
  const personFlow: 'inflow' | 'outflow' = activePersonLegRole === 'source' ? 'inflow' : 'outflow';
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

  const reducingAccountId: AccountId | undefined = reducingTarget?.account.id;
  const reducingPersonId: PersonId | undefined = reducingTarget
    ? asPersonId(reducingTarget.group.personId)
    : undefined;
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
    if (
      !reducingAccountId ||
      !reducingPersonId ||
      !workplaceId ||
      isLoading ||
      error ||
      selectedAllocations.length === 0
    ) {
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
  useEffect(() => {
    latestPersonLeg.current = activePersonAccountId;
  }, [activePersonAccountId]);

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
      } catch (err) {
        showErrorAlert(err instanceof Error ? err.message : 'Could not select a person account');
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

  const handleQuickFillAmount = useCallback(
    (value: string) => {
      const amount = parseSimpleAmountInput(value);
      if (isConvertedDestination) {
        if (!editor.setRepaymentDestinationAmount(amount)) {
          showErrorAlert('Enter the exchange rate before filling a repayment amount');
          return;
        }
      } else {
        editor.setAmount(formatRoundedAmount(amount, repaymentPrecision));
      }
    },
    [editor, isConvertedDestination, repaymentPrecision],
  );

  return {
    activePersonGroup,
    activePersonAccount,
    personFlow,
    isPersonRepayable,
    handleTogglePersonRepayable,
    reducingCurrency,
    repaymentPrecision,
    isConvertedDestination,
    reductionAmount,
    transferOpenItems,
    handleQuickFillAmount,
  };
}
