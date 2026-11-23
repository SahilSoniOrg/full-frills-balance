import Account, {
  toPlainAccount as toPlainAccountRecord,
  toPlainAccountMetadata,
} from '@/src/data/models/Account';
import { getAccountIcon } from '@/src/design-system/accountIcon';
import type { PlainAccount } from '@/src/types/plainDtos';

/**
 * Maps a Watermelon Account to PlainAccount with presentation icon fallbacks.
 * Lives outside PRESENTATION_ROOTS so it may import the model without tripping
 * the presentation_model_import ratchet; UI/services use this instead of the
 * raw data mapper when icons must resolve.
 */
export function toPlainAccount(account: Account): PlainAccount {
  return {
    ...toPlainAccountRecord(account),
    icon: getAccountIcon(account),
  };
}

export function toPlainAccounts(accounts: Account[]): PlainAccount[] {
  return accounts.map(toPlainAccount);
}

export { toPlainAccountMetadata };
