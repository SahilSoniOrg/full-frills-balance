import type { AccountFields } from '@/src/types/plainDtos';
import { sanitizeInput } from '@/src/utils/validation';
import { useEffect, useState } from 'react';

export interface UseAccountValidationResult {
  formError: string | null;
}

function findDuplicateAccountNameError(
  accountName: string,
  accounts: AccountFields[],
  currentAccountId?: string,
): string | null {
  const trimmed = accountName.trim();
  if (!trimmed) return null;

  const sanitizedName = sanitizeInput(accountName);
  const existing = accounts.find(a => a.name.toLowerCase() === sanitizedName.toLowerCase());
  if (existing && existing.id !== currentAccountId) {
    return `Account with name "${sanitizedName}" already exists`;
  }
  return null;
}

export function useAccountValidation(
  accountName: string,
  accounts: AccountFields[],
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

  return {
    formError,
  };
}
