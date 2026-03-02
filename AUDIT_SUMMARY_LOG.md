# Pre-Production Launch Audit — full-frills-balance

> **Auditor**: Senior Staff Engineer (AI-assisted)
> **Target Scale**: 100k+ concurrent users, 5,000–20,000 req/s
> **Started**: 2026-03-02
> **Status**: Phase 1–3 Complete; Phase 4 (Coverage Verification) + Phase 5 (Final Report) pending

---

## HOW TO READ

| Badge | Meaning |
|-------|---------|
| 🔴 **CRITICAL** | Data corruption / cascade failure possible; block ship |
| 🟠 **HIGH** | Material bug or performance cliff; fix before launch |
| 🟡 **MEDIUM** | Degrades UX or reliability at scale; fix within sprint |
| 🟢 **LOW** | Clean-up / hardening; fix post-launch |

Each finding includes: **Location**, **Risk**, **Evidence**, **Suggested Fix**.

---

## PHASE 1 — CODEBASE INVENTORY

**Files reviewed**: `package.json`, `ARCHITECTURE.md`, `src/data/database/schema.ts`, `src/data/database/migrations.ts`, all `src/services/`, all `src/data/repositories/`, `src/data/models/` (outline), `app/` routing tree

### Stack Summary

| Layer | Technology |
|-------|-----------|
| Framework | Expo 54 / React Native 0.81.5 |
| Routing | expo-router (file-based) |
| Database | WatermelonDB 0.28.1 (SQLite on-device) |
| Reactivity | RxJS 7.x — `shareReplay`, `combineLatest`, `switchMap` |
| Compiler | React Compiler (experimental) enabled |
| Currency | `@openexchangerates/money` + custom wealth-service |

### Schema (version 12, 12 migration steps)

Tables: `accounts`, `transactions`, `journals`, `journal_metadata`, `currencies`, `budgets`, `commitments`, `audit_logs`, `sms_import_rules`, `planned_payments`, `snapshots`, `account_balance_snapshots`.

All tables use soft-delete via `deleted_at`. Running balances are **stored denormalized** on transactions (`running_balance` column) and rebuilt asynchronously by `AccountingRebuildService`.

### Top-Level Feature Modules (13)

`accounts`, `audit`, `budget`, `commitments`, `dashboard`, `ledger`, `import`, `insights`, `planned-payments`, `report`, `sms`, `settings`, `wealth`

### Key Services Inventory

| Service | Purpose |
|---------|---------|
| `ReactiveDataService` | Dashboard RxJS observable hub |
| `BalanceService` | Hierarchical balance aggregation |
| `AccountingRebuildService` | Segment-by-segment running-balance rebuild |
| `RebuildQueueService` | Debounced rebuild queue |
| `IntegrityService` | Startup integrity cross-check (SQL vs snapshot) |
| `InsightService` | 9-stream `combineLatest` safe-to-spend / patterns |
| `PlannedPaymentService` | Recurring journal generation / posting |
| `LedgerWriteService` | Journal + transaction creation orchestration |
| `LedgerReadService` | Reactive enriched-transaction pipeline |
| `SmsService` | SMS parsing, ReDoS guards, auto-post rules |
| `WealthService` | Net-worth calculation |
| `ReportService` | Income/expense aggregation |
| `import/orchestrator` | ZIP/UTF-16 decode, file read |

### Unresolved Questions — Phase 1

1. Are `sms_import_rules` cached in memory between `RebuildQueueService` runs, or re-fetched each SMS?
2. Does `IntegrityService.checkIntegrityOnStartup` block app render, or is it fire-and-forget?
3. Is there a rollback path if `AccountingRebuildService` fails partway through a segment?

### Next Areas (Carried to Phase 2–3)

- Deep read of `ReactiveDataService`, `RebuildQueueService`, `AccountingRebuildService`, transports layer
- Index coverage audit on `schema.ts`
- Memory / subscription lifecycle audit

---

## PHASE 2 — FEATURE MAP

**Files reviewed**: All feature directories (hooks, screens), `src/hooks/`, `src/utils/`, `src/constants/`

### Data-Flow Map (Critical Paths)

```
User Action → LedgerWriteService.createJournal
    → prepareJournalData (balance calc)
    → JournalRepository.createJournalWithTransactions (single DB write)
    → RebuildQueueService.enqueueMany
        → debounce(300ms)
        → AccountingRebuildService.rebuildSegment (batch, 500 tx chunks)
            → TransactionRawRepository.getRebuildDataRaw (raw SQL)
            → batch DB update of running_balance
```

```
App Start → PlannedPaymentService.processDuePayments
    → prefetch all planned-payment journals (1 query)
    → in-memory duplicate check (Map<id, Set<dayStart>>)
    → generatePlannedJournal (if not exists)
    → calculateNextOccurrence (loop, MAX_GENERATIONS = 365)
```

```
Dashboard → ReactiveDataService.observeDashboardData(currency)
    → combineLatest([accounts, transactions, currencies, journals])
    → debounce(Animation.dataRefreshDebounce)
    → switchMap → balanceService + wealthService (async)
    → shareReplay({ bufferSize: 1, refCount: true })
```

