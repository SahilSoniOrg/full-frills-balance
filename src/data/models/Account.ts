import { IconName } from '@/src/types/domainIcons';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import Transaction from '@/src/data/models/Transaction';
import { AccountId, AccountSubtype, AccountType } from '@/src/types/domain';
import { Query } from '@nozbe/watermelondb';
import { children, date, field } from '@nozbe/watermelondb/decorators';

export const ACCOUNT_SUBTYPES_BY_TYPE: Record<AccountType, readonly AccountSubtype[]> = {
  [AccountType.ASSET]: [
    AccountSubtype.CASH,
    AccountSubtype.WALLET,
    AccountSubtype.BANK_CHECKING,
    AccountSubtype.BANK_SAVINGS,
    AccountSubtype.FIXED_DEPOSIT,
    AccountSubtype.MONEY_MARKET,
    AccountSubtype.INVESTMENT,
    AccountSubtype.BROKERAGE,
    AccountSubtype.RETIREMENT,
    AccountSubtype.EMERGENCY_FUND,
    AccountSubtype.RECEIVABLE,
    AccountSubtype.TAX_RECEIVABLE,
    AccountSubtype.OTHER,
  ],
  [AccountType.LIABILITY]: [
    AccountSubtype.CREDIT_CARD,
    AccountSubtype.LINE_OF_CREDIT,
    AccountSubtype.OVERDRAFT,
    AccountSubtype.LOAN,
    AccountSubtype.MORTGAGE,
    AccountSubtype.STUDENT_LOAN,
    AccountSubtype.AUTO_LOAN,
    AccountSubtype.PERSONAL_LOAN,
    AccountSubtype.PAYABLE,
    AccountSubtype.TAX_PAYABLE,
    AccountSubtype.OTHER,
  ],
  [AccountType.EQUITY]: [
    AccountSubtype.OPENING_BALANCE,
    AccountSubtype.NET_WORTH_ADJUSTMENT,
    AccountSubtype.TRANSFER_CLEARING,
    AccountSubtype.OTHER,
  ],
  [AccountType.INCOME]: [
    AccountSubtype.SALARY,
    AccountSubtype.BUSINESS_INCOME,
    AccountSubtype.INTEREST_INCOME,
    AccountSubtype.DIVIDEND_INCOME,
    AccountSubtype.RENT_INCOME,
    AccountSubtype.TAX,
    AccountSubtype.OTHER,
  ],
  [AccountType.EXPENSE]: [
    AccountSubtype.FOOD,
    AccountSubtype.HOUSING,
    AccountSubtype.TRANSPORT,
    AccountSubtype.UTILITIES,
    AccountSubtype.HEALTHCARE,
    AccountSubtype.EDUCATION,
    AccountSubtype.ENTERTAINMENT,
    AccountSubtype.SHOPPING,
    AccountSubtype.TAX,
    AccountSubtype.TRANSFER,
    AccountSubtype.OTHER,
  ],
};

export const ACCOUNT_DEFAULT_SUBTYPE_BY_TYPE: Record<AccountType, AccountSubtype> = {
  [AccountType.ASSET]: AccountSubtype.CASH,
  [AccountType.LIABILITY]: AccountSubtype.CREDIT_CARD,
  [AccountType.EQUITY]: AccountSubtype.OPENING_BALANCE,
  [AccountType.INCOME]: AccountSubtype.SALARY,
  [AccountType.EXPENSE]: AccountSubtype.FOOD,
};

export function getAccountSubtypesForType(accountType: AccountType): readonly AccountSubtype[] {
  return ACCOUNT_SUBTYPES_BY_TYPE[accountType];
}

export function getDefaultSubtypeForType(accountType: AccountType): AccountSubtype {
  return ACCOUNT_DEFAULT_SUBTYPE_BY_TYPE[accountType] ?? AccountSubtype.OTHER;
}

export function getDefaultSubtypeForTypeLike(accountType: AccountType | string): AccountSubtype {
  if (isAccountType(accountType)) {
    return getDefaultSubtypeForType(accountType);
  }
  return AccountSubtype.OTHER;
}

export function formatAccountSubtypeLabel(subtype: AccountSubtype): string {
  return subtype
    .toLowerCase()
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function isAccountType(value: string): value is AccountType {
  return Object.values(AccountType).includes(value as AccountType);
}

export function isAccountSubtype(value: string): value is AccountSubtype {
  return Object.values(AccountSubtype).includes(value as AccountSubtype);
}

export function isSubtypeAllowedForType(
  accountType: AccountType,
  subtype?: AccountSubtype,
): boolean {
  if (!subtype) return true;
  return ACCOUNT_SUBTYPES_BY_TYPE[accountType].includes(subtype);
}

export default class Account extends BaseScopedModel<AccountId> {
  static table = 'accounts';
  static associations = {
    transactions: { type: 'has_many', foreignKey: 'account_id' },
    // Self-referential association used for direct child account queries (e.g., parent.subAccounts.fetch()).
    // For deep hierarchy traversal, prefer getDescendantIdsFromList() which avoids N+1 DB queries.
    accounts: { type: 'has_many', foreignKey: 'parent_account_id' },
    account_metadata: { type: 'has_many', foreignKey: 'account_id' },
  } as const;

  @field('name') name!: string;
  @field('account_type') accountType!: AccountType;
  @field('account_subtype') accountSubtype?: AccountSubtype;
  @field('currency_code') currencyCode!: string;
  @field('parent_account_id') parentAccountId?: AccountId;
  @field('description') description?: string;
  @field('icon') icon?: IconName;
  @field('color') color?: string;
  @field('order_num') orderNum?: number;
  @date('reconciled_at') reconciledAt?: Date;

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('deleted_at') deletedAt?: Date;
  @date('archived_at') archivedAt?: Date;

  // Relations with proper types
  @children('transactions') transactions!: Query<Transaction>;
  @children('accounts') subAccounts!: Query<Account>;
  @children('account_metadata') metadataRecords!: Query<AccountMetadata>;
}
