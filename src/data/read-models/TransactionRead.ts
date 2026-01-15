import { AccountType } from '../../data/models/Account'
import { TransactionType } from '../../data/models/Transaction'

/**
 * Transaction Read Model - Query result for transaction with account info
 * Read-only shape for UI consumption
 * No caching, no persistence - pure computed view
 */

export interface TransactionWithAccountInfo {
  // Core transaction data
  id: string
  amount: number
  transactionType: TransactionType
  currencyCode: string
  transactionDate: number
  notes?: string
  
  // Account information for display
  accountName: string
  accountType: AccountType
  
  // Running balance for this transaction
  runningBalance?: number
  
  // Audit fields
  createdAt: Date
  updatedAt: Date
}