### Identified Risk Areas

1. **Observable lifecycle** — `refCount: true` on `shareReplay` means the stream tears down when subscriber count hits zero; next subscriber re-bootstraps the entire `combineLatest` chain including a new `balanceService` call.
2. **Duplicate combineLatest streams** — `observeMonthlyFlow` creates its own independent `combineLatest([accounts, transactions])` chain instead of deriving from `observeDashboardData`. Two identical WatermelonDB observers run in parallel.
3. **SMS-rules cache** — `SmsService` re-fetches rules on every message; no in-memory cache invalidation strategy.
4. **Snapshot staleness** — `IntegrityService` compares live SQL balance to the latest snapshot. If a rebuild is in-flight when startup runs, the snapshot may be stale and trigger spurious integrity alerts.
5. **No global error boundary on RxJS errors** — an unhandled error in any `switchMap` async block propagates up to the subscriber; if RN's error boundary doesn't catch it the observable dies silently.

---

## PHASE 3 — FULL FEATURE AUDIT

**Files reviewed**: `ReactiveDataService.ts`, `RebuildQueueService.ts`, `AccountingRebuildService.ts`, `IntegrityService.ts`, `InsightService.ts`, `PlannedPaymentService.ts`, `SmsService.ts`, `BalanceService.ts`, `LedgerWriteService.ts`, `LedgerReadService.ts`, `JournalRepository.ts` (474 lines), `TransactionRawRepository.ts` (555 lines), `AccountRepository.ts` (424 lines), `import/orchestrator.ts`

---

### F-01 🔴 CRITICAL — Unbounded `_dashboardCache` Map (Memory Leak)

**Location**: `src/services/ReactiveDataService.ts:48,98`

**Risk**: Each unique `targetCurrency` string creates a new entry in `_dashboardCache`. The comment says "old entries are GC'd when the Map grows stale" — **this is incorrect**. `Map` entries in JS are strong references; the observable holds a `shareReplay(1)` buffer containing account + transaction arrays. If users switch currencies, old entries accumulate forever.

**Evidence**:
```ts
private _dashboardCache = new Map<string, Observable<DashboardData>>();
// ...
this._dashboardCache.set(targetCurrency, obs$);  // Never evicted
```

**Impact**: At 100k users with multi-currency use, the JS heap grows unboundedly per process life. On mobile this causes GC pressure and eventual OOM crashes.

**Suggested Fix**:
```ts
// Use a small bounded LRU (max 3 currencies) or evict on currency change
private evictStaleCacheEntries(keepCurrency: string) {
    for (const [key] of this._dashboardCache) {
        if (key !== keepCurrency) this._dashboardCache.delete(key);
    }
}
```
Call `evictStaleCacheEntries(targetCurrency)` before setting a new entry. Most users use 1–2 currencies; a max of 3 cached entries is sufficient.

---

### F-02 🔴 CRITICAL — `refCount: true` Causes Observable Teardown / Cold-Restart

**Location**: `src/services/ReactiveDataService.ts:95`

**Risk**: `shareReplay({ bufferSize: 1, refCount: true })` means the underlying observable is **unsubscribed and destroyed** when the last consumer unmounts, and **re-subscribed cold** when the next consumer mounts. On tab switches or navigation, this triggers:
1. Teardown of all 4 WatermelonDB observers
2. `balanceService.getAccountBalances` + `wealthService.calculateSummary` re-run synchronously on mount
3. A blank/loading flash while the new emission propagates

**Evidence**: Same pattern repeated on `observeAccountsSummary` (line 114) and `observeMonthlyFlow` (line 152).

**Suggested Fix**: Change to `refCount: false` (permanent hot stream) for singleton service-level observables, or use `BehaviorSubject` seeded with last known value:
```ts
shareReplay({ bufferSize: 1, refCount: false })
```
Disposal is managed at app-level (service teardown on logout), not per-subscriber.

---

### F-03 🔴 CRITICAL — `observeMonthlyFlow` Duplicates WatermelonDB Subscriptions

**Location**: `src/services/ReactiveDataService.ts:122-153`

**Risk**: `observeMonthlyFlow` creates a second independent `combineLatest([accountRepository.observeAll(), transactionRepository.observeActiveWithColumns(...)])` chain. When a screen mounts that calls both `observeDashboardData` and `observeMonthlyFlow`, **two separate DB observer chains** fire for every transaction write. At high transaction volume (bulk import, SMS auto-post), this doubles the JS bridge serialization cost.

**Suggested Fix**: Derive `observeMonthlyFlow` from `observeDashboardData` to share the same upstream:
```ts
observeMonthlyFlow(targetCurrency: string): Observable<MonthlyFlowData> {
    return this.observeDashboardData(targetCurrency).pipe(
        switchMap(async ({ accounts, transactions }) => {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
            return reportService.getIncomeVsExpenseFromTransactions(
                transactions, accounts, startOfMonth, endOfMonth, targetCurrency
            );
        }),
        shareReplay({ bufferSize: 1, refCount: false })
    );
}
```

---

### F-04 🟠 HIGH — Correlated Subqueries in `getAccountListItemsRaw` (N+1 in SQL)

