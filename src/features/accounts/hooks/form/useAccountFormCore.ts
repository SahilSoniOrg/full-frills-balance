import { IconName } from '@/src/components/core';
import { getAccountSubtypesForType } from '@/src/types/accountSubtype';
import { AccountFormCoreDraft } from '@/src/features/accounts/hooks/accountFormDraft';
import { AccountFormDraftDispatch } from '@/src/features/accounts/hooks/form/useAccountFormDraft';
import { isCategoryAccountType } from '@/src/features/accounts/helpers/accountFormHelpers';
import { AccountId } from '@/src/types/ids';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { useCallback, useMemo } from 'react';

export interface AccountFormCoreApi {
  accountName: string;
  setAccountName: (value: string) => void;
  accountType: AccountType;
  setAccountType: (value: AccountType) => void;
  accountSubtype: AccountSubtype;
  setAccountSubtype: (value: AccountSubtype) => void;
  availableSubtypes: readonly AccountSubtype[];
  selectedCurrency: string;
  setSelectedCurrency: (value: string) => void;
  selectedIcon: IconName;
  setSelectedIcon: (value: IconName) => void;
  selectedColor: string;
  setSelectedColor: (value: string) => void;
  initialBalance: string;
  onInitialBalanceChange: (value: string) => void;
  parentAccountId: AccountId;
  setParentAccountId: (value: AccountId) => void;
  isCategory: boolean;
}

/** Core account fields slice of the form draft. */
export function useAccountFormCore(
  dispatch: AccountFormDraftDispatch,
  core: AccountFormCoreDraft,
): AccountFormCoreApi {
  const {
    accountName,
    accountType,
    accountSubtype,
    selectedCurrency,
    selectedIcon,
    selectedColor,
    initialBalance,
    parentAccountId,
  } = core;

  const setAccountName = useCallback(
    (value: string) => dispatch({ type: 'PATCH_CORE', patch: { accountName: value } }),
    [dispatch],
  );
  const setAccountType = useCallback(
    (value: AccountType) => dispatch({ type: 'SET_ACCOUNT_TYPE', accountType: value }),
    [dispatch],
  );
  const setAccountSubtype = useCallback(
    (value: AccountSubtype) => dispatch({ type: 'PATCH_CORE', patch: { accountSubtype: value } }),
    [dispatch],
  );
  const setSelectedCurrency = useCallback(
    (value: string) => dispatch({ type: 'PATCH_CORE', patch: { selectedCurrency: value } }),
    [dispatch],
  );
  const setSelectedIcon = useCallback(
    (value: IconName) => dispatch({ type: 'PATCH_CORE', patch: { selectedIcon: value } }),
    [dispatch],
  );
  const setSelectedColor = useCallback(
    (value: string) => dispatch({ type: 'PATCH_CORE', patch: { selectedColor: value } }),
    [dispatch],
  );
  const setParentAccountId = useCallback(
    (value: AccountId) => dispatch({ type: 'PATCH_CORE', patch: { parentAccountId: value } }),
    [dispatch],
  );
  const onInitialBalanceChange = useCallback(
    (value: string) => {
      if (isCategoryAccountType(accountType)) return;
      dispatch({ type: 'PATCH_CORE', patch: { initialBalance: value } });
    },
    [dispatch, accountType],
  );

  const availableSubtypes = useMemo(() => getAccountSubtypesForType(accountType), [accountType]);
  const isCategory = isCategoryAccountType(accountType);

  return {
    accountName,
    setAccountName,
    accountType,
    setAccountType,
    accountSubtype,
    setAccountSubtype,
    availableSubtypes,
    selectedCurrency,
    setSelectedCurrency,
    selectedIcon,
    setSelectedIcon,
    selectedColor,
    setSelectedColor,
    initialBalance,
    onInitialBalanceChange,
    parentAccountId,
    setParentAccountId,
    isCategory,
  };
}
