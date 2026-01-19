import Account, { AccountType } from '../data/models/Account'

export interface AccountCreateInput {
  name: string
  accountType: AccountType
  currencyCode: string
  description?: string
  parentAccountId?: string
  initialBalance?: number
}

export interface AccountUpdateInput {
  name?: string
  description?: string
  parentAccountId?: string
}

export interface AccountWithBalance extends Account {
  balance?: number
  transactionCount?: number
}

export interface AccountSummary {
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  totalIncome: number
  totalExpenses: number
  netWorth: number
}
