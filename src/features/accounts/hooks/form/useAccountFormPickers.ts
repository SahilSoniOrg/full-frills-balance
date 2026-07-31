import { AccountFormPickersDraft } from '@/src/features/accounts/hooks/accountFormDraft';
import { AccountFormDraftDispatch } from '@/src/features/accounts/hooks/form/useAccountFormDraft';
import { useCallback } from 'react';

export interface AccountFormPickersApi {
  isIconPickerVisible: boolean;
  setIsIconPickerVisible: (visible: boolean) => void;
  isParentPickerVisible: boolean;
  setIsParentPickerVisible: (visible: boolean) => void;
  isPayFromPickerVisible: boolean;
  setIsPayFromPickerVisible: (visible: boolean) => void;
}

/** Picker visibility slice of the form draft. */
export function useAccountFormPickers(
  dispatch: AccountFormDraftDispatch,
  pickers: AccountFormPickersDraft,
): AccountFormPickersApi {
  const setIsIconPickerVisible = useCallback(
    (visible: boolean) => dispatch({ type: 'SET_PICKER', picker: 'isIconPickerVisible', visible }),
    [dispatch],
  );
  const setIsParentPickerVisible = useCallback(
    (visible: boolean) =>
      dispatch({ type: 'SET_PICKER', picker: 'isParentPickerVisible', visible }),
    [dispatch],
  );
  const setIsPayFromPickerVisible = useCallback(
    (visible: boolean) =>
      dispatch({ type: 'SET_PICKER', picker: 'isPayFromPickerVisible', visible }),
    [dispatch],
  );

  return {
    isIconPickerVisible: pickers.isIconPickerVisible,
    setIsIconPickerVisible,
    isParentPickerVisible: pickers.isParentPickerVisible,
    setIsParentPickerVisible,
    isPayFromPickerVisible: pickers.isPayFromPickerVisible,
    setIsPayFromPickerVisible,
  };
}
