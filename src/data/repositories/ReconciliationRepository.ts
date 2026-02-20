import { database } from '@/src/data/database/Database'
import Journal from '@/src/data/models/Journal'
import { AccountRepository } from '@/src/data/repositories/AccountRepository'
import { balanceService } from '@/src/services/BalanceService'
import { Q } from '@nozbe/watermelondb'

export interface ReconciliationResult {
  accountId: string
  accountName: string
  systemBalance: number
  expectedBalance?: number
  variance: number
  isReconciled: boolean
  lastJournalDate?: number
  transactionCount: number
}

export interface PeriodReconciliation {
  startDate: number
  endDate: number
  totalAccounts: number
  reconciledAccounts: number
  totalVariance: number
  requiresAttention: boolean
}

export class ReconciliationRepository {
  private accountRepository = new AccountRepository()
  /**
   * Reconciles a single account against an expected balance
   * 
   * @param accountId Account to reconcile
   * @param expectedBalance Expected balance for verification
   * @returns Reconciliation result with variance analysis
   */
  async reconcileAccount(
    accountId: string,
    expectedBalance?: number
  ): Promise<ReconciliationResult> {
    // Get system balance
    const systemBalanceData = await balanceService.getAccountBalance(accountId)

    // Get account details
    const account = await this.accountRepository.find(accountId)
    if (!account) {
      throw new Error(`Account ${accountId} not found`)
    }

    // Get latest journal date for this account
    const journals = await database.collections.get<Journal>('journals')
      .query(
        Q.experimentalJoinTables(['transactions']),
        Q.on('transactions', Q.where('account_id', accountId)),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('status', Q.eq('POSTED'))
      )
      .extend(Q.sortBy('journal_date', 'desc'))
      .fetch()

    const variance = expectedBalance !== undefined
      ? systemBalanceData.balance - expectedBalance
      : 0

    return {
      accountId,
      accountName: account.name,
      systemBalance: systemBalanceData.balance,
      expectedBalance,
      variance,
      isReconciled: Math.abs(variance) < 0.01, // Within 1 cent
      lastJournalDate: journals[0]?.journalDate,
      transactionCount: systemBalanceData.transactionCount
    }
  }

  /**
   * Reconciles all accounts for a specific period
   * 
   * @param startDate Period start date
   * @param endDate Period end date  
   * @returns Period reconciliation summary
   */
  async reconcilePeriod(
    startDate: number,
    endDate: number
  ): Promise<PeriodReconciliation> {
    // Get all accounts
    const accounts = await this.accountRepository.findAll()

    // Reconcile each account
    const reconciliations = await Promise.all(
      accounts.map(account => this.reconcileAccount(account.id))
    )

    // Calculate period summary
    const reconciledAccounts = reconciliations.filter(r => r.isReconciled).length
    const totalVariance = reconciliations.reduce((sum, r) => sum + Math.abs(r.variance), 0)

    return {
      startDate,
      endDate,
      totalAccounts: accounts.length,
      reconciledAccounts,
      totalVariance,
      requiresAttention: totalVariance > 0.01 || reconciledAccounts < accounts.length
    }
  }

  /**
   * Gets accounts that require attention (unreconciled or high variance)
   * 
   * @param varianceThreshold Minimum variance to flag
   * @returns Array of accounts needing review
   */
  async getAccountsNeedingAttention(varianceThreshold: number = 0.01): Promise<ReconciliationResult[]> {
    const accounts = await this.accountRepository.findAll()

    const reconciliations = await Promise.all(
      accounts.map(account => this.reconcileAccount(account.id))
    )

    return reconciliations.filter(r =>
      !r.isReconciled || Math.abs(r.variance) > varianceThreshold
    )
  }
}

// Export singleton instance
export const reconciliationRepository = new ReconciliationRepository()
