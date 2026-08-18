import { IconName } from '@/src/types/domainIcons';
import type AccountMetadata from '@/src/data/models/AccountMetadata';
import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import type Transaction from '@/src/data/models/Transaction';
import {
  AccountId,
  AccountSubtype,
  AccountType,
  PlainAccount,
  PlainAccountMetadata,
} from '@/src/types/domain';
import { Query } from '@nozbe/watermelondb';
import { children, date, field } from '@nozbe/watermelondb/decorators';

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

export function toPlainAccount(a: Account): PlainAccount {
  return {
    id: a.id,
    name: a.name,
    accountType: a.accountType,
    accountSubtype: a.accountSubtype,
    currencyCode: a.currencyCode,
    parentAccountId: a.parentAccountId,
    description: a.description,
    icon: a.icon,
    color: a.color,
    orderNum: a.orderNum,
    reconciledAt: a.reconciledAt?.getTime(),
    createdAt: a.createdAt?.getTime(),
    updatedAt: a.updatedAt?.getTime(),
    deletedAt: a.deletedAt?.getTime(),
    archivedAt: a.archivedAt?.getTime(),
  };
}

export function toPlainAccounts(accounts: Account[]): PlainAccount[] {
  return accounts.map(toPlainAccount);
}

export function toPlainAccountMetadata(metadata: AccountMetadata): PlainAccountMetadata {
  return {
    accountId: metadata.accountId,
    statementDay: metadata.statementDay,
    dueDay: metadata.dueDay,
    minimumPaymentAmount: metadata.minimumPaymentAmount,
    minimumBalanceAmount: metadata.minimumBalanceAmount,
    creditLimitAmount: metadata.creditLimitAmount,
    aprBps: metadata.aprBps,
    emiDay: metadata.emiDay,
    loanTenureMonths: metadata.loanTenureMonths,
    autopayEnabled: metadata.autopayEnabled,
    gracePeriodDays: metadata.gracePeriodDays,
    payFromAccountId: metadata.payFromAccountId,
    minPaymentOnly: metadata.minPaymentOnly,
    minimumPaymentPercent: metadata.minimumPaymentPercent,
    notes: metadata.notes,
  };
}
