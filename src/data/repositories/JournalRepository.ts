import { database } from '@/src/data/database/Database'
import Account, { AccountType } from '@/src/data/models/Account'
import { AuditAction } from '@/src/data/models/AuditLog'
import Journal, { JournalStatus } from '@/src/data/models/Journal'
import Transaction, { TransactionType } from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { auditRepository } from '@/src/data/repositories/AuditRepository'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { rebuildQueueService } from '@/src/data/repositories/RebuildQueue'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { JournalPresenter } from '@/src/services/accounting/JournalPresenter'
import { EnrichedJournal, EnrichedTransaction } from '@/src/types/domain'
import { getBalanceImpactMultiplier, validateBalance } from '@/src/utils/accounting-utils'
import { logger } from '@/src/utils/logger'
import { roundToPrecision } from '@/src/utils/money'
import { Q } from '@nozbe/watermelondb'

interface CreateJournalData {
  journalDate: number
  description?: string
  currencyCode: string
  transactions: {
    accountId: string
    amount: number
    transactionType: TransactionType
    notes?: string
    exchangeRate?: number
  }[]
}

export class JournalRepository {
  private get journals() {
    return database.collections.get<Journal>('journals')
  }

  private get transactions() {
    return database.collections.get<Transaction>('transactions')
  }

  /**
   * Reactive Observation Methods
   */

  observeEnrichedJournals(limit: number) {
    const journalsObservable = this.journals
      .query(
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('journal_date', 'desc'),
        Q.take(limit)
      )
      .observe()

    const transactionsObservable = this.transactions
      .query(Q.where('deleted_at', Q.eq(null)))
      .observe()

    return { journalsObservable, transactionsObservable }
  }

