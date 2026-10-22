# Navigation performance fixes — 2026-10-22

Implementation follows the [baseline review](2026-10-22-navigation-review.md). These changes remove established extra work; an A17 speedup has not been measured.

## Changes

- SMS lifecycle refreshes depend on effective review suppression and foreground state. Navigating among unrelated screens no longer schedules notification enumeration. Entering/leaving the inbox, changing the reviewed SMS, locking, and foreground transitions still update suppression and refresh.
- Notification flushes coalesce into a single drain. Requests arriving before a pass share it; requests arriving during a pass request a current-state rerun. A failed pass preserves a refresh received during that pass; failures with no pending refresh still reject and leave delivery retryable.
- Account-detail dashboards are cold, screen-scoped observables instead of permanent keyed replay graphs. Unsubscribing releases their upstream detail subscriptions; workplace-wide base streams remain shared. Re-entry hydrates current balances rather than replaying an indefinitely retained detail result. Screens still mounted underneath another stack route retain their legitimate subscriptions; in-flight native SQL is not cancellable.
- Follow-up correction: the **Accounts bottom tab stays mounted**, so detail unmount cleanup alone does not pause that tab. Its view model now uses route focus to pause the list subscription and 30-day report reads on blur, while retaining search/selection/expansion state and displayed data. The account-list projection is also cold: it stops mapping DTOs and scheduling snapshots when the view unsubscribes. Refocus reconnects to the latest shared aggregate value. Shared aggregate SQL and other tabs' own subscriptions remain active under their existing ownership; this is not a claim that all hidden tabs or all database work now stop.
- Detail period metrics key subscriptions by account-ID membership/order rather than DTO-array identity, preventing restarts when hydration replaces equivalent account metadata.
- Schema **35** installs the four audited composite indexes for account chronology, journal legs, journal-status chronology, and balance snapshots. Fresh setup, explicit index drop/recreation, and the v34→35 migration share definitions. Historical migrations are unchanged. This restores these four audited indexes; it does not blindly recreate every historical index.
- Account-list and scoped latest-balance queries use ordered, per-account latest-transaction-ID subqueries with `LIMIT 1`, followed by a primary-key read. They preserve date/created-at/ID tie order, posted/reversed status, deletion/workplace filters, null/missing-row behavior, and scoped cutoff dates. Month-period aggregation and optional lifetime counts retain their prior semantics. Native calls remain synchronous; the unnecessary full-history ranking was removed.

The fixes are committed locally as separate changes; nothing was pushed or deployed. The schema upgrade runs when a build containing this code opens its database. Index creation has a one-time migration/storage/write-maintenance cost. No device database was modified during this work.

## Verification status

- Formatted edited files with the installed Prettier.
- Ran `bun run typecheck` once. It reported three unresolved-module errors outside the edited files, in `artifacts/playwright-review-kit/test-source/e2e/web/`: missing `nativeKeyApi` and `keyHierarchyRecords` imports. Those artifact files were not changed.
- **Tests not run**, per the user's execution preference. Added regression cases for navigation suppression, burst/failure delivery scheduling, detail teardown/re-entry, fresh/upgrade/index-recreation parity, and actual emitted SQL behavior. Existing migration-version and SQL-argument expectations were updated.
- No A17/release performance measurements or post-change application launch. No measured latency or frame claims.
- The audit's empty-schema query-plan helper is now pinned to the original audit commit so subsequent source changes cannot silently relabel baseline evidence.

## Focused tests to run when requested

From the repository root:

```sh
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath \
  src/hooks/__tests__/useObservable.test.ts \
  src/features/app/hooks/__tests__/useSmsNotificationLifecycle.test.ts \
  src/services/sms/__tests__/SmsReviewDelivery.integration.test.ts \
  src/services/__tests__/ReactiveDataService.accountDetails.test.ts \
  src/features/accounts/hooks/details/__tests__/useAccountDetailsMetrics.test.ts \
  src/data/database/__tests__/ledgerReadIndexes.test.ts \
  src/data/database/__tests__/deviceSmsMigration.test.ts \
  src/data/database/__tests__/plannedPaymentFxMigration.test.ts \
  src/data/repositories/account/__tests__/AccountListMetricsQueries.test.ts \
  src/data/repositories/raw/__tests__/TransactionRawMetricsQueries.test.ts \
  src/data/repositories/raw/__tests__/latestBalanceSql.integration.test.ts
```

The new SQL regression executes the emitted production SQL against synthetic in-memory SQLite, covering equal timestamps, cutoff dates, future posted entries, planned/reversed/deleted journals, deleted legs, malformed cross-workplace links, period-only versus lifetime counts, and empty accounts. It is a correctness check, not a device benchmark.

For performance validation, use the same release build and synthetic dataset on the Samsung A17 after an idle minute. Separate Accounts tab, a new account-detail key, repeated account visits, blank entry, edit/copy, and journal details. Record tap-to-usable-content, query count/duration, notification-pass count, and JS/native stalls. Compare new install and upgrade-to-35. After browsing several accounts and returning, a relevant ledger change must not recalculate departed detail graphs; re-entered account balances must converge correctly.