**Location**: `src/data/repositories/AccountRepository.ts:345-419`

**Risk**: The raw SQL for the accounts list screen embeds **three correlated subqueries per account row** (direct_balance, direct_transaction_count, monthly_income, monthly_expenses). SQLite evaluates each subquery once per account row — for a user with 50 accounts this is 150 subquery executions per `getAccountListItemsRaw` call. This is triggered reactively on every DB change.

**Evidence** (abbreviated):
```sql
SELECT a.id, ...,
  (SELECT t.running_balance FROM transactions t ... WHERE t.account_id = a.id ...) as direct_balance,
  (SELECT COUNT(*) FROM transactions t ... WHERE t.account_id = a.id ...) as direct_tx_count,
  (SELECT SUM(...) ... WHERE t.account_id = a.id AND ...) as monthly_income,
  (SELECT SUM(...) ... WHERE t.account_id = a.id AND ...) as monthly_expenses
FROM accounts a
```

**Suggested Fix**: Rewrite as LEFT JOINs with aggregation — a single table scan instead of N correlated subquery scans:
```sql
SELECT a.id, a.name, ...,
    MAX(CASE WHEN t_all.account_id = a.id THEN t_all.running_balance END) as direct_balance,
    COUNT(t_all.id) as direct_transaction_count,
    SUM(CASE WHEN t_month.transaction_date >= ? AND ... THEN ... END) as monthly_income
FROM accounts a
LEFT JOIN transactions t_all ON t_all.account_id = a.id AND t_all.deleted_at IS NULL
LEFT JOIN journals j_all ON j_all.id = t_all.journal_id AND j_all.deleted_at IS NULL ...
GROUP BY a.id
```
This reduces SQLite work from O(N×3) to O(1) pass.

---

### F-05 🟠 HIGH — Correlated NOT EXISTS Subquery in `getLatestBalancesRaw`

**Location**: `src/data/repositories/TransactionRawRepository.ts:94-118`

**Risk**: `getLatestBalancesRaw` uses a `NOT EXISTS (SELECT 1 FROM transactions t_next ...)` correlated subquery to find the latest transaction per account. For each candidate transaction row, SQLite re-scans the transactions table to confirm no newer row exists. With many transactions this degrades to O(T²) per account batch call.

**Suggested Fix**: Use `ROW_NUMBER()` (SQLite 3.25+) or a `MAX` + self-join pattern:
```sql
SELECT t.account_id, t.running_balance
FROM transactions t
JOIN journals j ON t.journal_id = j.id
WHERE t.account_id IN (...)
  AND t.transaction_date <= ?
  AND t.deleted_at IS NULL
  AND j.status IN (...)
  AND t.rowid IN (
    SELECT rowid FROM transactions t2
    WHERE t2.account_id = t.account_id
    ORDER BY t2.transaction_date DESC, t2.created_at DESC, t2.id DESC
    LIMIT 1
  )
```
Alternatively pre-materialize a `latest_running_balance` column on accounts that gets updated on each rebuild (already partially done via `running_balance` on transactions — just need per-account final value cached).

---

### F-06 🟠 HIGH — UNION ALL Growth is O(N) SQL Params

**Location**: `src/data/repositories/TransactionRawRepository.ts:514-524`

**Risk**: `getAccountTransactionCountsRaw` builds a UNION ALL query dynamically with one sub-SELECT per account:
```ts
const queries = accountIdsWithStartDates.map(() => `SELECT ? AS account_id, COUNT(*) ...`).join(' UNION ALL ')
```
For 50 accounts this produces 50 individual COUNT sub-selects. SQLite query compilation is O(N) in query length; at the extreme (hundreds of accounts with sub-accounts), the query compilation overhead becomes significant.

**Suggested Fix**: Replace with a single GROUP BY query with per-account date filtering via a CASE expression, or filter to just `endDate` cutoff (acceptable approximation for integrity checks):
```sql
SELECT t.account_id, COUNT(*) as tx_count
FROM transactions t JOIN journals j ON t.journal_id = j.id
WHERE t.account_id IN (?) AND t.deleted_at IS NULL AND ...
GROUP BY t.account_id
```
Accept the slight imprecision of not per-account `startDate`, or pass the minimum `startDate` globally.

---

### F-07 🟠 HIGH — `RebuildQueueService` Linear Backoff (No Exponential Backoff)

**Location**: `src/services/RebuildQueueService.ts`

**Risk**: Rebuild retries use a linear delay strategy. On cascading failure (e.g., multiple writes in rapid succession triggering repeated rebuild errors), the retry storms can pin the JS thread. No jitter means all queued rebuilds retry at the same time, creating thundering-herd on the SQLite write path.

**Suggested Fix**: Implement exponential backoff with jitter:
```ts
const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
const jitter = Math.random() * delay * 0.2;
await sleep(delay + jitter);
```

---

### F-08 🟠 HIGH — `InsightService.observePatterns` Stale `ninetyDaysAgo` Capture

**Location**: `src/services/insight-service.ts` (observePatterns / recurring pattern stream)

