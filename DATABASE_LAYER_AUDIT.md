# Database Layer Audit: Full Frills Balance

## Executive Summary

The Full Frills Balance app implements a **double-entry accounting system** with a sophisticated relational database layer built on **WatermelonDB**, a performant React Native SQLite ORM. The architecture prioritizes data consistency, transactional integrity, and real-time reactivity while supporting complex financial calculations.

---

## 1. Database Technology Stack

### Core Technology: WatermelonDB v0.28.1
- **Type**: SQLite-backed ORM optimized for React Native
- **Why**: 
  - Native SQLite performance (JSI for iOS, native SQL for Android)
  - RxJS-based reactive querying for live updates
  - Transaction support (`database.write()`, `database.batch()`)
  - Soft deletion support (via `deleted_at` field pattern)
  - Works seamlessly with Expo

### Platform-Specific Adapters

**Native (iOS/Android)**:
- `adapter.native.ts` → SQLiteAdapter with JSI optimization for iOS
- Direct SQL execution with high performance
- Handles platform-specific database lifecycle

**Web & Testing**:
- `adapter.web.ts` → LokiJSAdapter (in-memory with IndexedDB fallback)
- For development and test suites
- Uses incremental IndexedDB for web persistence

**ID Generation**:
- Native: Fast crypto-based UUID generation (58x faster than JS)
- Fallback: Web Crypto API + Math.random UUID v4 implementation

---

## 2. Database Schema (Version 9)

### Entity Relationship Overview

```
accounts
  ├── transactions (1:N)
  ├── account_metadata (1:1)
  ├── budget_scopes (1:N via budgets)
  └── planned_payments (1:N)

journals (double-entry ledger)
  ├── transactions (1:N) 
  ├── exchange_rates (1:N)
  └── planned_payments (1:N)

currencies (reference data)
  └── exchange_rates (1:N)

budgets
  └── budget_scopes (1:N)

planned_payments
  └── journals (1:N)

audit_logs (immutable log)
```

### Core Tables

#### **1. Accounts** (Chart of Accounts)
Represents all accounts in the double-entry system.

```typescript
Column              Type        Indexed  Purpose
─────────────────────────────────────────────────
id (pk)             uuid        -        Primary key
name                string      -        Account name
account_type        string      ✓        ASSET, LIABILITY, EQUITY, INCOME, EXPENSE
account_subtype     string      ✓        Specific category (CASH, CREDIT_CARD, etc.)
currency_code       string      ✓        ISO 4217 code
parent_account_id   string      ✓        For account hierarchies
description         string      -        User notes
icon                string      -        UI emoji/icon
order_num           number      ✓        Display ordering
created_at          number      ✓        Timestamp (milliseconds)
updated_at          number      -        Last modification
deleted_at          number      ✓        Soft delete flag (NULL = active)
```

**Design Rationale**:
- Supports full double-entry accounting (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE)
- Account subtypes (CASH, CREDIT_CARD, BANK_CHECKING, etc.) enable specialized features
- Hierarchical structure via `parent_account_id` (not yet fully utilized)
- `order_num` allows custom user-ordering independent of creation order

#### **2. Journals** (Transaction Batches)
Core double-entry ledger - each journal represents a balanced transaction batch.

```typescript
Column              Type        Indexed  Purpose
─────────────────────────────────────────────────
id (pk)             uuid        -        
journal_date        number      ✓        The posted date (timestamp)
description         string      -        What was this for?
currency_code       string      ✓        Primary currency
status              string      -        DRAFT, POSTED, REVERSED, PLANNED
original_journal_id string      ✓        If REVERSED, points to original
reversing_journal_id string     ✓        If original, points to reversal
planned_payment_id  string      ✓        Link to recurring payment
total_amount        number      -        DENORMALIZED: sum of debits (cache)
transaction_count   number      -        DENORMALIZED: count of lines (cache)
display_type        string      -        DENORMALIZED: INCOME, EXPENSE, TRANSFER, MIXED
created_at          number      ✓        When created
updated_at          number      -        
deleted_at          number      ✓        Soft delete
```

