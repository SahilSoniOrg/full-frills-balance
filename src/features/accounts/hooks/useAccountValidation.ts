import Account from '@/src/data/models/Account';
import { sanitizeInput, validateAccountName } from '@/src/utils/validation';
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

    const sanitizedName = sanitizeInput(accountName);
    const existing = accounts.find(a => a.name.toLowerCase() === sanitizedName.toLowerCase());

    if (existing && existing.id !== currentAccountId) {
      setTimeout(() => setFormError(`Account with name "${sanitizedName}" already exists`), 0);
    } else {
      setTimeout(() => setFormError(null), 0);
    }
  }, [accountName, accounts, currentAccountId]);

  const validateName = (name: string) => {
    return validateAccountName(name);
  };

  const checkForDuplicates = (name: string): boolean => {
    const sanitizedName = sanitizeInput(name);
    const existing = accounts.find(a => a.name.toLowerCase() === sanitizedName.toLowerCase());
    return !!existing && existing.id !== currentAccountId;
  };

  return {
    formError,
    validateName,
    checkForDuplicates,
  };
}
