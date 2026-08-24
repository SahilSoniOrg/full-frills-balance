import { AppConfig } from '@/src/constants/app-config';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountFormDraftDispatch } from '@/src/features/accounts/hooks/form/useAccountFormDraft';
import { AccountMetadataValues } from '@/src/features/accounts/services/accountMetadataDomain';
import { AccountId } from '@/src/types/ids';
import { useCallback, useMemo } from 'react';

export interface AccountMetadataFormModel {
  statementDay: string;
  setStatementDay: (value: string) => void;
  dueDay: string;
  setDueDay: (value: string) => void;
  creditLimitAmount: string;
  setCreditLimitAmount: (value: string) => void;
  apr: string;
  setApr: (value: string) => void;
  emiDay: string;
  setEmiDay: (value: string) => void;
  loanTenureMonths: string;
  setLoanTenureMonths: (value: string) => void;
  minimumPaymentAmount: string;
  minimumPaymentPercent: string;
  setMinimumPaymentAmount: (value: string) => void;
  setMinimumPaymentPercent: (value: string) => void;
  payFromAccountId: AccountId;
  payFromAccountName: string;
  setPayFromAccountId: (value: AccountId) => void;
  isPayFromPickerVisible: boolean;
  setIsPayFromPickerVisible: (visible: boolean) => void;
  notes: string;
  setNotes: (value: string) => void;
  isMinPaymentOnly: boolean;
  setIsMinPaymentOnly: (value: boolean) => void;
}

/** Metadata fields + pay-from picker wiring over the shared draft reducer. */
export function useAccountFormMetadata(args: {
  dispatch: AccountFormDraftDispatch;
  metadataValues: AccountMetadataValues;
  isPayFromPickerVisible: boolean;
  setIsPayFromPickerVisible: (visible: boolean) => void;
  accounts: AccountFields[];
  localFormError: string | null;
}): AccountMetadataFormModel {
  const {
    dispatch,
    metadataValues,
    isPayFromPickerVisible,
    setIsPayFromPickerVisible,
    accounts,
    localFormError,
  } = args;

  const updateField = useCallback(
    <K extends keyof AccountMetadataValues>(key: K, value: AccountMetadataValues[K]) => {
      dispatch({ type: 'PATCH_METADATA', key, value });
      if (localFormError) dispatch({ type: 'SET_LOCAL_ERROR', error: null });
    },
    [dispatch, localFormError],
  );

  const payFromAccountName = useMemo(() => {
    if (!metadataValues.payFromAccountId) return AppConfig.strings.common.none;
    const account = accounts.find(a => a.id === metadataValues.payFromAccountId);
    return account ? account.name : AppConfig.strings.common.none;
  }, [metadataValues.payFromAccountId, accounts]);

  return useMemo(
    (): AccountMetadataFormModel => ({
      statementDay: metadataValues.statementDay,
      setStatementDay: v => updateField('statementDay', v),
      dueDay: metadataValues.dueDay,
      setDueDay: v => updateField('dueDay', v),
      creditLimitAmount: metadataValues.creditLimitAmount,
      setCreditLimitAmount: v => updateField('creditLimitAmount', v),
      apr: metadataValues.apr,
      setApr: v => updateField('apr', v),
      emiDay: metadataValues.emiDay,
      setEmiDay: v => updateField('emiDay', v),
      loanTenureMonths: metadataValues.loanTenureMonths,
      setLoanTenureMonths: v => updateField('loanTenureMonths', v),
      minimumPaymentAmount: metadataValues.minimumPaymentAmount,
      setMinimumPaymentAmount: v => updateField('minimumPaymentAmount', v),
      minimumPaymentPercent: metadataValues.minimumPaymentPercent,
      setMinimumPaymentPercent: v => updateField('minimumPaymentPercent', v),
      payFromAccountId: metadataValues.payFromAccountId,
      payFromAccountName,
      setPayFromAccountId: v => updateField('payFromAccountId', v),
      isPayFromPickerVisible,
      setIsPayFromPickerVisible,
      notes: metadataValues.notes,
      setNotes: v => updateField('notes', v),
      isMinPaymentOnly: metadataValues.isMinPaymentOnly,
      setIsMinPaymentOnly: v => updateField('isMinPaymentOnly', v),
    }),
    [
      metadataValues,
      updateField,
      payFromAccountName,
      isPayFromPickerVisible,
      setIsPayFromPickerVisible,
    ],
  );
}
