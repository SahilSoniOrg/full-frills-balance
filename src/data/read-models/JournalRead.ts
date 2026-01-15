/**
 * Journal Read Model - Query result for journal with transaction summary
 * Read-only shape for UI consumption
 * No caching, no persistence - pure computed view
 */

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
