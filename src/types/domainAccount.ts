import { AccountId } from './ids';
import { AccountType } from './enums';

export interface AccountCreateInput {
  name: string;
  accountType: AccountType;
  currencyCode: string;
  description?: string;
  parentAccountId?: AccountId;
  icon?: string;
  initialBalance?: number;
}

export interface AccountUpdateInput {
  name?: string;
  description?: string;
  parentAccountId?: AccountId;
  accountType?: AccountType;
  icon?: string;
}
