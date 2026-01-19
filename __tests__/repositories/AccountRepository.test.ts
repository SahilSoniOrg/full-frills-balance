import { database } from '../../src/data/database/Database'
import Account, { AccountType } from '../../src/data/models/Account'
import Transaction, { TransactionType } from '../../src/data/models/Transaction'
import { AccountRepository } from '../../src/data/repositories/AccountRepository'

// Mock data setup helpers
const createMockAccount = async (type: AccountType, name: string = 'Test Account') => {
  return await database.write(async () => {
    return await database.collections.get<Account>('accounts').create(account => {
      account.name = name
      account.accountType = type
      account.currencyCode = 'USD'
    })
  })
}

const createMockJournal = async (name: string = 'Test Journal', date?: number) => {
  return await database.write(async () => {
    return await database.collections.get<any>('journals').create(j => {
      j.description = name
      j.journalDate = date || Date.now()
      j.status = 'POSTED'
      j.currencyCode = 'USD'
    })
  })
}

let lastTxDate = new Date('2020-01-01').getTime()
const createMockTransaction = async (accountId: string, amount: number, type: TransactionType, journalId?: string, date?: number) => {
  const jId = journalId || (await createMockJournal(undefined, date)).id
  const txDate = date || (lastTxDate += 1000) // Increment by 1 second

  return await database.write(async () => {
    const repo = new AccountRepository()
    const account = await repo.find(accountId)
    // For date-aware tests, we need to be careful with 'current balance'
    // Simplified: Fetch latest balance BEFORE this date
    const currentBalance = (await repo.getAccountBalance(accountId, (txDate - 1))).balance

    let direction = 0
    const isDebit = type === TransactionType.DEBIT

    if (account?.accountType === AccountType.ASSET || account?.accountType === AccountType.EXPENSE) {
      direction = isDebit ? 1 : -1
    } else {
      direction = isDebit ? -1 : 1
    }

    const newRunningBalance = currentBalance + (amount * direction)

    return await database.collections.get<Transaction>('transactions').create(tx => {
      tx.accountId = accountId
      tx.journalId = jId
      tx.amount = amount
      tx.transactionType = type
      tx.currencyCode = 'USD'
      tx.transactionDate = txDate
      tx.runningBalance = newRunningBalance
    })
  })
}

describe('AccountRepository.getAccountBalance', () => {
  let accountRepository: AccountRepository
  let testAssetAccount: Account
  let testLiabilityAccount: Account

  beforeEach(async () => {
    accountRepository = new AccountRepository()

    // Create test accounts
    testAssetAccount = await createMockAccount(AccountType.ASSET, 'Test Asset')
    testLiabilityAccount = await createMockAccount(AccountType.LIABILITY, 'Test Liability')
  })

  afterEach(async () => {
    // Clean up database
    await database.write(async () => {
      await database.collections.get<Account>('accounts').query().destroyAllPermanently()
      await database.collections.get<any>('journals').query().destroyAllPermanently()
      await database.collections.get<Transaction>('transactions').query().destroyAllPermanently()
    })
  })

  describe('Asset account behavior', () => {
    it('should increase balance with debits', async () => {
      // Create a debit transaction (increases asset balance)
      await createMockTransaction(testAssetAccount.id, 100, TransactionType.DEBIT)

      const balance = await accountRepository.getAccountBalance(testAssetAccount.id)

      expect(balance.balance).toBe(100)
    })

    it('should decrease balance with credits', async () => {
      // Create initial debit
      await createMockTransaction(testAssetAccount.id, 200, TransactionType.DEBIT)
      // Create credit transaction (decreases asset balance)
      await createMockTransaction(testAssetAccount.id, 50, TransactionType.CREDIT)

      const balance = await accountRepository.getAccountBalance(testAssetAccount.id)

      expect(balance.balance).toBe(150) // 200 - 50
    })

    it('should handle zero balance correctly', async () => {
      // Create equal debits and credits
      await createMockTransaction(testAssetAccount.id, 100, TransactionType.DEBIT)
      await createMockTransaction(testAssetAccount.id, 100, TransactionType.CREDIT)

      const balance = await accountRepository.getAccountBalance(testAssetAccount.id)

      expect(balance.balance).toBe(0)
      expect(balance.transactionCount).toBe(2)
    })
  })

  describe('Liability account behavior', () => {
    it('should increase balance with credits', async () => {
      // Create a credit transaction (increases liability balance)
      await createMockTransaction(testLiabilityAccount.id, 100, TransactionType.CREDIT)

      const balance = await accountRepository.getAccountBalance(testLiabilityAccount.id)

      expect(balance.balance).toBe(100)
    })

    it('should decrease balance with debits', async () => {
      // Create initial credit
      await createMockTransaction(testLiabilityAccount.id, 200, TransactionType.CREDIT)
      // Create debit transaction (decreases liability balance)
      await createMockTransaction(testLiabilityAccount.id, 50, TransactionType.DEBIT)

      const balance = await accountRepository.getAccountBalance(testLiabilityAccount.id)

      expect(balance.balance).toBe(150) // 200 - 50
      expect(balance.transactionCount).toBe(2)
    })
  })

  describe('Point-in-time balance correctness', () => {
    it('should calculate balance as of specific date', async () => {
      const baseTime = Date.now() - 10000
      const midTime = baseTime + 5000
      const laterTime = midTime + 5000

      await createMockTransaction(testAssetAccount.id, 100, TransactionType.DEBIT, undefined, baseTime)
      await createMockTransaction(testAssetAccount.id, 50, TransactionType.CREDIT, undefined, laterTime)

      const balanceAtMid = await accountRepository.getAccountBalance(testAssetAccount.id, midTime)
      expect(balanceAtMid.balance).toBe(100)

      const currentBalance = await accountRepository.getAccountBalance(testAssetAccount.id)
      expect(currentBalance.balance).toBe(50)
    })
  })

  describe('Error handling', () => {
    it('should throw error for non-existent account', async () => {
      await expect(
        accountRepository.getAccountBalance('non-existent-id')
      ).rejects.toThrow('Account non-existent-id not found')
    })
  })
})