**Design Rationale**:
- **Double-entry**: Each journal must balance (total debits = total credits)
- **Status Flow**: DRAFT → POSTED → (optionally REVERSED)
- **PLANNED**: For recurring payments not yet executed
- **Denormalized Fields**: `total_amount`, `transaction_count`, `display_type` are caches for list performance
- **Reversal Pattern**: Instead of deletion, journals are reversed, maintaining audit trail
- **Planned Payments**: Links journal entries to recurring payment definitions

#### **3. Transactions** (Journal Lines)
Individual debit/credit lines within a journal.

```typescript
Column              Type        Indexed  Purpose
─────────────────────────────────────────────────
id (pk)             uuid        -        
journal_id          string      ✓        Parent journal (FK)
account_id          string      ✓        Account being affected
amount              number      -        Always positive (sign via DEBIT/CREDIT)
transaction_type    string      -        DEBIT or CREDIT
currency_code       string      ✓        Account's currency
transaction_date    number      ✓        Posting date (mirrors journal_date usually)
notes               string      -        Line-item notes
exchange_rate       number      -        For multi-currency transactions
running_balance     number      -        REBUILDABLE CACHE: balance after this tx
created_at          number      ✓        
updated_at          number      -        
deleted_at          number      ✓        Soft delete
```

**Design Rationale**:
- **Always Positive Amount**: Sign determined by DEBIT/CREDIT, not sign of amount
- **Running Balance**: Cached per-transaction for performance, but rebuilt whenever journal changes
- **Exchange Rate**: Supports multi-currency transactions with historical rate recording
- **Transaction Date**: Usually mirrors journal_date, allows line-level date flexibility

#### **4. Currencies**
Reference table for supported currencies.

```typescript
Column              Type        Indexed  Purpose
─────────────────────────────────────────────────
id (pk)             uuid        -        
code                string      ✓        ISO 4217 (USD, EUR, etc.)
symbol              string      -        Display symbol ($, €, etc.)
name                string      -        Full name (US Dollar)
precision           number      -        Decimal places (2 for USD)
created_at          number      ✓        
updated_at          number      -        
deleted_at          number      ✓        Soft delete
```

**Design Rationale**:
- **Precision**: Critical for rounding calculations (USD=2, JPY=0)
- Static defaults, users can't create custom currencies

#### **5. Exchange Rates**
Historical record of currency conversion rates.

```typescript
Column              Type        Indexed  Purpose
─────────────────────────────────────────────────
id (pk)             uuid        -        
from_currency       string      ✓        Source currency code
to_currency         string      ✓        Target currency code
rate                number      -        Conversion multiplier
effective_date      number      ✓        When this rate applies
source              string      -        Where rate came from (API name)
created_at          number      ✓        
updated_at          number      -        
```

**Design Rationale**:
- Immutable historical record
- Supports backdated transactions with accurate conversion rates

#### **6. Account Metadata** (Extended Attributes)
Optional credit card and loan-specific metadata.

```typescript
Column                      Type        Purpose
──────────────────────────────────────────────────
account_id                  string      FK to account
statement_day               number      Bill cycle day
due_day                     number      Payment due day
minimum_payment_amount      number      Minimum payment
minimum_balance_amount      number      Keep this balance minimum
credit_limit_amount         number      Credit limit
apr_bps                     number      APR in basis points
emi_day                     number      EMI/loan payment day
loan_tenure_months          number      Loan length
autopay_enabled             boolean     Auto-payment flag
grace_period_days           number      Grace period after due date
notes                       string      Special notes
created_at/updated_at       timestamp   Audit
```

**Design Rationale**:
- **Separate Table**: Keeps accounts lean; metadata optional
- **Loan Features**: EMI, tenure support installment loans
- **Credit Features**: APR, grace period, autopay for credit cards

#### **7. Budgets** (Period-Based)
Budget definition with spending limits.

```typescript
Column              Type        Purpose
───────────────────────────────────────
id                  uuid        
name                string      Budget name
amount              number      Budget limit
currency_code       string      Budget currency
start_month         string      YYYY-MM
active              boolean     Is this budget active?
created_at/updated_at timestamp
```

**Design Rationale**:
- **Month-Based**: Not rolling periods, calendar months
- Linked to accounts via budget_scopes junction table

#### **8. Budget Scopes** (Junction Table)
Maps which accounts are included in each budget.

