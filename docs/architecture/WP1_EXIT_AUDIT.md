# WP-1 Workplace Isolation Exit Audit

Audit target: `adf1378f` (historical). Later WP-1L–WP-1R commits closed the open rows below.
Coverage: 12/12 workplace-owned tables; 83/83 production persistence/access candidates; raw SQL and ORM fallbacks; 11 major call flows
Status: historical exit rejection; **superseded**. Roadmap WP-1 is complete. `unscoped_raw_query` ratchet is 0.

## Current applicability (2026-08-19)

The “Open” statuses below were true at `adf1378f`. They are **not** current:

| Finding | Then | Now |
| --- | --- | --- |
| Journal save SMS metadata | P0 Open | Closed: `resolveSmsMetadataJson` rejects `inboxRecord.workplaceId !== workplaceId`; create path uses `transactionInboxRepository.find(workplaceId, id)` |
| Transaction raw metric joins | P1 | Fixed by `5edf606a` |
| Budget usage unscoped relations | P1 Open | Closed: `observeBudgetUsage(workplaceId, budgetId, …)` asserts budget and scope-account workplace |
| Account-resolution follow-ups | P1 Open | Closed: history/Bayes queries predicate `workplace_id` |
| Common ORM join scope | P1 Open | Closed in WP-1O |
| Balance snapshot join/fallback | P1 Open | Closed in WP-1P |
| Model-writer provenance | P2 Open | Hardened in WP-1Q |
| Generic `queryRaw` executor | P2 Open | Still a typed seam (`RawSqlAdapter` / transaction raw queries). Call SQL is ratcheted to include `workplace_id` |
| Optional integrity workplace | P2 Open | Closed: `scanForNullAccountTransactions(workplaceId: WorkplaceId)` |

## Verdict at audit target

**WP-1 was not complete at `adf1378f`.** That snapshot missed persistence paths. Do not treat the narrative below as a live finding list.

## Open failure paths

### Journal save SMS metadata

`journalSaveHelpers.resolveSmsMetadataJson` finds `transaction_inbox_records` by `smsRecordId` without workplace validation. A stale or crafted A record ID used while B is active can copy A's fingerprint, amount, currency, merchant, reference, and account-source metadata into B's new journal.

### Budget usage

`budgetReadService` observes a supplied budget model without asserting ownership, dereferences scope accounts without validating workplace, and reads transactions without independently scoping transaction and joined journal rows. A foreign model or malformed relation can contaminate budget and safe-to-spend projections.

### Account resolution

`AccountResolutionService` begins from scoped journals but performs unscoped transaction follow-ups and an unscoped account lookup. Malformed foreign rows can affect deterministic history or return a foreign category account from Bayes classification.

### Common ORM joins

`TransactionRepository.buildActiveClauses`, `findForAccountUpToDate`, `JournalObserveQueries`, and the journal timeline account filter omit workplace predicates on joined owned tables. Root-row scoping does not protect against imported or corrupt cross-workplace links.

### Balance snapshots

`BalanceSnapshotRepository` scopes snapshots but not the joined transaction. Raw-unavailable environments return an empty map instead of an equivalent scoped ORM result, changing cursor and balance behavior by adapter capability.

### Model mutation contracts

Account, transaction, and SMS preparation/update APIs accept supplied models or payload workplace IDs without enforcing agreement with the caller's workplace. Current callers are usually scoped, but the public persistence contracts remain unsafe.

### Generic raw execution

`TransactionRawRepository.queryRaw` and `TransactionRawMetricsQueries.queryRaw` expose arbitrary SQL through transaction-specific APIs. Move execution to one named database-infrastructure seam and leave transaction repositories with typed workplace-requiring operations.

### Optional integrity scan scope

`scanForNullAccountTransactions(workplaceId?)` has no production global/admin caller. Make workplace mandatory; use a separately named administrative operation if global diagnostics are ever required.

## Valid exclusions

Factory reset, explicit global synchronized-record cleanup, workplace purge, staging swap, and import assignment are administrative operations with explicit ownership. Schema migrations, test harnesses, and Cashew's external SQLite database are outside runtime workplace reads.

## Exit requirement

At `adf1378f` this was not met. Subsequent WP-1L–WP-1R work and a zero `unscoped_raw_query` ratchet are the current exit. Passing architecture ratchets remains necessary; this file is not a live punch list.