**Risk**: The `ninetyDaysAgo` timestamp is computed once at construction/subscription time and captured in the observable closure. If the user keeps the app open for days (common on mobile), the window drifts. Recurring patterns will miss genuinely new patterns that entered the 90-day window.

**Evidence** (paraphrased from prior read):
```ts
const ninetyDaysAgo = Date.now() - (90 * 86_400_000);  // fixed at subscription time
return rawRepo.getRecurringPatternsRaw(ninetyDaysAgo, minCount);
```

**Suggested Fix**: Compute the date dynamically inside the `switchMap`/pipe:
```ts
switchMap(() => {
    const ninetyDaysAgo = Date.now() - (90 * 86_400_000);
    return from(rawRepo.getRecurringPatternsRaw(ninetyDaysAgo, minCount));
})
```

---

### F-09 🟡 MEDIUM — `PlannedPaymentService.processDuePayments` Not Idempotent Across Process Restarts

**Location**: `src/services/PlannedPaymentService.ts:259-321`

**Risk**: The duplicate-check map (`journalledDays`) is built from a single pre-fetch at startup. It correctly prevents double-generation within a single call. However, there is **no database-level uniqueness constraint** on `(planned_payment_id, journal_date, status)`. If `processDuePayments` is called concurrently (e.g., a background task fires while an app restart is in progress), two calls could race to generate the same journal with neither seeing the other's in-memory map.

**Evidence**: No `UNIQUE` index on `journals` for `(planned_payment_id, journal_date)` observed in `schema.ts`.

**Suggested Fix**: Add a `UNIQUE` constraint (or composite unique index) on `journals(planned_payment_id, journal_date, status)` and handle the `SQLITE_CONSTRAINT_UNIQUE` error gracefully, treating it as an idempotent no-op.

---

### F-10 🟡 MEDIUM — `LedgerReadService` `getAccountTreeIds` Uses `queue.shift()` (O(N²) BFS)

**Location**: `src/services/ledger/ledgerReadService.ts:87-108`

**Risk**: The BFS implementation uses `queue.shift()` which is O(N) for each dequeue operation (array re-indexing). For deep account trees (e.g., 5-level hierarchy × 20 accounts per level = 100 nodes), this is 100 × 50 = 5,000 array shifts on each reactive emission.

**Evidence**:
```ts
const queue: string[] = [rootAccountId];
while (queue.length > 0) {
    const current = queue.shift();  // O(N) each time
```

**Suggested Fix**: Use a typed queue (index pointer) or `splice(0,1)`:
```ts
let head = 0;
while (head < queue.length) {
    const current = queue[head++];  // O(1)
```
`AccountRepository.getDescendantIdsFromList` already uses the index-pointer pattern correctly — port that pattern here.

---

### F-11 🟡 MEDIUM — Legacy Recursive `getDescendantIds` Still Reachable

**Location**: `src/data/repositories/AccountRepository.ts:239-251`

**Risk**: `getDescendantIds` without `allAccounts` falls back to the O(depth×N) recursive DB fetch path. This path is documented as "legacy" but is not deprecated or removed. Any caller that fails to pass `allAccounts` silently takes the slow N+1 path.

**Evidence**:
```ts
// Legacy path: fetch each level from the DB (retained for backward compat).
const children = await this.accounts.query(Q.where('parent_account_id', accountId)...).fetch()
for (const child of children) {
    const descendantIds = await this.getDescendantIds(child.id)  // recursive N+1
```

**Suggested Fix**: Make `allAccounts` required, or add `@deprecated` JSDoc and a `logger.warn` on the legacy path so it's surfaced during QA. Audit all callers to ensure the fast path is used.

---

### F-12 🟡 MEDIUM — `JournalRepository.updateJournalWithTransactions` Always Soft-Deletes + Recreates Transactions

**Location**: `src/data/repositories/JournalRepository.ts:254-313`

**Risk**: Every journal edit soft-deletes all existing transactions and creates new ones. For a journal with 2 transactions this is acceptable. For bulk imports that get edited, or planned payments that get modified, this generates tombstone rows that bloat the `transactions` table over time. Soft-deleted rows are never hard-deleted / pruned.

**Evidence**:
```ts
const deleteUpdates = oldTransactions.map(tx => tx.prepareUpdate((t) => {
    t.deletedAt = now;
```

**Suggested Fix**: 
1. Add a scheduled cleanup / vacuum job that hard-deletes rows where `deleted_at < (now - 90 days)`.
2. For simple value-only edits (amount, notes) without account/type changes, update transactions in-place instead of recreate.

---

### F-13 🟡 MEDIUM — `reversal.runningBalance = 0` on Reversal Transactions

**Location**: `src/data/repositories/JournalRepository.ts:420`

**Risk**: When `replaceJournalWithReversal` creates reversal transactions, `runningBalance` is hardcoded to `0`. Reversal transactions are immediately enqueued for rebuild, so the `0` is eventually corrected, but during the rebuild window the balance shown in the UI is transiently wrong (0 instead of correct value).

**Evidence**:
```ts
t.runningBalance = 0  // line 420, reversal transactions
```

