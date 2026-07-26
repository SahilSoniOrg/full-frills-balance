import Account from '@/src/data/models/Account';
import { findDuplicateAccountNameError } from '@/src/features/accounts/services/accountFormValidationPolicy';
import { validateAccountName } from '@/src/utils/validation';
import { useEffect, useState } from 'react';

export interface UseAccountValidationResult {
  formError: string | null;
  validateName: (name: string) => { isValid: boolean; error?: string };
  checkForDuplicates: (name: string) => boolean;
}

export function useAccountValidation(
  accountName: string,
  accounts: Account[],
  currentAccountId?: string,
): UseAccountValidationResult {
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountName.trim()) {
      setTimeout(() => setFormError(null), 0);
      return;
    }

    const duplicateError = findDuplicateAccountNameError(accountName, accounts, currentAccountId);
    if (duplicateError) {
      setTimeout(() => setFormError(duplicateError), 0);
    } else {
      setTimeout(() => setFormError(null), 0);
    }
  }, [accountName, accounts, currentAccountId]);

  const validateName = (name: string) => {
    return validateAccountName(name);
  };

  const checkForDuplicates = (name: string): boolean => {
    return findDuplicateAccountNameError(name, accounts, currentAccountId) !== null;
  };

  return {
    formError,
    validateName,
    checkForDuplicates,
  };
}
