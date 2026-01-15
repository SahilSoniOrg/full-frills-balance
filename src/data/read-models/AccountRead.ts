import { AccountType } from '../../data/models/Account'

/**
 * Account Read Model - Query result for account with balance
 * Read-only shape for UI consumption
 * No caching, no persistence - pure computed view
 */

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
