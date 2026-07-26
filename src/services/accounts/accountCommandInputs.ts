import { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { AccountId, SerializedAccountMetadataPayload, WorkplaceId } from '@/src/types/domain';
import { IconName } from '@/src/types/domainIcons';

/** Caller-owned fields for creating an account (form / onboarding data only). */
export interface CreateAccountCommandInput {
  name: string;
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
  currencyCode: string;
  description?: string;
  icon?: IconName;
  initialBalance?: number;
  orderNum?: number;
  parentAccountId?: AccountId | null;
  workplaceId: WorkplaceId;
  metadata?: Partial<SerializedAccountMetadataPayload>;
}

/** @deprecated Use CreateAccountCommandInput; kept for existing service typings. */
export type CreateAccountData = CreateAccountCommandInput;