**Design Rationale**:
- Junction table: budgets-to-accounts M:N relationship
- Allows one budget to span multiple accounts

#### **9. Planned Payments** (Recurring)
Definition of recurring/scheduled payments.

```typescript
Column              Type        Purpose
───────────────────────────────────────
id                  uuid        
name                string      Payment name
description         string      Details
amount              number      Amount per occurrence
currency_code       string      
from_account_id     string      Source account
to_account_id       string      Destination (optional)
interval_n          number      Repeat every N units
interval_type       string      DAILY, WEEKLY, MONTHLY, YEARLY
start_date          number      First occurrence
end_date            number      Last occurrence (optional)
next_occurrence     number      When due next
status              string      ACTIVE, PAUSED, COMPLETED
is_auto_post        boolean     Auto-post when due?
recurrence_day      number      For MONTHLY: day of month
recurrence_month    number      For YEARLY: month
created_at/updated_at/deleted_at timestamps
```

**Design Rationale**:
- Flexible recurrence: interval_n + interval_type supports "every 2 weeks", "every 3 months"
- `next_occurrence` indexed for efficient "due soon" queries
- Optional `end_date`: open-ended or fixed-term payments
- Soft-deletable: can mark as completed without losing history

#### **10. Audit Logs** (Immutable)
Immutable audit trail of data changes.

```typescript
Column              Type        Purpose
───────────────────────────────────────
id                  uuid        
entity_type         string      Table name (ACCOUNT, TRANSACTION, etc.)
entity_id           string      Record ID that changed
action              string      CREATE, UPDATE, DELETE
changes             string      JSON: {before: {}, after: {}}
timestamp           number      When changed
created_at          number      Log creation time
```

**Design Rationale**:
- **Immutable**: Never updated, only inserted
- **JSON Changes**: Tracks before/after for detailed change history
- Separate from soft-deleted entities

---

## 3. Repository Pattern

The app uses a **Repository Pattern** with strict separation between data access and business logic.

### Repository Architecture

```
Database (WatermelonDB)
    ↓
Repositories (Data Access Layer)
    ├── AccountRepository
    ├── JournalRepository
    ├── TransactionRepository
    ├── BudgetRepository
    ├── CurrencyRepository
    ├── ExchangeRateRepository
    ├── AuditRepository
    ├── PlannedPaymentRepository
    └── DatabaseRepository
    ↓
Services (Business Logic)
    ├── AccountingRebuildService
    ├── IntegrityService
    ├── OnboardingService
    └── [Feature Services]
    ↓
React Components (via Hooks)
```

### Key Design Patterns in Repositories

#### **1. Dual Method Types**

Each repository has two types of methods:

**A) Reactive Observation Methods** (`observe*`)
```typescript
// Returns RxJS Observable<T>
observeAll()                          // All non-deleted records
observeById(id)                       // Single record, updates reactively
observeWithColumns([cols])            // Partial data, optimized columns
observeStatusMeta()                   // Summary data only
```

**Why RxJS?**
- WatermelonDB uses RxJS Observables for reactive updates
- React components subscribe via hooks (higher-order observables)
- Efficient: only subscribed columns are fetched
- Automatic re-renders when data changes

**B) Pure Fetch Methods** (`find*`, `async`)
```typescript
// Returns Promise<T> or Promise<T[]>
find(id)                              // Single record (or null)
findAll()                             // All non-deleted records
findByType(type)                      // Filtered subset
```

**Why Promises?**
- Used in services for computations
- No subscription overhead
- Clear "get data once" semantics

#### **2. Write Operations Pattern**

All writes use `database.write()` blocks:

```typescript
// Example: AccountRepository.create()
async create(data: AccountPersistenceInput): Promise<Account> {
  return await this.db.write(async () => {
    const account = await this.accounts.create((record) => {
      record.name = data.name
      record.accountType = data.accountType
      // ... set all fields
      record.createdAt = new Date()
      record.updatedAt = new Date()
    })
    return account
  })
}

// Example: JournalRepository.createJournalWithTransactions()
async createJournalWithTransactions(journalData): Promise<Journal> {
  return await database.write(async () => {
    const journal = this.journals.prepareCreate(...)    // Not persisted yet
    const transactions = transactionData.map(tx => 
      this.transactions.prepareCreate(...)              // Prepared
    )
    
    await database.batch(journal, ...transactions)      // Atomic commit
    return journal
  })
}
```

