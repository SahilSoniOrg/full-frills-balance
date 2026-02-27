# Database Layer Performance Issues Audit

## Critical Issues

### 1. ⚠️ UNBOUNDED `observeActive()` - Fetches ALL Transactions (Line 208-213 in TransactionRepository.ts)

**Severity**: CRITICAL  
**Location**: [TransactionRepository.ts](src/data/repositories/TransactionRepository.ts#L208-L218)  
**Usage**: [insight-service.ts](src/services/insight-service.ts#L271)

```typescript
// ❌ PROBLEM: No limit, no pagination - fetches ALL active transactions
observeActive() {
  return this.transactions
    .query(
      Q.experimentalJoinTables(['journals']),
      Q.where('deleted_at', Q.eq(null)),
      Q.on('journals', [
        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.where('deleted_at', Q.eq(null))
      ])
    )
    .observe()  // ⛔ No limit!
}
```

**Impact**:
- With 10,000 transactions: 10,000 records loaded into memory
- Every time ANY transaction changes, ALL 10,000 re-emitted to subscribers
- React re-renders entire component tree
- Mobile memory pressure
- Network transfer (if synced)

**Affected**: InsightService.observePatterns() subscribes to all active transactions and iterates over them:
```typescript
transactionRepository.observeActive(),  // Line 271
// Later in code:
for (const tx of [ALL TRANSACTIONS]) {
  // Expensive pattern matching
}
```

**Fix**: Add limit and date range:
```typescript
observeActive(limit: number = 500, dateRange?: DateRange) {
  const clauses = [Q.experimentalJoinTables(['journals']), ...]
  if (dateRange) {
    clauses.push(Q.where('transaction_date', Q.gte(dateRange.start)))
    clauses.push(Q.where('transaction_date', Q.lte(dateRange.end)))
  }
  return this.transactions
    .query(...clauses)
    .extend(Q.take(limit))
    .extend(Q.sortBy('transaction_date', 'desc'))
    .observeWithColumns([...])
}
```

---

### 2. ⚠️ N+1 Problem in Reconciliation (ReconciliationRepository.ts)

**Severity**: CRITICAL  
**Location**: [ReconciliationRepository.ts](src/data/repositories/ReconciliationRepository.ts#L115)

```typescript
async getAccountsNeedingAttention(varianceThreshold: number = 0.01) {
  const accounts = await accountRepository.findAll()  // 1 query: fetch N accounts
  
  // ❌ N+1: Now N more queries (one per account)
  const reconciliations = await Promise.all(
    accounts.map(account => this.reconcileAccount(account.id))  // Each calls getAccountBalance + findLatestForAccount
  )
}
```

**Impact**:
- 100 accounts = 1 + 100 + (100 × 2) = 301 database queries
- Each `reconcileAccount()` calls:
  - `balanceService.getAccountBalance()` → `findLatestForAccount()` → Query
  - `journalRepository.query()` → Another query

**Why This Happens**:
- No batch query for balances
- No batch query for latest transactions
- No caching of balance calculations

**Fix**: 
```typescript
async getAccountsNeedingAttention(varianceThreshold: number = 0.01) {
  const accounts = await accountRepository.findAll()
  
  // ✅ Batch load all balances at once
  const balances = await balanceService.getAccountBalances()  
  const balancesMap = new Map(balances.map(b => [b.accountId, b]))
  
  // ✅ Batch load all latest transactions
  const latestTxs = await transactionRepository.getLatestPerAccount(accounts.map(a => a.id))
  
  return accounts.map(account => ({
    ...account,
    variance: balancesMap.get(account.id)?.balance || 0,
    isReconciled: Math.abs(variance) < varianceThreshold
  }))
}
```

---

### 3. ⚠️ Expensive Budget Usage Calculation (BudgetReadService.ts)

**Severity**: HIGH  
**Location**: [budgetReadService.ts](src/services/budget/budgetReadService.ts#L125)

```typescript
observeBudgetEnrichedTransactions(budget: Budget, targetMonth?: string) {
  return budgetRepository.observeScopes(budget.id).pipe(
    switchMap(scopes => {
      // ❌ Resolves ALL descendants for EVERY budget change
      const getDescendants = (id: string, result: Set<string>) => {
        const children = childrenMap.get(id) || []
        for (const childId of children) {
          result.add(childId)
          getDescendants(childId, result)  // ❌ Recursive tree walk on every budget update
        }
      }
      
      const leafExpenseIds = new Set<string>()
      for (const acc of scopeAccounts) {
        leafExpenseIds.add(acc.id)
        getDescendants(acc.id, leafExpenseIds)  // Rebuilds tree every time
      }
    })
  )
}
```

**Impact**:
- Large expense hierarchies (50+ accounts) trigger expensive tree walk every time ANY budget scope changes
- Creates childrenMap fresh every time
- Recursive calls with no memoization

**Fix**: Cache the descendant map:
```typescript
private descendantCache = new Map<string, Set<string>>()

private getDescendantsFromCache(id: string, accountMap: Map<string, Account[]>): Set<string> {
  if (this.descendantCache.has(id)) return this.descendantCache.get(id)!
  
  const descendants = new Set<string>([id])
  const children = accountMap.get(id) || []
  for (const child of children) {
    this.getDescendantsFromCache(child.id, accountMap).forEach(d => descendants.add(d))
  }
  this.descendantCache.set(id, descendants)
  return descendants
}
```

---

### 4. ⚠️ Multiple Simultaneous Observations of Same Data (InsightService.ts)

**Severity**: HIGH  
**Location**: [insight-service.ts](src/services/insight-service.ts#L82-L92)

```typescript
return combineLatest([
  accountRepository.observeByType(AccountType.ASSET),      // All assets
  accountRepository.observeByType(AccountType.LIABILITY),  // All liabilities
  budgetRepository.observeAllActive(),                     // All budgets
  plannedPaymentRepository.observeActive(),                // All planned payments
  this.observePatterns(),                                  // All patterns (iterates all txs!)
  accountRepository.observeAll(),                          // ❌ ALL accounts again (redundant!)
  journalRepository.observePlannedForMonth(...),           // All planned journals
]).pipe(
  switchMap(([assets, liabilities, budgets, payments, patterns, allAccounts, plannedJournals]) => {
    // Arrays are passed to code below, but allAccounts is just all accounts again
    // already have assets + liabilities + created implicitly above
  })
)
```

**Impact**:
- `accountRepository.observeAll()` at line 88 is **redundant**
  - Already have all assets (line 82)
  - Already have all liabilities (line 83)
  - Can reconstruct from those two
- Extra subscription overhead
- Extra emissions when any account changes

**Fix**: Remove redundant observation:
```typescript
return combineLatest([
  accountRepository.observeByType(AccountType.ASSET),
  accountRepository.observeByType(AccountType.LIABILITY),
  budgetRepository.observeAllActive(),
  plannedPaymentRepository.observeActive(),
  this.observePatterns(),
  journalRepository.observePlannedForMonth(dayjs().format('YYYY-MM')),
]).pipe(
  switchMap(([assets, liabilities, budgets, payments, patterns, plannedJournals]) => {
    // Use: const allAccounts = [...assets, ...liabilities]
  })
)
```

---

### 5. ⚠️ No Limit on `observeByType()` for Large Account Lists

**Severity**: HIGH  
**Location**: [AccountRepository.ts](src/data/repositories/AccountRepository.ts#L46-L52)

```typescript
observeByType(accountType: string) {
  const query = this.accounts
    .query(
      Q.where('account_type', accountType),
      Q.where('deleted_at', Q.eq(null)),
      Q.sortBy('order_num', Q.asc)
    )
  return query.observeWithColumns([...])
  // ❌ No limit - if 1000 EXPENSE accounts, all loaded
}
```

**Impact**:
- BudgetReadService iterates all EXPENSE accounts to find descendants
- Each expense account might have children
- With 500-1000 expense accounts: expensive tree walk

**Impact in BudgetReadService**:
```typescript
accountRepository.observeByType(AccountType.EXPENSE)  // Could be 500+ accounts
  .pipe(
    switchMap(allExpenses => {
      // Builds child map from 500+ accounts
      allExpenses.forEach(acc => {
        if (acc.parentAccountId) {
          const siblings = childrenMap.get(acc.parentAccountId) || []
          siblings.push(acc.id)
          childrenMap.set(acc.parentAccountId, siblings)
        }
      })
      // Then recursively walks tree for each budget scope
    })
  )
```

**Fix**: Limit to expense accounts actually used:
```typescript
observeByType(accountType: string, parentId?: string) {
  let query = this.accounts.query(
    Q.where('account_type', accountType),
    Q.where('deleted_at', Q.eq(null))
  )
  
  if (parentId) {
    query = query.extend(Q.where('parent_account_id', parentId))
  }
  
  return query.observeWithColumns([...])
}
```

---

### 6. ⚠️ Running Balance Calculation on Large Journals

**Severity**: MEDIUM  
**Location**: [AccountingRebuildService.ts](src/services/AccountingRebuildService.ts#L50-L100)

```typescript
async rebuildAccountBalances(accountId: string, fromDate?: number) {
  // Fetch all transactions (could be 10,000+)
  const transactions = await query
    .extend(Q.sortBy('transaction_date', 'asc'))
    .extend(Q.sortBy('created_at', 'asc'))
    .fetch()  // ❌ No limit
  
  const pendingUpdates = []
  
  for (const tx of transactions) {  // ❌ Loop over potentially 10,000 records
    const newBalance = accountingService.calculateNewBalance(...)
    if (Math.abs((tx.runningBalance || 0) - newBalance) > Number.EPSILON) {
      pendingUpdates.push({ tx, newBalance })
    }
  }
  
  // Batch update in chunks of 500
  for (let i = 0; i < pendingUpdates.length; i += 500) {
    await database.write(async () => {
      await database.batch(...pendingUpdates.slice(i, i + 500))
    })
  }
}
```

**Impact**:
- Calculating running balance for 100,000 transactions = 100,000 iterations
- If account has 100 years of daily transactions = 36,500 calculations
- No opportunity to parallelize
- Entire account locked during rebuild

**Problem**: `running_balance` is rebuilt from scratch on every journal edit:
```typescript
// In JournalRepository.createJournal()
const calculatedBalances = new Map()
for (const tx of newTransactions) {
  runningBalance = calculateNewBalance(runningBalance, tx.amount, ...)
  calculatedBalances.set(tx.accountId, runningBalance)
}
// This is sequential - can't parallelize
```

**Fix**: Only recalculate affected range:
```typescript
async rebuil dAccountBalances(accountId: string, fromDate?: number) {
  // ✅ If fromDate provided, start from there
  // ✅ Add pagination: fetch 1000 at a time
  
  const PAGE_SIZE = 1000
  let offset = 0
  let runningBalance = startingBalance
  
  while (true) {
    const txs = await transactionRepository.findByAccount(accountId, {
      limit: PAGE_SIZE,
      offset,
      fromDate
    })
    
    if (txs.length === 0) break
    
    const updates = txs.map(tx => {
      runningBalance = calculateNewBalance(...)
      return tx.prepareUpdate(t => { t.runningBalance = runningBalance })
    })
    
    await database.write(() => database.batch(...updates))
    offset += PAGE_SIZE
  }
}
```

---

### 7. ⚠️ Currency Conversion Loop in SafeToSpend (InsightService.ts)

**Severity**: MEDIUM  
**Location**: [insight-service.ts](src/services/insight-service.ts#L130-L145)

```typescript
const recurringConversions = await Promise.all(
  patterns
    .filter(p => p.type === 'subscription-amnesiac')
    .map(async p => {
      if (!p.amount || !p.currencyCode || p.currencyCode === resultCurrency) {
        return p.amount || 0
      }
      try {
        const { convertedAmount } = await exchangeRateService.convert(
          p.amount, 
          p.currencyCode, 
          resultCurrency
        )  // ❌ One async call per pattern
        return convertedAmount
      } catch (e) {
        return p.amount
      }
    })
)
```

**Impact**:
- If 100 patterns with different currencies: 100 async calls
- Even with Promise.all (parallel), if exchange-rate-service has rate limiting: slow
- No caching of rates
- Called every time observable emits

**Fix**: Batch currency conversions:
```typescript
const currenciesToConvert = new Set(
  patterns
    .filter(p => p.type === 'subscription-amnesiac' && p.currencyCode !== resultCurrency)
    .map(p => p.currencyCode)
)

// ✅ Load all rates once
const ratesMap = new Map()
await Promise.all(
  Array.from(currenciesToConvert).map(async currency => {
    const rate = await exchangeRateService.getRate(currency, resultCurrency)
    ratesMap.set(currency, rate)
  })
)

// ✅ Use cached rates
const recurringConversions = patterns.map(p => {
  if (p.currencyCode === resultCurrency) return p.amount || 0
  const rate = ratesMap.get(p.currencyCode) || 1
  return (p.amount || 0) * rate
})
```

---

## Medium-Severity Issues

### 8. Unbounded `observeByJournal()` - No Limit on Transactions per Journal

**Location**: [TransactionRepository.ts](src/data/repositories/TransactionRepository.ts#L144-L175)

```typescript
observeByJournal(journalId: string) {
  return this.transactions
    .query(
      Q.experimentalJoinTables(['journals']),
      Q.where('journal_id', journalId),
      Q.where('deleted_at', Q.eq(null)),
      Q.on('journals', [...])
    )
    .extend(Q.sortBy('transaction_date', 'asc'))
    .extend(Q.sortBy('created_at', 'asc'))
    .observeWithColumns([...])
    // ❌ No limit - complex journals with 1000+ lines load all
}
```

**Impact**: 
- A journal with 1000 line items loads all 1000 transactions
- Used in transaction detail views
- Every line item shown in UI

**Fix**: Add reasonable limit (last 500 lines):
```typescript
observeByJournal(journalId: string, limit: number = 500) {
  return this.transactions
    .query(...)
    .extend(Q.sortBy('transaction_date', 'asc'))
    .extend(Q.sortBy('created_at', 'asc'))
    .extend(Q.take(limit))  // ✅ Add limit
    .observeWithColumns([...])
}
```

---

### 9. Inefficient `BalanceService.aggregateBalances()` - Recursive Tree Walk

**Location**: [BalanceService.ts](src/services/BalanceService.ts#L18-L190)

```typescript
// Builds parent map
const parentIdMap = new Map<string, string>()
accounts.forEach(a => {
  if (a.parentAccountId) {
    parentIdMap.set(a.id, a.parentAccountId)
  }
})

// Calculates depth recursively for EACH account with cycle detection
const getDepth = (id: string): number => {
  const path: string[] = []
  let current = id
  
  while (current) {
    if (path.includes(current)) {  // ❌ O(n) cycle detection per call
      return 0
    }
    if (depthCache.has(current)) {
      // Backfill cache
      let depth = depthCache.get(current)!
      for (let i = path.length - 1; i >= 0; i--) {
        depthCache.set(path[i], ++depth)
      }
      return depthCache.get(id)!
    }
    path.push(current)
    current = parentIdMap.get(current) || ''
  }
  
  // Backfill
  for (let i = path.length - 1; i >= 0; i--) {
    depthCache.set(path[i], path.length - i - 1)
  }
  return depthCache.get(id)!
}

// For each account, traverse up tree to get depth
accounts.forEach(a => {
  const d = getDepth(a.id)  // ❌ O(depth) for each account
})
```

**Impact**:
- 1000 accounts with 10-level hierarchy = 1000 × 10 = 10,000 lookups
- Cycle detection is O(n) per cycle check
- Can be simplified to O(n) total

**Fix**: Single topological sort pass:
```typescript
const getDepths = (accounts: Account[]) => {
  const parentMap = new Map<string, string>()
  const childMap = new Map<string, string[]>()
  
  for (const acc of accounts) {
    if (acc.parentAccountId) {
      parentMap.set(acc.id, acc.parentAccountId)
      if (!childMap.has(acc.parentAccountId)) {
        childMap.set(acc.parentAccountId, [])
      }
      childMap.get(acc.parentAccountId)!.push(acc.id)
    }
  }
  
  // ✅ Single pass: BFS from roots to compute depths
  const depthMap = new Map<string, number>()
  const roots = accounts.filter(a => !a.parentAccountId)
  const queue = roots.map((r, i) => ({ id: r.id, depth: 0 }))
  
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    depthMap.set(id, depth)
    
    for (const childId of childMap.get(id) || []) {
      queue.push({ id: childId, depth: depth + 1 })
    }
  }
  
  return depthMap
}
```

---

### 10. No Query Caching - Expensive Queries Run Repeatedly

**Issue**: Services compute the same data multiple times per render cycle.

**Example from BalanceService**:
```typescript
async getAccountBalances(asOfDate?: number) {
  const accounts = await accountRepository.findAll()  // Every time
  
  const balancePromises = accounts.map(async (account) => {
    const latestTx = await transactionRepository.findLatestForAccount(account.id, cutoffDate)
    return { accountId: account.id, balance: latestTx?.runningBalance || 0 }
  })
  
  const balances = await Promise.all(balancePromises)
}
```

**Impact**:
- Called by InsightService, BalanceService, BalanceComponent
- Each caller loads all account balances independently
- With 1000 accounts: 3000+ transactions queried when 1000 would suffice

**Fix**: Add request-level caching:
```typescript
private balanceCache: Map<number, Promise<AccountBalance[]>> = new Map()

async getAccountBalances(asOfDate?: number) {
  const key = asOfDate || Date.now()
  
  if (!this.balanceCache.has(key)) {
    this.balanceCache.set(key, this._computeBalances(asOfDate))
    // Expire after 10 minutes
    setTimeout(() => this.balanceCache.delete(key), 10 * 60 * 1000)
  }
  
  return this.balanceCache.get(key)!
}

private async _computeBalances(asOfDate?: number) {
  // Original implementation
}
```

---

## Low-Severity Issues

### 11. Soft Deletion Query Overhead

Every query includes:
```typescript
Q.where('deleted_at', Q.eq(null))
```

With heavy soft deletion, index fragmentation could occur. Consider:
- Annual cleanup job that physically deletes old soft-deleted records
- Separate "archive" tables for very old data

---

### 12. Missing Indexes

Current indexed columns in schema:
- `account_type`, `account_subtype`, `currency_code` on accounts
- `journal_id`, `account_id`, `currency_code` on transactions
- `status` on journals

**Recommended indexes**:
- `(account_id, transaction_date)` on transactions (for date range queries)
- `(status, created_at)` on journals (for "recent journals" queries)
- `(deleted_at, created_at)` on all tables (for cleanup queries)

---

### 13. Export/Import Service Data Transformation

**Location**: [native-plugin.ts](src/services/import/plugins/native-plugin.ts#L100-L220)

```typescript
// During import, data is transformed during batch construction
const accounts = data.accounts.map(acc => ({...}))
const journals = data.journals.map(j => ({...}))
const transactions = data.transactions.map(t => ({...}))
// ... 10 maps for 10 tables
```

**Impact**: 
- If importing 10,000 transactions, 10,000 object allocations
- 10 separate map() calls creates 10 intermediate arrays

**Fix**: Stream or batch transform:
```typescript
async importData(data: any) {
  const BATCH_SIZE = 100
  
  for (let i = 0; i < data.transactions.length; i += BATCH_SIZE) {
    const batch = data.transactions.slice(i, i + BATCH_SIZE)
    const prepared = batch.map(t => this.prepareTransaction(t))
    await database.batch(...prepared)
  }
}
```

---

## Performance Optimization Recommendations Summary

| Issue | Severity | Quick Fix | Effort |
|-------|----------|-----------|--------|
| `observeActive()` unbounded | 🔴 CRITICAL | Add `Q.take(500)` | 5 min |
| N+1 reconciliation | 🔴 CRITICAL | Batch balance queries | 1 hour |
| Multiple same observations | 🟠 HIGH | Remove redundant `observeAll()` | 5 min |
| Budget tree walk unoptimized | 🟠 HIGH | Cache descendant map | 30 min |
| `observeByType()` unlimited | 🟠 HIGH | Add optional parent filter | 20 min |
| Unbounded `observeByJournal()` | 🟡 MEDIUM | Add `Q.take(500)` | 5 min |
| No query caching | 🟡 MEDIUM | Add request-level cache | 1 hour |
| Currency conversion loop | 🟡 MEDIUM | Batch rate loads | 30 min |
| Balance rebuild inefficient | 🟡 MEDIUM | Paginate & skip old | 1 hour |
| Recursive depth calculation | 🟡 MEDIUM | Single BFS pass | 30 min |
| Soft delete query overhead | 🟢 LOW | Annual cleanup job | 2 hours |
| Missing indexes | 🟢 LOW | Add schema indexes | 30 min |

---

## Testing Performance Improvements

Add these tests to verify fixes:

```typescript
describe('Performance', () => {
  it('observeActive should limit to 500 transactions', async () => {
    // Create 1000 transactions
    // observeActive should only emit 500
  })
  
  it('reconciliation should not N+1', async () => {
    // On 100 accounts, should make <5 queries, not 200
  })
  
  it('balance aggregation should complete in <100ms', async () => {
    // 1000 accounts should aggregate within time budget
  })
})
```

---

## Monitoring Recommendations

1. **Track observable emissions per render cycle**
   - Alert if >50 emissions per second
   
2. **Monitor query counts**
   - Log database query count per operation
   - Alert on N+1 patterns

3. **Track memory usage**
   - Alert if arrays of records >10MB

4. **Profile hot paths**
   - InsightService.observeSafeToSpend
   - BalanceService.getAccountBalances
   - BudgetReadService.observeBudgetUsage

---

End of Performance Audit