**Suggested Fix**: Either compute running_balance at write time using `prepareJournalData` (consistent with normal create path), or clearly document the transient state and ensure UI shows a loading indicator during rebuild.

---

### F-14 🟡 MEDIUM — SMS Regex Rules Compiled Per-Match, Not Cached

**Location**: `src/services/sms-service.ts`

**Risk**: If SMS auto-post rules store patterns as strings and compile them to `RegExp` on every SMS message, frequent SMS processing (background inbox scan) recompiles potentially many regexes on every message. RegExp compilation is CPU-intensive.

**Suggested Fix**: Cache compiled regexes keyed by rule ID + pattern string. Invalidate only when rules change. The existing ReDoS guard indicates awareness of the regex risk; add compilation caching alongside it.

---

### F-15 🟢 LOW — `ImportOrchestrator.decodeContent` Falls Back Silently on Any UTF-8 Parse Error

**Location**: `src/services/import/orchestrator.ts:122-143`

**Risk**: `decodeContent` catches *any* error from the UTF-8 decode attempt and silently falls through to UTF-16BE. A malformed file that starts with `{` but has invalid UTF-8 in the middle would decode as garbage without a clear user-facing error. The `fatal: true` flag only catches decode errors, but the `trim().startsWith('{')` check is the actual gating condition — a valid UTF-8 file that starts with whitespace or a BOM fails this check and is retried as UTF-16BE unnecessarily.

**Suggested Fix**: Separate the `fatal: true` decode failure from the "not JSON" heuristic. Only fall back to UTF-16BE on `TypeError` from `TextDecoder`, not on all errors:
```ts
try {
    const content = utf8Decoder.decode(bytes); // throws TypeError on invalid UTF-8
    return content; // don't gate on content shape here; let the plugin validate JSON
} catch (e) {
    if (!(e instanceof TypeError)) throw e; // only fall back on encoding error
    return decodeUTF16Bytes(bytes);
}
```

---

### F-16 🟢 LOW — `AuditService.log` Called After Journal Write (Separate DB Write)

**Location**: `src/services/ledger/ledgerWriteService.ts:21-26`

**Risk**: `auditService.log(...)` is called after `journalRepository.createJournalWithTransactions` completes. If `auditService.log` throws (e.g., DB write failure), the journal exists but has no audit record. The two writes are not in the same `database.write` transaction.

**Suggested Fix**: Include the audit log `prepareCreate` inside the same `database.batch(...)` call in `JournalRepository.createJournalWithTransactions`, or wrap both calls in a single `database.write`.

---

### F-17 🟢 LOW — No Index on `transactions.planned_payment_id` (via journals)

**Location**: `src/data/database/schema.ts`

**Risk**: `PlannedPaymentService.postOccurrence` queries journals with `Q.where('planned_payment_id', pp.id)`. If `planned_payment_id` is not indexed on the `journals` table, this is a full-table scan of all journals. For users with many planned payments and years of history, this scan happens on every `postOccurrence` and `skipOccurrence` call.

**Suggested Fix**: Add `{ name: 'planned_payment_id', isIndexed: true }` to the `journals` table schema and add a corresponding migration step.

---

### F-18 🟢 LOW — `getAccountSumRaw` Uses 3 Repeated Subqueries for `limitTransactionId`

**Location**: `src/data/repositories/TransactionRawRepository.ts:171-177`

**Risk**: When `limitTransactionId` is provided, the same `(SELECT transaction_date FROM transactions WHERE id = ?)` subquery appears three times with the same argument. SQLite may or may not deduplicate this; explicitly pre-fetching the value and injecting it as a literal is cleaner and guarantees no repeated table access.

**Suggested Fix**: Pre-fetch `limitTransactionId` row in JS before building the SQL string, or use a CTE:
```sql
WITH anchor AS (SELECT transaction_date, created_at FROM transactions WHERE id = ?)
SELECT SUM(...) FROM transactions t ... AND (t.transaction_date < (SELECT transaction_date FROM anchor) ...)
```

---

## KEY INDEXES MISSING (Consolidated)

Verify these indexes exist in `schema.ts`. Add if absent:

| Table | Column(s) | Reason |
|-------|-----------|--------|
| `journals` | `planned_payment_id` | F-17: `postOccurrence` / `skipOccurrence` full-table scan |
| `journals` | `(journal_date, status, deleted_at)` | F-01 zone: `observePlannedForMonth` composite |
| `transactions` | `(account_id, transaction_date, deleted_at)` | Critical for rebuild and ledger read |
| `transactions` | `(journal_id, deleted_at)` | `deleteJournal` and `updateJournalWithTransactions` |
| `sms_import_rules` | `is_active` | Rule fetch on every SMS |

---

## UNRESOLVED QUESTIONS — Phase 3

1. **RebuildQueueService.ts**: What is the current retry backoff implementation in full? Only outline was read; need exact delay formula.
2. **IntegrityService**: Does `checkIntegrityOnStartup` run before or after `processDuePayments`? If after, the snapshot is correct; if before, there's a window of inconsistency.
3. **SmsService**: Confirm whether compiled regex objects are cached or freshly compiled per-SMS.
4. **schema.ts**: Confirm exhaustive index list — particularly whether `transactions(account_id, transaction_date)` composite exists or only the individual indexes.
5. **Vacuum policy**: Is there any SQLite `VACUUM` or `PRAGMA auto_vacuum` set? Soft-deleted row accumulation on active users could lead to multi-MB bloat.