  observeAccountTransactions(accountId: string, limit: number) {
    return this.transactions
      .query(
        Q.where('account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('transaction_date', 'desc'),
        Q.take(limit)
      )
      .observe()
  }

  observeJournalTransactions(journalId: string) {
    return this.transactions
      .query(
        Q.where('journal_id', journalId),
        Q.where('deleted_at', Q.eq(null))
      )
      .observe()
  }

  /**
   * Creates a journal with its transactions
   * Enforces double-entry accounting: total debits must equal total credits
   */
  async createJournalWithTransactions(
    journalData: CreateJournalData
  ): Promise<Journal> {
    const { transactions: transactionData, ...journalFields } = journalData

    // 1. Fetch all accounts involved
    const accountIds = [...new Set(transactionData.map(t => t.accountId))]
    const accounts = await accountRepository.findAllByIds(accountIds)
    const accountMap = new Map(accounts.map(a => [a.id, a]))
    const accountTypes = new Map(accounts.map(a => [a.id, a.accountType as AccountType]))

    // Get precisions for each account involved to ensure accurate intermediate conversion
    const accountPrecisions = new Map<string, number>()
    await Promise.all(accounts.map(async acc => {
      const p = await currencyRepository.getPrecision(acc.currencyCode)
      accountPrecisions.set(acc.id, p)
    }))

    const journalPrecision = await currencyRepository.getPrecision(journalFields.currencyCode)

    // Round transaction amounts according to their account precision before conversion
    const roundedTransactionData = transactionData.map(t => {
      const precision = accountPrecisions.get(t.accountId) ?? 2
      return {
        ...t,
        amount: roundToPrecision(t.amount, precision)
      }
    })

    // Validate double-entry accounting by converting transaction amounts to journal currency
    const validationResult = validateBalance(roundedTransactionData.map(t => ({
      amount: t.amount,
      type: t.transactionType,
      exchangeRate: t.exchangeRate
    })), journalPrecision);

    if (!validationResult.isValid) {
      throw new Error(`Journal is unbalanced by ${validationResult.imbalance} ${journalFields.currencyCode}`)
    }

    const accountsToRebuild = new Set<string>()
    const calculatedBalances = new Map<string, number>()

    // Determine rebuilds or fast-updates
    for (const tx of roundedTransactionData) {
      const account = accountMap.get(tx.accountId)
      if (!account) throw new Error(`Account ${tx.accountId} not found`)

      const precision = accountPrecisions.get(tx.accountId) ?? 2
      const latestTx = await transactionRepository.findLatestForAccountBeforeDate(tx.accountId, journalFields.journalDate)

      const isBackdated = !!latestTx && latestTx.transactionDate > journalFields.journalDate

      if (isBackdated) {
        accountsToRebuild.add(tx.accountId)
      } else {
        let balance = latestTx?.runningBalance || 0
        const multiplier = getBalanceImpactMultiplier(account.accountType as any, tx.transactionType)
        balance = roundToPrecision(balance + (tx.amount * multiplier), precision)
        calculatedBalances.set(tx.accountId, balance)
      }
    }

    const journal = await database.write(async () => {
      // 2. Create the journal
      const j = await this.journals.create((j) => {
        Object.assign(j, journalFields)
        j.status = JournalStatus.POSTED
        j.totalAmount = Math.max(Math.abs(validationResult.totalDebits), Math.abs(validationResult.totalCredits))
        j.transactionCount = transactionData.length
        j.displayType = JournalPresenter.getJournalDisplayType(transactionData, accountTypes)
      })

      // Create all transactions using the rounded amounts
      await Promise.all(roundedTransactionData.map(txData => {
        return this.transactions.create((tx) => {
          tx.journalId = j.id
          tx.accountId = txData.accountId
          tx.amount = txData.amount // Already rounded above
          tx.currencyCode = accountMap.get(txData.accountId)?.currencyCode || journalFields.currencyCode
          tx.transactionType = txData.transactionType
          tx.transactionDate = journalFields.journalDate
          tx.notes = txData.notes
          tx.exchangeRate = txData.exchangeRate
          tx.runningBalance = calculatedBalances.get(txData.accountId)
        })
      }))

      return j
    })

    // Log audit trail outside of write block to avoid deadlocks
    await auditRepository.log({
      entityType: 'journal',
      entityId: journal.id,
      action: AuditAction.CREATE,
      changes: {
        journalDate: journalData.journalDate,
        description: journalData.description,
        currencyCode: journalData.currencyCode,
        transactionCount: transactionData.length,
        transactions: transactionData.map(tx => ({
          accountId: tx.accountId,
          accountName: accountMap.get(tx.accountId)?.name,
          currencyCode: accountMap.get(tx.accountId)?.currencyCode,
          amount: tx.amount,
          type: tx.transactionType,
          notes: tx.notes
        }))
      },
    })

    // Trigger rebuilds if necessary
    if (accountsToRebuild.size > 0) {
      rebuildQueueService.enqueueMany(accountsToRebuild, journalFields.journalDate)
    }

    return journal
  }

  /**
   * Fetches the last N journals with transaction summaries and account names
   * Repository-owned read model for the Dashboard/Journal history
   */
  async findEnrichedJournals(limit: number): Promise<EnrichedJournal[]> {
    const loadedJournals = await this.journals
      .query(
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('journal_date', 'desc'),
        Q.take(limit)
      )
      .fetch()

    if (loadedJournals.length === 0) return []

    const journalIds = loadedJournals.map(j => j.id)
    const transactions = await this.transactions
      .query(Q.where('journal_id', Q.oneOf(journalIds)), Q.where('deleted_at', Q.eq(null)))
      .fetch()

    const accountIds = [...new Set(transactions.map(t => t.accountId))]
    const accounts = await accountRepository.findAllByIds(accountIds)
    const accountMap = new Map(accounts.map(a => [a.id, a]))

    return loadedJournals.map(j => {
      const journalTxs = transactions.filter(t => t.journalId === j.id)
      const uniqueAccountIds = [...new Set(journalTxs.map(t => t.accountId))]

      const journalAccounts = uniqueAccountIds.map(id => {
        const acc = accountMap.get(id)
        return {
          id,
          name: acc?.name || 'Unknown',
          accountType: acc?.accountType || 'ASSET',
          role: journalTxs.find(t => t.accountId === id)?.transactionType === 'CREDIT' ? 'SOURCE' : 'DESTINATION'
        }
      }) as EnrichedJournal['accounts']

      // Semantic Classification
      const sourceLegs = journalTxs.filter(t => t.transactionType === TransactionType.CREDIT)
      const destLegs = journalTxs.filter(t => t.transactionType === TransactionType.DEBIT)
      const sourceAcc = sourceLegs.length === 1 ? accountMap.get(sourceLegs[0].accountId) : null
      const destAcc = destLegs.length === 1 ? accountMap.get(destLegs[0].accountId) : null

      let semanticType: string | undefined
      let semanticLabel: string | undefined

      if (sourceAcc && destAcc) {
        const sType = JournalPresenter.getSemanticType(sourceAcc.accountType as AccountType, destAcc.accountType as AccountType)
        semanticType = sType
        semanticLabel = sType // The enum strings are user-friendly
      }

      return {
        id: j.id,
        journalDate: j.journalDate,
        description: j.description,
        currencyCode: j.currencyCode,
        status: j.status,
        totalAmount: j.totalAmount || 0,
        transactionCount: j.transactionCount || 0,
        displayType: j.displayType || 'MIXED',
        accounts: journalAccounts,
        semanticType,
        semanticLabel
      }
    })
  }

  /**
   * Fetches enriched transactions for a specific account.
   */
  async findEnrichedTransactionsForAccount(accountId: string, limit: number): Promise<EnrichedTransaction[]> {
    const loadedTransactions = await this.transactions
      .query(
        Q.where('account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('transaction_date', 'desc'),
        Q.take(limit)
      )
      .fetch()

    if (loadedTransactions.length === 0) return []

    const journalIds = [...new Set(loadedTransactions.map(t => t.journalId))]
    const journals = await this.journals.query(Q.where('id', Q.oneOf(journalIds))).fetch()
    const journalMap = new Map(journals.map(j => [j.id, j]))

    const allJournalTxs = await this.transactions
      .query(Q.where('journal_id', Q.oneOf(journalIds)), Q.where('deleted_at', Q.eq(null)))
      .fetch()

    const accountIds = [...new Set(allJournalTxs.map(t => t.accountId))]
    const accounts = await accountRepository.findAllByIds(accountIds)
    const accountMap = new Map(accounts.map(a => [a.id, a]))

    return loadedTransactions.map(tx => {
      const journal = journalMap.get(tx.journalId)
      const journalTxs = allJournalTxs.filter(t => t.journalId === tx.journalId)
      return this.enrichTransaction(tx, journal, journalTxs, accountMap)
    })
  }

  /**
   * Internal helper to enrich a transaction with account and journal info.
   */
  private enrichTransaction(
    tx: Transaction,
    journal: Journal | undefined,
    journalTxs: Transaction[],
    accountMap: Map<string, Account>
  ): EnrichedTransaction {
    const accountId = tx.accountId
    const otherLegs = journalTxs.filter(t => t.accountId !== accountId)
    const account = accountMap.get(accountId)

    let displayTitle = journal?.description || ''
    let counterAccountName: string | undefined = undefined
    let counterAccountType: string | undefined = undefined

    if (otherLegs.length === 1) {
      const otherAcc = accountMap.get(otherLegs[0].accountId)
      displayTitle = otherAcc?.name || journal?.description || 'Offset Entry'
      counterAccountName = otherAcc?.name
      counterAccountType = otherAcc?.accountType as any
    } else if (otherLegs.length > 1 && !journal?.description) {
      displayTitle = 'Split'
    }

    const isIncrease = ['ASSET', 'EXPENSE'].includes(account?.accountType || '')
      ? tx.transactionType === 'DEBIT'
      : tx.transactionType === 'CREDIT'

    // Calculate semantic labeling for 2-leg transactions
    let semanticType: string | undefined = undefined
    let semanticLabel: string | undefined = undefined

    if (journalTxs.length === 2) {
      const debitLeg = journalTxs.find(t => t.transactionType === 'DEBIT')
      const creditLeg = journalTxs.find(t => t.transactionType === 'CREDIT')
      if (debitLeg && creditLeg) {
        const sourceAcc = accountMap.get(creditLeg.accountId)
        const destAcc = accountMap.get(debitLeg.accountId)
        if (sourceAcc && destAcc) {
          semanticLabel = JournalPresenter.getSemanticType(sourceAcc.accountType as any, destAcc.accountType as any)
          semanticType = semanticLabel
        }
      }
    }

    // Use standardized journal classification for the display type
    const accountTypesMap = new Map<string, AccountType>()
    journalTxs.forEach(t => {
      const acc = accountMap.get(t.accountId)
      if (acc) accountTypesMap.set(t.accountId, acc.accountType as AccountType)
    })
    const legDisplayType = JournalPresenter.getJournalDisplayType(journalTxs, accountTypesMap)

    return {
      id: tx.id,
      journalId: tx.journalId,
      accountId: tx.accountId,
      amount: tx.amount,
      currencyCode: tx.currencyCode,
      transactionType: tx.transactionType as any,
      transactionDate: tx.transactionDate,
      notes: tx.notes,
      journalDescription: journal?.description,
      accountName: account?.name,
      accountType: account?.accountType as any,
      counterAccountName,
      counterAccountType,
      runningBalance: tx.runningBalance,
      displayTitle,
      isIncrease,
      displayType: legDisplayType,
      semanticType,
      semanticLabel
    }
  }

  /**
   * Fetches enriched transactions for a specific journal.
   */
  async findEnrichedTransactionsByJournal(journalId: string): Promise<EnrichedTransaction[]> {
    const journal = await this.find(journalId)
    if (!journal) return []

    const journalTxs = await this.transactions
      .query(Q.where('journal_id', journalId), Q.where('deleted_at', Q.eq(null)))
      .fetch()

    const accountIds = [...new Set(journalTxs.map(t => t.accountId))]
    const accounts = await accountRepository.findAllByIds(accountIds)
    const accountMap = new Map(accounts.map(a => [a.id, a]))

    return journalTxs.map(tx => this.enrichTransaction(tx, journal, journalTxs, accountMap))
  }

  async findAll(): Promise<Journal[]> {
    return this.journals
      .query(Q.where('deleted_at', Q.eq(null)))
      .extend(Q.sortBy('journal_date', 'desc'))
      .fetch()
  }

  async find(id: string): Promise<Journal | null> {
    try {
      return await this.journals.find(id)
    } catch {
      return null
    }
  }

  async findByDateRange(startDate: number, endDate: number): Promise<Journal[]> {
    return this.journals
      .query(
        Q.and(
          Q.where('journal_date', Q.gte(startDate)),
          Q.where('journal_date', Q.lte(endDate)),
          Q.where('deleted_at', Q.eq(null))
        )
      )
      .fetch()
  }

  async updateJournalWithTransactions(
    journalId: string,
    journalData: CreateJournalData
  ): Promise<Journal> {
    const { transactions: transactionData, ...journalFields } = journalData

    const existingJournal = await this.find(journalId)
    if (!existingJournal) throw new Error('Journal not found')

    const beforeState = {
      journalDate: existingJournal.journalDate,
      description: existingJournal.description,
      currencyCode: existingJournal.currencyCode,
    }

    const oldTransactions = await this.transactions.query(Q.where('journal_id', journalId)).fetch()
    const accountIds = [...new Set([...transactionData.map(t => t.accountId), ...oldTransactions.map(t => t.accountId)])]
    const accounts = await accountRepository.findAllByIds(accountIds)
    const accountMap = new Map(accounts.map(a => [a.id, a]))
    const accountTypes = new Map(accounts.map(a => [a.id, a.accountType as AccountType]))

    // Get precisions for each account involved
    const accountPrecisions = new Map<string, number>()
    await Promise.all(accounts.map(async acc => {
      const p = await currencyRepository.getPrecision(acc.currencyCode)
      accountPrecisions.set(acc.id, p)
    }))

    const journalPrecision = await currencyRepository.getPrecision(journalFields.currencyCode)

    // Round transaction amounts according to their account precision before conversion
    const roundedTransactionData = transactionData.map(t => {
      const precision = accountPrecisions.get(t.accountId) ?? 2
      return {
        ...t,
        amount: roundToPrecision(t.amount, precision)
      }
    })

    // 1. Validate the balance first using the rounded amounts
    const validationResult = validateBalance(roundedTransactionData.map(t => ({
      amount: t.amount,
      type: t.transactionType,
      exchangeRate: t.exchangeRate
    })), journalPrecision);

    if (!validationResult.isValid) {
      throw new Error(`Unbalanced journal: ${validationResult.imbalance}`)
    }

    const accountsToRebuild = new Set<string>()
    const calculatedBalances = new Map<string, number>()

    let updatedJournal: Journal | undefined

    await database.write(async () => {
      // 2. Clear old transactions
      await Promise.all(oldTransactions.map(tx => tx.destroyPermanently()))

      // Mark old accounts for rebuild (since we deleted their transactions)
      oldTransactions.forEach(tx => accountsToRebuild.add(tx.accountId))

      for (const txData of roundedTransactionData) {
        const account = accountMap.get(txData.accountId)
        if (!account) throw new Error(`Account ${txData.accountId} not found`)

        const precision = accountPrecisions.get(txData.accountId) ?? 2
        const latestOtherTx = await transactionRepository.findLatestForAccountBeforeDate(txData.accountId, journalFields.journalDate)

        const isBackdated = !!latestOtherTx && latestOtherTx.transactionDate > journalFields.journalDate

        let running_balance: number | undefined = undefined
        if (!isBackdated) {
          const balance = latestOtherTx?.runningBalance || 0
          const multiplier = getBalanceImpactMultiplier(account.accountType as any, txData.transactionType)
          running_balance = roundToPrecision(balance + (txData.amount * multiplier), precision)
          calculatedBalances.set(txData.accountId, running_balance)
        } else {
          accountsToRebuild.add(txData.accountId)
        }

        await this.transactions.create((tx) => {
          tx.accountId = txData.accountId
          tx.amount = txData.amount // Rounded above
          tx.currencyCode = account?.currencyCode || journalFields.currencyCode
          tx.transactionType = txData.transactionType
          tx.journalId = journalId
          tx.transactionDate = journalFields.journalDate
          tx.notes = txData.notes
          tx.exchangeRate = txData.exchangeRate
          tx.runningBalance = running_balance
        })
      }

      // 3. Calculate new denormalized fields
      const newTotalAmount = Math.max(Math.abs(validationResult.totalDebits), Math.abs(validationResult.totalCredits))
      const newTransactionCount = transactionData.length
      const newDisplayType = JournalPresenter.getJournalDisplayType(transactionData, accountTypes)

      // 4. Update journal
      await existingJournal.update((j: Journal) => {
        j.journalDate = journalFields.journalDate
        j.description = journalFields.description
        j.currencyCode = journalFields.currencyCode
        j.totalAmount = newTotalAmount
        j.transactionCount = newTransactionCount
        j.displayType = newDisplayType
      })

      updatedJournal = existingJournal
    })

    if (!updatedJournal) throw new Error('Failed to update journal')

    // 5. Log audit trail outside of write block to avoid deadlocks
    await auditRepository.log({
      entityType: 'journal',
      entityId: journalId,
      action: AuditAction.UPDATE,
      changes: {
        before: {
          ...beforeState,
          transactions: oldTransactions.map(tx => ({
            accountId: tx.accountId,
            accountName: accountMap.get(tx.accountId)?.name,
            currencyCode: accountMap.get(tx.accountId)?.currencyCode,
            amount: tx.amount,
            type: tx.transactionType,
            notes: tx.notes
          }))
        },
        after: {
          journalDate: journalFields.journalDate,
          description: journalFields.description,
          currencyCode: journalFields.currencyCode,
          totalAmount: updatedJournal.totalAmount,
          transactionCount: updatedJournal.transactionCount,
          displayType: updatedJournal.displayType,
          transactions: transactionData.map(tx => ({
            accountId: tx.accountId,
            accountName: accountMap.get(tx.accountId)?.name,
            currencyCode: accountMap.get(tx.accountId)?.currencyCode,
            amount: tx.amount,
            type: tx.transactionType,
            notes: tx.notes
          }))
        }
      }
    })

    if (accountsToRebuild.size > 0) {
      rebuildQueueService.enqueueMany(accountsToRebuild, journalFields.journalDate)
    }

    return updatedJournal
  }

  async createReversalJournal(
    originalJournalId: string,
    reason: string = 'Reversal'
  ): Promise<Journal> {
    const originalJournal = await this.find(originalJournalId)
    if (!originalJournal) throw new Error('Original journal not found')

    const originalTransactions = await this.transactions.query(Q.where('journal_id', originalJournalId)).fetch()
    const reverseAccountIds = originalTransactions.map(tx => tx.accountId)
    await accountRepository.findAllByIds(reverseAccountIds)

    const reversalJournal = await database.write(async () => {
      const revJ = await this.journals.create((j) => {
        j.journalDate = Date.now()
        j.description = `Reversal of: ${originalJournal.description || originalJournalId} (${reason})`
        j.currencyCode = originalJournal.currencyCode
        j.status = JournalStatus.POSTED
        j.totalAmount = originalJournal.totalAmount
        j.transactionCount = originalJournal.transactionCount
        j.displayType = originalJournal.displayType
      })

      await Promise.all(originalTransactions.map(tx => {
        const revType = tx.transactionType === TransactionType.DEBIT ? TransactionType.CREDIT : TransactionType.DEBIT
        return this.transactions.create((rtx) => {
          rtx.journalId = revJ.id
          rtx.accountId = tx.accountId
          rtx.amount = tx.amount
          rtx.currencyCode = tx.currencyCode
          rtx.transactionType = revType
          rtx.transactionDate = revJ.journalDate
          rtx.exchangeRate = tx.exchangeRate
          rtx.notes = `Reversal: ${tx.notes || ''}`
        })
      }))

      return revJ
    })

    // Log audit trail OUTSIDE write block to avoid deadlocks
    await auditRepository.log({
      entityType: 'journal',
      entityId: originalJournalId,
      action: AuditAction.UPDATE,
      changes: {
        action: 'REVERSED',
        reversalJournalId: reversalJournal.id,
        reason: reason,
      }
    })

    // Trigger rebuild for all affected accounts since the reversal is at current date
    const accountIdsToRebuild = new Set(originalTransactions.map(tx => tx.accountId))
    rebuildQueueService.enqueueMany(accountIdsToRebuild, Date.now())

    return reversalJournal
  }

  async deleteJournal(journalId: string): Promise<void> {
    const journal = await this.find(journalId)
    if (!journal) return

    const associatedTransactions = await this.transactions.query(Q.where('journal_id', journalId)).fetch()

    const auditData = {
      description: journal.description,
      totalAmount: journal.totalAmount,
    }

    await database.write(async () => {
      // Soft delete journal
      await journal.update((j) => {
        j.deletedAt = new Date()
      })

      // Soft delete all transactions
      await Promise.all(associatedTransactions.map(tx => {
        return tx.update((t) => {
          t.deletedAt = new Date()
        })
      }))
    })

    // 3. Log audit trail OUTSIDE write block to avoid deadlocks
    await auditRepository.log({
      entityType: 'journal',
      entityId: journal.id,
      action: AuditAction.DELETE,
      changes: auditData
    })

    // Trigger rebuild for balance integrity
    const accountIdsToRebuild = new Set(associatedTransactions.map(tx => tx.accountId))
    rebuildQueueService.enqueueMany(accountIdsToRebuild, journal.journalDate)
  }

  async getMonthlySummary(month: number, year: number): Promise<{ income: number, expense: number }> {
    const startOfMonth = new Date(year, month, 1).getTime()
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime()

    const txs = await this.transactions.query(
      Q.and(
        Q.where('transaction_date', Q.gte(startOfMonth)),
        Q.where('transaction_date', Q.lte(endOfMonth)),
        Q.where('deleted_at', Q.eq(null))
      )
    ).fetch()

    if (txs.length === 0) return { income: 0, expense: 0 }

    const accountIds = [...new Set(txs.map(t => t.accountId))]
    const accounts = await accountRepository.findAllByIds(accountIds)
    const accountTypeMap = new Map(accounts.map(a => [a.id, a.accountType as AccountType]))

    let totalIncome = 0
    let totalExpense = 0

    txs.forEach(t => {
      const type = accountTypeMap.get(t.accountId)
      if (type === AccountType.INCOME) {
        totalIncome += t.amount
      } else if (type === AccountType.EXPENSE) {
        totalExpense += t.amount
      }
    })

    return { income: totalIncome, expense: totalExpense }
  }

  async backfillTotals(): Promise<void> {
    logger.info('Starting journal totals backfill...')
    const journals = await this.journals.query(Q.where('deleted_at', Q.eq(null))).fetch()
    let updatedCount = 0

    for (const journal of journals) {
      const txs = await this.transactions.query(Q.where('journal_id', journal.id)).fetch()
      const accountIds = [...new Set(txs.map(t => t.accountId))]
      const accounts = await accountRepository.findAllByIds(accountIds)
      const accountTypeMap = new Map(accounts.map(a => [a.id, a.accountType as AccountType]))

      const totalDebits = txs.filter(t => t.transactionType === TransactionType.DEBIT).reduce((sum, t) => sum + t.amount, 0)
      const totalCredits = txs.filter(t => t.transactionType === TransactionType.CREDIT).reduce((sum, t) => sum + t.amount, 0)
      const magnitude = Math.max(totalDebits, totalCredits)
      const displayType = JournalPresenter.getJournalDisplayType(txs, accountTypeMap)

      if (
        Math.abs((journal.totalAmount || 0) - magnitude) > 0.001 ||
        journal.transactionCount !== txs.length ||
        journal.displayType !== displayType
      ) {
        await database.write(async () => {
          await journal.update((j) => {
            j.totalAmount = magnitude
            j.transactionCount = txs.length
            j.displayType = displayType
          })
        })
        updatedCount++
      }
    }

    logger.info(`Backfill complete. Updated ${updatedCount} journals.`)
  }
}

export const journalRepository = new JournalRepository()
