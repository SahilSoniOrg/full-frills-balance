import { AccountType } from '../data/models/Account'
import { TransactionType } from '../data/models/Transaction'

/**
 * Repository-owned read models for UI consumption
 * These are read-only shapes that combine related data for presentation
 * No caching, no persistence - pure computed views
 */

export interface TransactionWithAccountInfo {
  // Core transaction data
  id: string
  amount: number
  transactionType: TransactionType
  currencyCode: string
  transactionDate: number
  notes?: string
  accountId: string
  exchangeRate?: number

  // Account information for display
  accountName: string
  accountType: AccountType
  counterAccountName?: string
  counterAccountType?: AccountType
  journalDescription?: string
  displayTitle?: string
  isIncrease?: boolean

  // Running balance for this transaction
  runningBalance?: number

  // Audit fields
  createdAt: Date
  updatedAt: Date
}

export interface JournalWithTransactionSummary {
  // Core journal data
  id: string
  journalDate: number
  description?: string
  currencyCode: string
  status: string

  // Computed transaction summary
  totalDebits: number
  totalCredits: number
  transactionCount: number
  isBalanced: boolean

  // Audit fields
  createdAt: Date
  updatedAt: Date
}

export interface AccountWithBalance {
  // Core account data
  id: string
  name: string
  accountType: AccountType
  currencyCode: string
  description?: string

  // Computed balance information
  currentBalance: number
  transactionCount: number
  lastActivityDate?: number

  // Audit fields
  createdAt: Date
  updatedAt: Date
}