---

## NEXT AREAS TO AUDIT — Phase 4

- [ ] `src/data/database/schema.ts` — full index audit column by column
- [ ] `src/services/RebuildQueueService.ts` — full body (retry logic, queue bounds, concurrency)
- [ ] `src/features/sms/` — regex caching, rule fetch pattern
- [ ] `src/features/budget/` and `src/features/commitments/` — reactive chains
- [ ] `e2e/` — test coverage vs. critical paths
- [ ] `src/utils/errors.ts` — error taxonomy and propagation
- [ ] Audit all `database.write` calls for scope and atomicity
- [ ] Verify React Compiler compat with RxJS hooks (`useObservable`, `withObservables`)

---

*End of Phase 1–3. Phase 4 findings below.*

---

## PHASE 4 — INDEX AUDIT + REBUILD QUEUE DEEP READ

**Files reviewed**: `src/data/database/schema.ts` (full, 197 lines), `src/services/RebuildQueueService.ts` (full, 207 lines)

---

### SCHEMA INDEX AUDIT — RESULTS

#### `journals` table (critical read path)

| Column | isIndexed? | Assessment |
|--------|-----------|------------|
| `journal_date` | ✅ | Good |
| `currency_code` | ✅ | Good |
| `status` | ❌ **MISSING** | **🟠 HIGH** — every reactive query filters by status (POSTED, PLANNED, REVERSED); full-table scan on status filter |
| `planned_payment_id` | ✅ | F-17 resolved — index exists |
| `deleted_at` | ✅ | Good |
| `created_at` | ✅ | Good |

#### `transactions` table (highest-volume table)

| Column | isIndexed? | Assessment |
|--------|-----------|------------|
| `journal_id` | ✅ | Good |
| `account_id` | ✅ | Good |
| `transaction_date` | ✅ | Good |
| `currency_code` | ✅ | Good |
| `deleted_at` | ✅ | Good |
| `created_at` | ✅ | Good |
| `(account_id, transaction_date)` composite | ❌ **MISSING** | 🟠 HIGH — rebuild, balance, and ledger queries all filter by both; without composite, SQLite picks one index and scans the rest |
| `running_balance` | explicitly `isIndexed: false` | Intentional — rebuild writes are append-only |

#### `sms_auto_post_rules` table

| Column | isIndexed? | Assessment |
|--------|-----------|------------|
| `sender_match` | ✅ | Good |
| `source_account_id` | ✅ | Good |
| `category_account_id` | ✅ | Good |
| `is_active` | ❌ **MISSING** | 🟡 MEDIUM — rule fetch queries will filter by `is_active = true`; without index this requires scanning all rules |

#### `accounts` table — OK

All critical columns indexed: `account_type`, `parent_account_id`, `deleted_at`, `order_num`, `currency_code`.

#### `audit_logs` table

| Column | isIndexed? | Assessment |
|--------|-----------|------------|
| `entity_type` | ✅ | Good |
| `entity_id` | ✅ | Good |
| `timestamp` | ✅ | Good |
| `(entity_type, entity_id)` composite | ❌ | 🟢 LOW — audit log lookup by entity; composite would be faster than separate index merge |

---

### I-01 🟠 HIGH — `journals.status` Not Indexed

**Impact**: Every reactive WatermelonDB `observeWithColumns` call on journals includes a `Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES]))` filter. Without an index on `status`, SQLite performs a full-table scan of the journals table on every reactive emission.

For a user with 10k+ journals (2 years of daily entries), this is a 10k-row scan firing on every transaction write.

**Fix**:
```ts
// schema.ts journals table:
{ name: 'status', type: 'string', isIndexed: true },
```
Add a migration step in `migrations.ts`:
```ts
addColumns({ table: 'journals', toAddColumns: [{ name: 'status', type: 'string', isIndexed: true }] })
```
Note: WatermelonDB `addColumns` with `isIndexed: true` creates the SQLite index automatically.

---

### I-02 🟠 HIGH — Missing Composite Index `transactions(account_id, transaction_date)`

**Impact**: The two most critical raw SQL queries — `getRebuildDataRaw` and `getLatestBalancesRaw` — filter by `account_id IN (...)` AND `transaction_date <= ?`. SQLite can only use one B-tree index per table access. It will pick either `account_id` or `transaction_date` and scan the other dimension linearly.

WatermelonDB does not natively support composite indexes in schema definitions (as of v0.28). The workaround is a manual migration:

**Fix** (in `migrations.ts`):
```ts
await database.adapter.unsafeExecuteSql(
    'CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions (account_id, transaction_date)'
);
```
This is safe — purely an index addition, no data mutation.

---

### I-03 🟡 MEDIUM — `sms_auto_post_rules.is_active` Not Indexed

**Impact**: SMS rule fetch queries filter by `is_active = true`. As rules accumulate, this becomes a full-scan. For users with many (deleted/disabled) rules, query time grows linearly.