**Why this pattern?**
- `database.write()` wraps a transaction
- `prepareCreate()` / `prepareUpdate()` stage changes
- `database.batch()` commits atomically
- Ensures consistency: journal + all transactions succeed together

#### **3. Soft Deletion Pattern**

Every entity has `deleted_at: number | null`:

```typescript
// Query active records only
Q.where('deleted_at', Q.eq(null))

// Soft delete (logical, not physical)
async delete(account: Account) {
  await database.write(async () => {
    await account.update((a) => {
      a.deletedAt = new Date()
      a.updatedAt = new Date()
    })
  })
}

// Physical deletion only via cleanup service
async cleanupDeletedRecords(tables: string[]): Promise<number> {
  for (const table of tables) {
    const deletedRecords = await db.collections.get(table)
      .query(Q.where('deleted_at', Q.notEq(null)))
      .fetch()
    // Only purge if synced (safe to delete)
    const purgeable = deletedRecords.filter(r => r._status === 'synced')
    await db.batch(...purgeable.map(r => r.prepareDestroyPermanently()))
  }
}
```

**Why?**
- Preserves audit trail and relationship integrity
- Allows undo/undelete if needed
- Safe for sync systems (cloud backup)
- Cleanup is explicit, not automatic

#### **4. Denormalization & Caches**

Journal table includes denormalized fields:

```typescript
// In JournalRepository.createJournalWithTransactions()
const journal = this.journals.prepareCreate((j) => {
  j.totalAmount = sumOfDebits      // Cache: sum of transaction amounts
  j.transactionCount = txs.length  // Cache: number of lines
  j.displayType = inferType()      // Cache: INCOME/EXPENSE/TRANSFER/MIXED
  // ...
})
```

**Why?**
- Journal list queries fetch 100+ items; can't compute on fly
- Caches marked as "rebuildable" in schema comments
- Never written directly by UI; only by controlled processes
- `AccountingRebuildService` can rebuild if corrupted

#### **5. Running Balance Cache**

Transaction table includes `running_balance`:

```typescript
// In JournalRepository.createJournalWithTransactions()
const calculatedBalances: Map<string, number> = new Map()
// Calculate balances before persisting
calculatedBalances.set(accountId, balanceAfterTx)

const transactions = transactionData.map(txData => {
  return this.transactions.prepareCreate((tx) => {
    // ...
    tx.runningBalance = calculatedBalances.get(txData.accountId) || 0
  })
})
```

**Pattern with AccountingRebuildService**:
- When journal is created/edited, running balances are calculated
- `AccountingRebuildService.rebuildAccountBalances()` recalculates from scratch
- Integrity service verifies cached balance vs. computed balance
- If mismatch: run rebuild to fix

---

## 4. Usage Patterns

### Pattern 1: Creating a Journal Entry (Double-Entry)

```typescript
// In a service layer (not UI)
async postExpenseJournal(accountId: string, amount: number) {
  // 1. Get accounts and validate
  const expenseAccount = await accountRepository.find(accountId)
  const bankAccount = await accountRepository.find(BANK_ACCOUNT_ID)
  
  // 2. Create journal structure
  const journalData = {
    journalDate: Date.now(),
    description: "Expense",
    currencyCode: expenseAccount.currencyCode,
    status: JournalStatus.POSTED,
    transactions: [
      { accountId: accountId, amount, transactionType: 'DEBIT' },
      { accountId: BANK_ACCOUNT_ID, amount, transactionType: 'CREDIT' }
    ]
  }
  
  // 3. Calculate running balances
  const calculatedBalances = new Map()
  let bankBalance = await getCurrentBalance(BANK_ACCOUNT_ID)
  bankBalance -= amount  // Credit reduces assets
  calculatedBalances.set(BANK_ACCOUNT_ID, bankBalance)
  
  let expenseBalance = await getCurrentBalance(accountId)
  expenseBalance += amount  // Debit increases expenses
  calculatedBalances.set(accountId, expenseBalance)
  
  // 4. Persist (atomic)
  return await journalRepository.createJournalWithTransactions({
    ...journalData,
    calculatedBalances
  })
}
```

