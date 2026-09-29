import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { SerializedAccountMetadataPayload } from '@/src/types/plainDtos';

export interface AccountPersistenceInput {
  id?: AccountId;
  name: string;
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
  currencyCode: string;
  description?: string | null;
  icon?: string | null;
  color?: string;
  orderNum?: number | null;
  reconciledAt?: Date | null;
  parentAccountId?: AccountId | null;
  workplaceId: WorkplaceId;
  metadata?: Partial<SerializedAccountMetadataPayload> | null;
  /** null clears archive. Omit to leave unchanged. */
  archivedAt?: Date | null;
  /** null clears soft-delete. Omit to leave unchanged. */
  deletedAt?: Date | null;
}

export interface AccountListItemRaw {
  id: AccountId;
  name: string;
  account_type: AccountType;
  account_subtype: AccountSubtype;
  currency_code: string;
  icon?: string;
  color?: string;
  parent_account_id?: AccountId;
  direct_balance: number;
  direct_transaction_count: number;
  periodIncrease: number;
  periodDecrease: number;
}
