import { getAccountIcon } from '@/src/utils/accountIcon';
import type { PlainAccount } from '@/src/types/plainDtos';

/**
 * Fills missing/unknown icons for PlainAccount reads (legacy rows).
 * Writers already persist via getAccountIcon — this is idempotent for new data.
 */
export function resolvePlainAccountIcon(account: PlainAccount): PlainAccount {
  return {
    ...account,
    icon: getAccountIcon(account),
  };
}

export function resolvePlainAccountIcons(accounts: PlainAccount[]): PlainAccount[] {
  return accounts.map(resolvePlainAccountIcon);
}