**Fix**:
```ts
{ name: 'is_active', type: 'boolean', isIndexed: true },
```

---

### REBUILD QUEUE — DEEP READ FINDINGS

#### RQ-01 🟠 HIGH — 50 Concurrent DB Writes per Batch (`Promise.allSettled`)

**Location**: `src/services/RebuildQueueService.ts:149-151`

**Risk**: All accounts in a batch (up to `maxBatchSize: 50`) are rebuilt **concurrently** via `Promise.allSettled`. `accountingRebuildService.rebuildAccountBalances` internally calls `database.write(...)` for each account's running-balance updates. WatermelonDB serializes `database.write` calls internally, so 50 concurrent `write()` calls queue up and execute sequentially — but they all hold pending promises while waiting, creating 50 simultaneous Promise chains on the JS thread.

For a large bulk import (import of 1,000 transactions across 20 accounts), this means 20 rebuild promises all racing to enter the write queue simultaneously, causing the JS thread event loop to be saturated for the entire duration.

**Suggested Fix**: Process the batch with controlled concurrency (e.g., `p-limit` or a manual semaphore of 3–5):
```ts
const CONCURRENCY = 5;
const semaphore = new Array(CONCURRENCY).fill(Promise.resolve());
const results = await Promise.allSettled(
    batch.map(({ id, fromDate }, i) =>
        (semaphore[i % CONCURRENCY] = semaphore[i % CONCURRENCY].then(() =>
            accountingRebuildService.rebuildAccountBalances(id, fromDate)
        ))
    )
);
```

#### RQ-02 🟡 MEDIUM — Linear Backoff Confirmed (as noted in F-07)

**Confirmed**: `retryDelayMs * retryCount` = 2000ms, 4000ms, 6000ms for attempts 1–3.

No jitter. If 50 accounts fail simultaneously (e.g., transient DB lock), all 50 schedule retry at exactly the same time, creating a retry thundering-herd.

**Fix** (as per F-07 above): Add jitter:
```ts
const delay = this.config.retryDelayMs * retryCount + Math.random() * 500;
```

#### RQ-03 🟢 LOW — `retryCounts` Map Never Pruned on Success Path for Non-Batch Items

**Location**: `src/services/RebuildQueueService.ts:178-182`

Only successfully-processed items in the **current batch** have their retry counts cleared. Items that were dequeued by a previous flush (via `stop()`) and re-enqueued via retry are not cleaned up until their next success. For long-running sessions with repeated failures, `retryCounts` Map can accumulate stale entries.

**Fix**: Call `this.retryCounts.clear()` in `stop()` (already done ✅) and additionally prune entries where `retryCount >= retryLimit` after logging the give-up:
```ts
this.retryCounts.delete(item.id);  // after giving up
```

---

## FINDINGS SUMMARY — ALL PHASES

### 🔴 CRITICAL (Block Ship)

| ID | Location | Summary |
|----|----------|---------|
| F-01 | `ReactiveDataService.ts:48` | Unbounded `_dashboardCache` Map — memory leak |
| F-02 | `ReactiveDataService.ts:95` | `refCount: true` tears down / cold-restarts shared observable |
| F-03 | `ReactiveDataService.ts:122` | `observeMonthlyFlow` duplicates WatermelonDB subscriptions |

### 🟠 HIGH (Fix Before Launch)

| ID | Location | Summary |
|----|----------|---------|
| F-04 | `AccountRepository.ts:345` | N+1 correlated subqueries in `getAccountListItemsRaw` |
| F-05 | `TransactionRawRepository.ts:94` | NOT EXISTS correlated subquery in `getLatestBalancesRaw` |
| F-06 | `TransactionRawRepository.ts:514` | UNION ALL O(N) SQL param growth in `getAccountTransactionCountsRaw` |
| F-07 | `RebuildQueueService.ts:167` | Linear backoff, no jitter |
| F-08 | `insight-service.ts` | Stale `ninetyDaysAgo` closure |
| I-01 | `schema.ts:52` | `journals.status` not indexed — full-table scan on every reactive emission |
| I-02 | `schema.ts:68-73` | Missing composite index `transactions(account_id, transaction_date)` |
| RQ-01 | `RebuildQueueService.ts:149` | 50 concurrent `database.write` calls per batch |

### 🟡 MEDIUM (Fix Within Sprint)

| ID | Location | Summary |
|----|----------|---------|
| F-09 | `PlannedPaymentService.ts:259` | `processDuePayments` not idempotent under concurrent process start |
| F-10 | `ledgerReadService.ts:99` | `queue.shift()` O(N²) BFS in `getAccountTreeIds` |
| F-11 | `AccountRepository.ts:239` | Legacy recursive `getDescendantIds` still reachable |
| F-12 | `JournalRepository.ts:270` | Always soft-deletes + recreates transactions on edit; no tombstone pruning |
| F-13 | `JournalRepository.ts:420` | Reversal transactions written with `runningBalance = 0` |
| F-14 | `sms-service.ts` | Regex compiled per-SMS, not cached |
| I-03 | `schema.ts:190` | `sms_auto_post_rules.is_active` not indexed |
| RQ-02 | `RebuildQueueService.ts:167` | Linear backoff with no jitter (thundering-herd on failure) |

