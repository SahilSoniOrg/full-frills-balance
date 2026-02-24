import AccountMetadata from '@/src/data/models/AccountMetadata'
import Transaction from '@/src/data/models/Transaction'
import { Model, Query } from '@nozbe/watermelondb'
import { children, date, field } from '@nozbe/watermelondb/decorators'

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum AccountSubcategory {
  CASH = 'CASH',
  WALLET = 'WALLET',
  BANK_CHECKING = 'BANK_CHECKING',
  BANK_SAVINGS = 'BANK_SAVINGS',
  FIXED_DEPOSIT = 'FIXED_DEPOSIT',
  MONEY_MARKET = 'MONEY_MARKET',
  BROKERAGE = 'BROKERAGE',
  RETIREMENT = 'RETIREMENT',
  EMERGENCY_FUND = 'EMERGENCY_FUND',
  CREDIT_CARD = 'CREDIT_CARD',
  LINE_OF_CREDIT = 'LINE_OF_CREDIT',
  OVERDRAFT = 'OVERDRAFT',
  MORTGAGE = 'MORTGAGE',
  STUDENT_LOAN = 'STUDENT_LOAN',
  AUTO_LOAN = 'AUTO_LOAN',
  PERSONAL_LOAN = 'PERSONAL_LOAN',
  LOAN = 'LOAN',
  INVESTMENT = 'INVESTMENT',
  RECEIVABLE = 'RECEIVABLE',
  TAX_RECEIVABLE = 'TAX_RECEIVABLE',
  PAYABLE = 'PAYABLE',
  TAX_PAYABLE = 'TAX_PAYABLE',
  OPENING_BALANCE = 'OPENING_BALANCE',
  NET_WORTH_ADJUSTMENT = 'NET_WORTH_ADJUSTMENT',
  TRANSFER_CLEARING = 'TRANSFER_CLEARING',
  SALARY = 'SALARY',
  BUSINESS_INCOME = 'BUSINESS_INCOME',
  INTEREST_INCOME = 'INTEREST_INCOME',
  DIVIDEND_INCOME = 'DIVIDEND_INCOME',
  RENT_INCOME = 'RENT_INCOME',
  FOOD = 'FOOD',
  HOUSING = 'HOUSING',
  TRANSPORT = 'TRANSPORT',
  UTILITIES = 'UTILITIES',
  HEALTHCARE = 'HEALTHCARE',
  EDUCATION = 'EDUCATION',
  ENTERTAINMENT = 'ENTERTAINMENT',
  SHOPPING = 'SHOPPING',
  TAX = 'TAX',
  TRANSFER = 'TRANSFER',
  OTHER = 'OTHER',
}

export const ACCOUNT_SUBCATEGORIES_BY_TYPE: Record<AccountType, readonly AccountSubcategory[]> = {
  [AccountType.ASSET]: [
    AccountSubcategory.CASH,
    AccountSubcategory.WALLET,
    AccountSubcategory.BANK_CHECKING,
    AccountSubcategory.BANK_SAVINGS,
    AccountSubcategory.FIXED_DEPOSIT,
    AccountSubcategory.MONEY_MARKET,
    AccountSubcategory.INVESTMENT,
    AccountSubcategory.BROKERAGE,
    AccountSubcategory.RETIREMENT,
    AccountSubcategory.EMERGENCY_FUND,
    AccountSubcategory.RECEIVABLE,
    AccountSubcategory.TAX_RECEIVABLE,
    AccountSubcategory.OTHER,
  ],
  [AccountType.LIABILITY]: [
    AccountSubcategory.CREDIT_CARD,
    AccountSubcategory.LINE_OF_CREDIT,
    AccountSubcategory.OVERDRAFT,
    AccountSubcategory.LOAN,
    AccountSubcategory.MORTGAGE,
    AccountSubcategory.STUDENT_LOAN,
    AccountSubcategory.AUTO_LOAN,
    AccountSubcategory.PERSONAL_LOAN,
    AccountSubcategory.PAYABLE,
    AccountSubcategory.TAX_PAYABLE,
    AccountSubcategory.OTHER,
  ],
  [AccountType.EQUITY]: [
    AccountSubcategory.OPENING_BALANCE,
    AccountSubcategory.NET_WORTH_ADJUSTMENT,
    AccountSubcategory.TRANSFER_CLEARING,
    AccountSubcategory.OTHER,
  ],
  [AccountType.INCOME]: [
    AccountSubcategory.SALARY,
    AccountSubcategory.BUSINESS_INCOME,
    AccountSubcategory.INTEREST_INCOME,
    AccountSubcategory.DIVIDEND_INCOME,
    AccountSubcategory.RENT_INCOME,
    AccountSubcategory.TAX,
    AccountSubcategory.OTHER,
  ],
  [AccountType.EXPENSE]: [
    AccountSubcategory.FOOD,
    AccountSubcategory.HOUSING,
    AccountSubcategory.TRANSPORT,
    AccountSubcategory.UTILITIES,
    AccountSubcategory.HEALTHCARE,
    AccountSubcategory.EDUCATION,
    AccountSubcategory.ENTERTAINMENT,
    AccountSubcategory.SHOPPING,
    AccountSubcategory.TAX,
    AccountSubcategory.TRANSFER,
    AccountSubcategory.OTHER,
  ],
}