### Pattern 2: Reactive Account Balance Display

```typescript
// In a React hook (observations are reactive)
export function useAccountBalance(accountId: string) {
  const [balance, setBalance] = useState(0)
  
  useEffect(() => {
    const subscription = accountRepository
      .observeTransactionsForBalance(accountId)
      .pipe(
        switchMap(transactions => {
          // Recalculate when transactions change
          return of(computeBalance(transactions))
        })
      )
      .subscribe(setBalance, error => console.error(error))
    
    return () => subscription.unsubscribe()
  }, [accountId])
  
  return balance
}
```

**Why Observables?**
- When you update a transaction, all accounts' balances update automatically
- No manual cache invalidation
- Subscribed UI components re-render automatically

### Pattern 3: Complex Query with Joins

```typescript
// Observe transactions for a set of accounts in a date range
observeByAccounts(accountIds: string[], limit = 50, dateRange?: {startDate, endDate}) {
  const clauses = [
    Q.experimentalJoinTables(['journals']),     // Cross-table filter
    Q.where('account_id', Q.oneOf(accountIds)), // Accounts filter
    Q.where('deleted_at', Q.eq(null)),          // Only active
    Q.on('journals', [                          // Filters on journals table
      Q.where('status', Q.oneOf([POSTED, REVERSED])),  // Only active journals
      Q.where('deleted_at', Q.eq(null))
    ])
  ]
  
  if (dateRange) {
    clauses.push(Q.where('transaction_date', Q.gte(dateRange.startDate)))
    clauses.push(Q.where('transaction_date', Q.lte(dateRange.endDate)))
  }
  
  return this.transactions
    .query(...clauses)
    .extend(Q.sortBy('transaction_date', 'desc'))
    .extend(Q.take(limit))
    .observeWithColumns([      // Only fetch needed columns
      'amount', 'currency_code', 'transaction_type',
      'transaction_date', 'notes', 'exchange_rate'
    ])
}
```

### Pattern 4: Audit Trail & Integrity Checks

```typescript
// Verify account balance is correct
async verifyAccountBalance(accountId: string) {
  const account = await accountRepository.find(accountId)
  
  // Get cached balance from latest transaction
  const latestTx = await transactionRepository.findLatestForAccount(accountId)
  const cachedBalance = latestTx?.runningBalance || 0
  
  // Compute balance from scratch
  const transactions = await transactionRepository.findForAccount(accountId)
  let computedBalance = 0
  for (const tx of transactions) {
    computedBalance = calculateNewBalance(
      computedBalance,
      tx.amount,
      account.accountType,
      tx.transactionType
    )
  }
  
  // Compare
  if (!amountsAreEqual(cachedBalance, computedBalance, precision)) {
    // Mismatch detected - rebuild running balances
    await accountingRebuildService.rebuildAccountBalances(accountId)
  }
}

// Rebuild denormalized fields if needed
async rebuildAccountBalances(accountId: string, fromDate?: number) {
  let runningBalance = 0
  const transactions = await transactionRepository.findByAccount(accountId)
  
  const updates = []
  for (const tx of transactions) {
    const newBalance = calculateNewBalance(...)
    if (newBalance !== tx.runningBalance) {
      updates.push(
        tx.prepareUpdate(t => { t.runningBalance = newBalance })
      )
    }
  }
  
  // Batch update in chunks of 500
  for (let i = 0; i < updates.length; i += 500) {
    await database.write(async () => {
      await database.batch(...updates.slice(i, i + 500))
    })
  }
}
```

### Pattern 5: Reversals (Not Deletion)

```typescript
// To reverse a journal entry
async reverseJournal(journalId: string, description: string) {
  const original = await journalRepository.find(journalId)
  const originalTransactions = await transactionRepository.findByJournal(journalId)
  
  // Create mirror journal with opposite DEBIT/CREDIT
  const reversingTxs = originalTransactions.map(tx => ({
    accountId: tx.accountId,
    amount: tx.amount,
    transactionType: tx.transactionType === 'DEBIT' ? 'CREDIT' : 'DEBIT',
    currencyCode: tx.currencyCode
  }))
  
  const reversingJournal = await journalRepository.createJournalWithTransactions({
    journalDate: Date.now(),
    description: `Reversal: ${description}`,
    currencyCode: original.currencyCode,
    originalJournalId: journalId,
    transactions: reversingTxs
  })
  
  // Link bidirectionally
  await original.update(j => {
    j.reversingJournalId = reversingJournal.id
    j.status = 'REVERSED'
  })
}
```

