import { database } from '@/src/data/database/Database'
import { AccountSubcategory, AccountType } from '@/src/data/models/Account'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { importRepository } from '@/src/data/repositories/ImportRepository'

describe('ImportRepository', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase()
    })
  })

  describe('batchInsert account subcategory defaults', () => {
    it('should use type defaults when accountSubcategory is missing', async () => {
      await importRepository.batchInsert({
        accounts: [
          { id: 'a_asset', name: 'Asset A', accountType: AccountType.ASSET, currencyCode: 'USD' },
          { id: 'a_liability', name: 'Liability A', accountType: AccountType.LIABILITY, currencyCode: 'USD' },
          { id: 'a_equity', name: 'Equity A', accountType: AccountType.EQUITY, currencyCode: 'USD' },
          { id: 'a_income', name: 'Income A', accountType: AccountType.INCOME, currencyCode: 'USD' },
          { id: 'a_expense', name: 'Expense A', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
        ],
        journals: [],
        transactions: [],
      })

      const asset = await accountRepository.find('a_asset')
      const liability = await accountRepository.find('a_liability')
      const equity = await accountRepository.find('a_equity')
      const income = await accountRepository.find('a_income')
      const expense = await accountRepository.find('a_expense')

      expect(asset?.accountSubcategory).toBe(AccountSubcategory.CASH)
      expect(liability?.accountSubcategory).toBe(AccountSubcategory.CREDIT_CARD)
      expect(equity?.accountSubcategory).toBe(AccountSubcategory.OPENING_BALANCE)
      expect(income?.accountSubcategory).toBe(AccountSubcategory.SALARY)
      expect(expense?.accountSubcategory).toBe(AccountSubcategory.FOOD)
    })

    it('should default to OTHER for unknown imported account type', async () => {
      await importRepository.batchInsert({
        accounts: [
          { id: 'a_unknown', name: 'Unknown A', accountType: 'UNKNOWN_TYPE', currencyCode: 'USD' },
        ],
        journals: [],
        transactions: [],
      })

      const unknown = await accountRepository.find('a_unknown')
      expect(unknown?.accountSubcategory).toBe(AccountSubcategory.OTHER)
    })
  })
})