export const ACCOUNT_DEFAULT_SUBCATEGORY_BY_TYPE: Record<AccountType, AccountSubcategory> = {
  [AccountType.ASSET]: AccountSubcategory.CASH,
  [AccountType.LIABILITY]: AccountSubcategory.CREDIT_CARD,
  [AccountType.EQUITY]: AccountSubcategory.OPENING_BALANCE,
  [AccountType.INCOME]: AccountSubcategory.SALARY,
  [AccountType.EXPENSE]: AccountSubcategory.FOOD,
}

export function getAccountSubcategoriesForType(accountType: AccountType): readonly AccountSubcategory[] {
  return ACCOUNT_SUBCATEGORIES_BY_TYPE[accountType]
}

export function getDefaultSubcategoryForType(accountType: AccountType): AccountSubcategory {
  return ACCOUNT_DEFAULT_SUBCATEGORY_BY_TYPE[accountType] ?? AccountSubcategory.OTHER
}

export function getDefaultSubcategoryForTypeLike(accountType: AccountType | string): AccountSubcategory {
  if (isAccountType(accountType)) {
    return getDefaultSubcategoryForType(accountType)
  }
  return AccountSubcategory.OTHER
}

export function formatAccountSubcategoryLabel(subcategory: AccountSubcategory): string {
  return subcategory
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function isAccountType(value: string): value is AccountType {
  return Object.values(AccountType).includes(value as AccountType)
}

export function isAccountSubcategory(value: string): value is AccountSubcategory {
  return Object.values(AccountSubcategory).includes(value as AccountSubcategory)
}

export function isSubcategoryAllowedForType(
  accountType: AccountType,
  subcategory?: AccountSubcategory
): boolean {
  if (!subcategory) return true
  return ACCOUNT_SUBCATEGORIES_BY_TYPE[accountType].includes(subcategory)
}

export default class Account extends Model {
  static table = 'accounts'
  static associations = {
    transactions: { type: 'has_many', foreignKey: 'account_id' },
    accounts: { type: 'has_many', foreignKey: 'parent_account_id' },
    account_metadata: { type: 'has_many', foreignKey: 'account_id' },
  } as const

  @field('name') name!: string
  @field('account_type') accountType!: AccountType
  @field('account_subtype') accountSubcategory?: AccountSubcategory
  @field('currency_code') currencyCode!: string
  @field('parent_account_id') parentAccountId?: string
  @field('description') description?: string
  @field('icon') icon?: string
  @field('order_num') orderNum?: number

  @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
  @date('deleted_at') deletedAt?: Date

  // Relations with proper types
  @children('transactions') transactions!: Query<Transaction>
  @children('accounts') subAccounts!: Query<Account>
  @children('account_metadata') metadataRecords!: Query<AccountMetadata>
}