---

## 5. Why This Architecture?

### Problem 1: Complex Financial Calculations
**Problem**: Account balances depend on all prior transactions, account type, and transaction type.
**Solution**: 
- Store `running_balance` as cache for performance
- Verify cache correctness periodically
- Rebuild cache when detected as stale

### Problem 2: Data Consistency in Mobile
**Problem**: Network unreliable; can't serialize updates across multiple tables.
**Solution**:
- Use `database.write()` transactions
- `database.batch()` for atomic multi-table commits
- Soft deletion allows undo without cascades

### Problem 3: Real-Time UI Updates
**Problem**: User expects balance to update immediately when transaction added.
**Solution**:
- RxJS Observables for reactive data
- WatermelonDB subscription handles change detection
- Observer pattern: subscribed components auto-update

### Problem 4: Scalability
**Problem**: 10,000+ transactions will be slow to sort/filter in JS.
**Solution**:
- Denormalized summary data (total_amount, transaction_count, display_type)
- Query-level filtering (database does sorting, not JS)
- `observeWithColumns()` fetches only needed fields
- Pagination/limit queries (typically 50-100 items)

### Problem 5: Audit Trail
**Problem**: Financial app must track all changes.
**Solution**:
- `audit_logs` table: immutable record of changes
- Reversals instead of deletions: maintains double-entry balance
- Soft deletion pattern: can query "what was deleted when"

### Problem 6: Multi-Currency Support
**Problem**: Exchange rates vary; must record rate used at transaction time.
**Solution**:
- `exchange_rate` field on transaction (if multi-currency)
- `exchange_rates` table: historical rates
- Supports backdated transactions with correct rates

---

## 6. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ UI Layer (React Components)                                 │
│  - Display transactions                                     │
│  - Forms for account creation                               │
│  - Real-time balance display                                │
└─────────────────────────────────────────────────────────────┘
                            ↓ (useEffect, hooks)
┌─────────────────────────────────────────────────────────────┐
│ Service Layer                                               │
│  - OnboardingService        (setup)                         │
│  - AccountingRebuildService (integrity)                     │
│  - IntegrityService         (verification)                  │
│  - Feature Services         (business logic)                │
└─────────────────────────────────────────────────────────────┘
                            ↓ (method calls)
┌─────────────────────────────────────────────────────────────┐
│ Repository Layer                                            │
│  - Observation Methods (Observable<T>)                       │
│  - Query Methods (Promise<T>)                                │
│  - Write Methods (database.write + batch)                   │
└─────────────────────────────────────────────────────────────┘
                            ↓ (WatermelonDB API)
┌─────────────────────────────────────────────────────────────┐
│ WatermelonDB (Database Abstraction)                         │
│  - Live query subscriptions                                 │
│  - Transaction management (database.write)                  │
│  - Batch operations (database.batch)                        │
└─────────────────────────────────────────────────────────────┘
                            ↓ (Platform-specific adapter)
┌─────────────────────────────────────────────────────────────┐
│ Platform Adapters                                           │
│  - Native: SQLiteAdapter (JSI for iOS, SQL for Android)    │
│  - Web: LokiJSAdapter (IndexedDB)                           │
│  - Test: LokiJSAdapter (memory)                             │
└─────────────────────────────────────────────────────────────┘
                            ↓ (SQL/Storage)
┌─────────────────────────────────────────────────────────────┐
│ Storage                                                     │
│  - iOS: SQLite in app sandbox                              │
│  - Android: SQLite in app storage                          │
│  - Web: IndexedDB browser storage                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Key Architectural Decisions

### Decision 1: WatermelonDB Over Redux/MobX
- **Why Not Redux?** Redux doesn't scale with large datasets; you'd fetch all data into memory
- **Why Not MobX?** No native SQLite integration; requires custom persistence layer
- **Why WatermelonDB?** Query-level filtering at database, reactive updates, built for this

