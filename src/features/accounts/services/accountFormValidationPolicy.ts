import type { AccountFields as Account } from '@/src/types/domain';
import { sanitizeInput } from '@/src/utils/validation';

/**
 * Account form validation policy (commit 46) — pure checks without React.
 */
export function findDuplicateAccountNameError(
  accountName: string,
  accounts: Account[],
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

export function isDuplicateAccountName(
  name: string,
  accounts: Account[],
  currentAccountId?: string,
): boolean {
  return findDuplicateAccountNameError(name, accounts, currentAccountId) !== null;
}
