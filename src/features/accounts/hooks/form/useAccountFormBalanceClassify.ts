import Account from '@/src/data/models/Account';
import { AccountFormBalanceClassifyDraft } from '@/src/features/accounts/hooks/accountFormDraft';
import { AccountFormCoreApi } from '@/src/features/accounts/hooks/form/useAccountFormCore';
import { AccountFormDraftDispatch } from '@/src/features/accounts/hooks/form/useAccountFormDraft';
import { AccountPersistenceSaveInput } from '@/src/features/accounts/hooks/useAccountPersistence';
import { buildAccountSavePayload } from '@/src/features/accounts/services/accountFormService';
import { AccountMetadataValues } from '@/src/features/accounts/services/accountMetadataDomain';
import { AccountId, AccountType } from '@/src/types/domain';
import {
  BalanceChangeCounterparty,
  isBalanceChangedBeyondEpsilon,
  needsBalanceChangeClassification,
} from '@/src/services/accounts/balanceChangeClassification';
import { showErrorAlert } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { ValidationError } from '@/src/utils/errors';
import { logger } from '@/src/utils/logger';
import { useCallback, useMemo } from 'react';

export type AccountFormBalanceClassifyVm = {
  visible: boolean;
  accounts: Account[];
  editedAccountId: AccountId;
  editedAccountName: string;
  editedAccountType: AccountType;
  currencyCode: string;
  discrepancy: number;
  discrepancyLabel: string;
  onClose: () => void;
  onSelect: (counterparty: BalanceChangeCounterparty) => void;
} | null;

/** Balance-change classification sheet + save orchestration. */
export function useAccountFormBalanceClassify(args: {
  dispatch: AccountFormDraftDispatch;
  accountId: AccountId | undefined;
  isEditMode: boolean;
  core: AccountFormCoreApi;
  metadataValues: AccountMetadataValues;
  balanceClassifyDraft: AccountFormBalanceClassifyDraft;
  existingMetadata: unknown;
  balanceData: { balance: number } | null | undefined;
  accounts: Account[];
  handleSave: (input: AccountPersistenceSaveInput) => Promise<void>;
}): {
  balanceClassify: AccountFormBalanceClassifyVm;
  onSave: () => void;
} {
  const {
    dispatch,
    accountId,
    isEditMode,
    core,
    metadataValues,
    balanceClassifyDraft,
    existingMetadata,
    balanceData,
    accounts,
    handleSave,
  } = args;

  const {
    accountName,
    accountType,
    accountSubtype,
    selectedCurrency,
    selectedIcon,
    initialBalance,
    parentAccountId,
  } = core;

  const commitSave = useCallback(
    async (balanceChange?: BalanceChangeCounterparty) => {
      logger.info(`Saving account: ${accountName} (ID: ${accountId || 'new'})`);

      const saveResult = buildAccountSavePayload({
        accountName,
        accountType,
        accountSubtype,
        selectedCurrency,
        selectedIcon,
        initialBalance,
        parentAccountId,
        metadataValues,
        hasExistingMetadata: Boolean(existingMetadata),
        balanceData,
      });

      if (!saveResult.ok) {
        dispatch({ type: 'SET_LOCAL_ERROR', error: saveResult.error });
        dispatch({ type: 'HIDE_BALANCE_CLASSIFY' });
        return;
      }

      const { payload } = saveResult;
      const targetBalance = payload.initialBalance ? parseFloat(payload.initialBalance) : NaN;
      const currentBalance = payload.balanceData?.balance;
      const balanceChanged =
        isEditMode &&
        currentBalance !== undefined &&
        isBalanceChangedBeyondEpsilon(targetBalance, currentBalance);

      if (
        !balanceChange &&
        balanceChanged &&
        needsBalanceChangeClassification(payload.accountType)
      ) {
        dispatch({
          type: 'SHOW_BALANCE_CLASSIFY',
          discrepancy: targetBalance - currentBalance,
        });
        return;
      }

      dispatch({ type: 'HIDE_BALANCE_CLASSIFY' });
      try {
        await handleSave({ payload, balanceChange });
      } catch (error) {
        showErrorAlert(
          error instanceof ValidationError ? error : new ValidationError('Failed to save account'),
        );
      }
    },
    [
      accountName,
      accountId,
      accountType,
      accountSubtype,
      selectedCurrency,
      selectedIcon,
      initialBalance,
      parentAccountId,
      metadataValues,
      existingMetadata,
      balanceData,
      isEditMode,
      handleSave,
      dispatch,
    ],
  );

  const onSave = useCallback(() => {
    void commitSave();
  }, [commitSave]);

  const onBalanceClassifyClose = useCallback(() => {
    dispatch({ type: 'HIDE_BALANCE_CLASSIFY' });
  }, [dispatch]);

  const onBalanceClassifySelect = useCallback(
    (counterparty: BalanceChangeCounterparty) => {
      void commitSave(counterparty);
    },
    [commitSave],
  );

  const balanceClassify = useMemo((): AccountFormBalanceClassifyVm => {
    if (!accountId || !balanceClassifyDraft.visible) return null;
    const absDelta = Math.abs(balanceClassifyDraft.discrepancy);
    const signedLabel = CurrencyFormatter.formatAmount(absDelta, selectedCurrency);
    const discrepancyLabel =
      balanceClassifyDraft.discrepancy >= 0 ? `+${signedLabel}` : `−${signedLabel}`;

    return {
      visible: true,
      accounts,
      editedAccountId: accountId,
      editedAccountName: accountName.trim() || 'This account',
      editedAccountType: accountType,
      currencyCode: selectedCurrency,
      discrepancy: balanceClassifyDraft.discrepancy,
      discrepancyLabel,
      onClose: onBalanceClassifyClose,
      onSelect: onBalanceClassifySelect,
    };
  }, [
    accountId,
    accountName,
    balanceClassifyDraft,
    selectedCurrency,
    accounts,
    accountType,
    onBalanceClassifyClose,
    onBalanceClassifySelect,
  ]);

  return { balanceClassify, onSave };
}