### Decision 2: Double-Entry Accounting Model
- **Principle**: Every transaction affects two accounts (debit/credit)
- **Benefit**: Self-balancing: total debits === total credits
- **Implementation**: Journal with N transactions (typically 2, can be more for complex entries)

### Decision 3: Soft Deletion via deleted_at Flag
- **Why not hard delete?** Loses history, breaks reversals, auditing impossible
- **Why not archive table?** Duplication; schema becomes complex
- **Pattern**: `Q.where('deleted_at', Q.eq(null))` in all queries

### Decision 4: Denormalized Caches with Explicit Rebuilds
- **Denormalized Fields**: `total_amount`, `transaction_count`, `display_type`, `running_balance`
- **Why?** List performance (can't recalculate 100 journal entries on the fly)
- **How Maintained?** Created when journal is posted; explicit rebuild service if stale
- **Verified?** IntegrityService compares cached vs computed balance

### Decision 5: RxJS Observables for Reactivity
- **Why?** Changes to one transaction affect multiple accounts; Observables propagate updates
- **When to Use?** UI components wanting live updates; not for batch operations
- **Performance?** `observeWithColumns()` specifies exact fields needed; ORM optimizes query

### Decision 6: Repositories as Data Access Guardians
- **Rule**: No direct persistence from components or services (outside repositories)
- **Benefit**: Centralized validation, consistency checks, audit logging
- **Pattern**: Service calls `journalRepository.create()`, not `journal.save()`

---

## 8. Performance Optimizations

### Optimization 1: Column Selection
```typescript
.observeWithColumns(['amount', 'currency_code', 'transaction_date'])
// Instead of fetching all 10+ transaction columns
```
**Impact**: Reduces network transfer, JSON parsing in mobile

### Optimization 2: Pagination/Limits
```typescript
.extend(Q.take(50))  // Only fetch first 50
.extend(Q.skip(offset))  // For pagination
```
**Impact**: App startup time; don't load all 5000 transactions

### Optimization 3: Index Selection
```typescript
// Indexed columns in schema:
Q.where('account_id', Q.oneOf(accountIds))  // Indexed ✓
Q.where('transaction_date', Q.gte(startDate))  // Indexed ✓
Q.sortBy('created_at', Q.asc)  // Indexed ✓
```
**Impact**: O(log n) lookup instead of O(n) table scan

### Optimization 4: Batch Writes
```typescript
await database.batch(
  journal.prepareCreate(...),
  transaction1.prepareCreate(...),
  transaction2.prepareCreate(...)
)
// Single write, not 3 separate writes
```
**Impact**: 1 transaction block, not 3; faster than sequential

### Optimization 5: Native ID Generation
```typescript
if (generator) setGenerator(generator)  // Use native crypto (58x faster)
```
**Impact**: ID generation doesn't block UI thread

---

## 9. Data Integrity Safeguards

### Safeguard 1: Balance Verification
- `IntegrityService.verifyAccountBalance()` compares cached vs computed
- Runs on app startup for crash recovery
- Lazy verification for open accounts (on demand)

### Safeguard 2: Journal Reversals Instead of Deletion
- Original journal marked `status=REVERSED`
- Reversing journal created with opposite transactions
- Both entries visible in audit trail

### Safeguard 3: Soft Deletion with Cleanup Policy
- Default: records stay soft-deleted unless cleanup runs
- Cleanup only purges records if `_status === 'synced'` (safe from cloud backup)
- `deleted_at` timestamps answer "when was this removed?"

### Safeguard 4: Transaction Atomicity
- Journal + all transactions wrote together via `database.batch()`
- If post crashes mid-write, partial entries are rolled back

### Safeguard 5: Audit Logs
- `action` (CREATE, UPDATE, DELETE)
- `changes` (JSON with before/after)
- Immutable: created once, never modified
- Timestamp indexed for range queries

---

## 10. Known Limitations & Trade-offs

### Limitation 1: No Cloud Sync Built-In
- WatermelonDB is local-only
- Syncing would require custom endpoints + conflict resolution
- Planned? See `.agent/rules/FUTURE_ROADMAP.md`

### Limitation 2: Running Balance Cache Can Become Stale
- If crash occurs during write, cache not rebuilt automatically
- IntegrityService fixes on next startup
- Trade-off: Performance for rebuild complexity

### Limitation 3: Soft Deletion Requires Discipline
- Every query must include `Q.where('deleted_at', Q.eq(null))`
- No database-level enforcement
- Mitigated by: Repository pattern (single source of queries)

### Limitation 4: Limited to 128KB JSON in Changes Field
- Audit logs store `changes` as JSON string
- Very large updates might exceed field size
- Theory: Most financial updates are small (account name, amount)

### Limitation 5: No Built-In Encryption
- SQLite data is plain text on device
- Sensitive if device stolen
- Mitigation: OS-level encryption (iOS Keychain, Android Keystore for sensitive fields)

---

## 11. Schema Migration History

### v1 → v2: Multi-Currency Support
- Added `exchange_rate` to transactions
- Created `exchange_rates` table
- Created `audit_logs` table

### v2 → v3: Journal Denormalization
- Added `total_amount`, `transaction_count` to journals

### v3 → v4: Display Type Denormalization
- Added `display_type` to journals (INCOME, EXPENSE, TRANSFER, MIXED)

### v4 → v5: Account Ordering
- Added `order_num` to accounts (user-customizable ordering)

### v5 → v6: Account Icons
- Added `icon` field to accounts (emoji/SVG reference)

### v6 → v7: Budgets
- Created `budgets` and `budget_scopes` tables

### v7 → v8: Account Subtypes & Metadata
- Added `account_subtype` to accounts (CASH, CREDIT_CARD, LOAN, etc.)
- Created `account_metadata` table (credit card details, loan terms)

### v8 → v9: Planned Payments
- Added `planned_payment_id` to journals
- Created `planned_payments` table (recurring payment definitions)

**Pattern**: Additive schema only; never destructive migrations

---

## 12. Conclusion: Why This Architecture?

This database layer is built for a **sophisticated financial app** that needs:

1. **Accounting Integrity**: Double-entry system ensures balanced books
2. **Performance**: On mobile, with reactive UI updates
3. **Flexibility**: Multi-currency, account hierarchies, complex budgets
4. **Auditability**: Full history of changes, reversals instead of deletions
5. **Resilience**: Soft deletes, integrity checks, balance verification

The **Repository Pattern** keeps data access centralized and consistent. The use of **RxJS Observables** enables reactive UIs that update in real-time. The **WatermelonDB** choice provides SQLite performance with ORM convenience.

The trade-off is **complexity**: developers must understand double-entry accounting, the Repository pattern, RxJS, and WatermelonDB semantics. But the payoff is a robust, auditable, high-performance financial system.

---

## Appendix A: Querying Examples

### Example 1: Get All Active Accounts
```typescript
const accounts = await accountRepository.findAll()
// Automatically filters: Q.where('deleted_at', Q.eq(null))
```

### Example 2: Observe Balance for Multiple Accounts
```typescript
const subscription = accountRepository
  .observeByIds(['acc-1', 'acc-2', 'acc-3'])
  .subscribe(accounts => {
    console.log(accounts)  // Updates when any account changes
  })
```

### Example 3: Find Transactions for Account This Month
```typescript
const thisMonth = dayjs().startOf('month').valueOf()
const endMonth = dayjs().endOf('month').valueOf()

const txs = await transactionRepository.findByAccount(
  accountId,
  50,  // limit
  { startDate: thisMonth, endDate: endMonth }
)
```

### Example 4: Create Transfer Journal (Debit Savings, Credit Checking)
```typescript
const journal = await journalRepository.createJournalWithTransactions({
  journalDate: Date.now(),
  description: "Transfer to savings",
  currencyCode: 'USD',
  status: JournalStatus.POSTED,
  transactions: [
    { accountId: savingsId, amount: 1000, transactionType: 'DEBIT' },
    { accountId: checkingId, amount: 1000, transactionType: 'CREDIT' }
  ],
  calculatedBalances: new Map([
    [savingsId, 11000],      // Was 10000, +1000
    [checkingId, 4000]       // Was 5000, -1000
  ])
})
```

---

End of Audit