### 🟢 LOW (Post-Launch Hardening)

| ID | Location | Summary |
|----|----------|---------|
| F-15 | `import/orchestrator.ts:122` | `decodeContent` falls back on any error, not just encoding errors |
| F-16 | `ledgerWriteService.ts:21` | `auditService.log` outside the journal write transaction |
| F-17 | `schema.ts` | ~~`journals.planned_payment_id` not indexed~~ — ✅ **RESOLVED** (index exists) |
| F-18 | `TransactionRawRepository.ts:171` | Repeated subquery for `limitTransactionId` in `getAccountSumRaw` |
| RQ-03 | `RebuildQueueService.ts:178` | `retryCounts` Map not pruned on give-up path |

---

## UNRESOLVED QUESTIONS — Phase 4

1. **WatermelonDB composite index support**: Confirm whether `unsafeExecuteSql` migration approach is stable in WatermelonDB 0.28.1 for adding composite indexes.
2. **`AccountingRebuildService` write scope**: Does each `rebuildAccountBalances` call use one `database.write` transaction for all affected rows, or one write per transaction row? If the latter, 50 parallel rebuilds = potentially thousands of micro-transactions.
3. **SQLite `auto_vacuum` setting**: What is the current PRAGMA value? Soft-deleted rows (tombstones) accumulate indefinitely until vacuumed.
4. **React Compiler compatibility**: Is `withObservables` (WatermelonDB RxJS HOC) compatible with React Compiler's auto-memoization? Observable-based HOCs typically rely on mutable closures that the compiler may optimize incorrectly.

## NEXT AREAS — Phase 5 (Final Report)

- [ ] Read `src/services/AccountingRebuildService.ts` write scope (per-row vs per-account transaction)
- [ ] Audit `e2e/` test coverage against critical paths (balance rebuild, planned payments)
- [ ] Final consolidated remediation priority list with effort estimates
- [ ] Ship/no-ship recommendation

---

*End of Phase 4. Append Phase 5 findings below.*

---

## UI AUDIT RUN (2026-03-03) — PHASE 1: CODEBASE INVENTORY

- Phase number: 1
- Directories/files reviewed:
  - `app/` (all route files)
  - `src/features/app/RootLayout.tsx`, `src/features/app/TabsLayout.tsx`, `src/features/app/RootIndexScreen.tsx`
  - `src/contexts/UIContext.tsx`
  - `src/hooks/use-theme.ts`
  - `src/constants/design-tokens.ts`
- UI components reviewed:
  - App shell/layout: `RootLayout`, `AppContent`, `TabsLayout`, `RootIndexScreen`
  - Global overlays: `AlertContainer`, `ToastContainer`, `ErrorBoundary` (referenced from shell)
- Key findings:
  - UI layer is primarily in `src/features/**/{screens,components}`, `src/components/{core,common,layout,charts}`, with route wiring in `app/`.
  - Navigation is Expo Router with one root stack + one tab navigator; most `app/` files are thin wrappers.
  - Styling system is design-token driven (`design-tokens.ts`) plus `StyleSheet` + inline theme objects via `useTheme()`.
  - UI state management is centralized in `UIContext` (theme mode/id/font, onboarding, privacy, advanced mode, restart flow), while feature/domain data is hook/service-driven.
  - Potential UX issue at app boot: `RootLayout` returns `null` until fonts load (blank frame with no fallback/splash handoff).
- Unresolved questions:
  - Whether missing font-load fallback has caused measurable startup blank-screen duration on low-end Android/Web.
  - Whether all screen-level loading/empty/error states are standardized or ad-hoc per feature.
- Next areas to audit:
  - Phase 2 full UI component inventory (all screen + component TSX files and props interfaces).


---

## REMEDIATION SUMMARY (2026-03-03)

**Status:** All Phase 3 high and medium priority implementation fixes completed.

### Addressed Items:
- **F-03:** Refactored `ReactiveDataService.observeMonthlyFlow` to derive from `observeDashboardData`.
- **F-04:** Rewrote `AccountRepository.getAccountListItemsRaw` with `LEFT JOIN`s + `MAX`/`SUM` logic.
- **F-05:** Fixed `getLatestBalancesRaw` N+1 subquery using SQL `ROW_NUMBER()` pattern.
- **F-06:** Replaced `UNION ALL` with a single grouped query in `getAccountTransactionCountsRaw`.
- **F-08:** Made `ninetyDaysAgo` dynamic via RxJS `timer` in `InsightService.observePatternsInternal`.
- **F-09:** Added DB connection check to `processDuePayments` to prevent duplicates across restarts.
- **F-10:** Replaced O(N²) `queue.shift()` with O(N) index pointer in `ledgerReadService.ts` BFS.
- **F-13:** Configured reversal transactions to insert with `running_balance: null` instead of `0`.

### Next Steps:
- Conduct thorough manual verification and regression testing.
- Review Phase 4 missing DB indexes (I-01, I-02, I-03).
