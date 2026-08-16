# WP-1 Workplace Isolation Exit Audit

Audit target: `adf1378f`
Coverage: 12/12 workplace-owned tables; 83/83 production persistence/access candidates; raw SQL and ORM fallbacks; 11 major call flows
Status: complete static audit; exit rejected

## Verdict

**WP-1 is not complete.** The original audit closed its listed findings, but it did not cover every persistence path. This exit audit found one direct cross-workplace read and additional malformed-link, fallback-parity, mutation-contract, and generic-executor defects.

The target predates several fixes now on `main`. Current applicability is recorded below so this report remains useful without pretending old line-level findings are current.

| Finding | Severity | Current status |
| --- | --- | --- |
| Journal save reads an SMS inbox record globally by route ID | P0 | Open |
| Three `TransactionRawRepository` metric joins/fallbacks | P1 | Fixed by `5edf606a` |
| Budget usage trusts a supplied model and unscoped relations | P1 | Open |
| Account-resolution follow-up transaction/account reads | P1 | Open |
| Common transaction/journal ORM joins scope only the root row | P1 | Open |
| Balance snapshot join and fallback are not equivalent | P1 | Open |
| Public account/transaction/SMS model writers trust provenance | P2 | Open; journal writers fixed by `faa4a91c` |
| Generic raw SQL remains exposed by transaction repositories | P2 | Open |
| Integrity scan accepts an optional workplace boundary | P2 | Open |

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

WP-1 can exit only after every open row above has focused malformed-link or two-workplace coverage and a repeat 12-table audit finds no unscoped operation. Passing architecture ratchets and the full test suite is necessary but not sufficient.
