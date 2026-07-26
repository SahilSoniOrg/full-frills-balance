# Account and transaction repository intent inventory (commit 22)

> **Status:** `AccountRepository` and `TransactionRepository` remain the persistence gateways for their aggregates. Feature hooks should prefer **`accountQueries`** (reads) and **account command modules** (writes) per ADR-0008. Journal timeline reads use **`journalTimelineModule`**; transaction writes flow through **ledger/journal** services, not feature hooks.

## AccountRepository — intent clusters

| Intent | Representative methods | Primary callers | Preferred surface |
| --- | --- | --- | --- |
| Observe chart of accounts | `observeAll`, `observeHierarchy`, `observeByType`, `observeByIds`, `observeById` | Legacy feature hooks (migrating to `accountQueries`) | `accountQueries` curated API |
| Balance / ledger reads | `observeTransactionsForBalance`, `findByIdRaw` | Balance services, account details | Services only |
| Point reads | `find`, `findWithDeleted`, `findAll`, `findByType`, `findByName` | Commands, import, reports (`report-service` income/expense accounts) | Commands + `accountQueries.findAll` |
| Metadata | `findMetadata`, `findMetadataByAccountIds`, `observeMetadata` | Account form/details, metadata patches | Services / repositories via account commands |
| Mutations | `create`, `update`, `delete`, `recover`, order/hierarchy fields | **Must not** be called from feature hooks | `accountCommands`, `accountHierarchyCommands`, `accountDeleteCommands`, etc. |
| System / onboarding | `create` via name lookup | `accountSystemAccounts` | `getOpeningBalancesAccountId`, `findOrCreateBalanceCorrectionAccount` |

**Migration note:** Five feature hooks were on `AccountRepository` observes; they now use `accountQueries` (`useAccounts`, account form, budget edit, audit, reports).

## TransactionRepository — intent clusters

| Intent | Representative methods | Primary callers | Preferred surface |
| --- | --- | --- | --- |
| Write lifecycle | `create`, `update`, `delete` | `ledgerWriteService`, journal write path | Journal/ledger services only |
| Journal-scoped reads | `findByJournal`, `findByJournals`, `observeByJournal`, `observeByJournals` | Journal enrichment, transaction details | `journalTimelineModule` + ledger services |
| Account-scoped reads | `findByAccount`, `observeByAccounts`, `findByAccountsAndDateRange` | Reports, account ledger, simulations | Services (`report-service`, balance) |
| Inbox / activity | `observeByDateRange`, `observeActiveCount`, `observeByDateRangeWithColumns` | Dashboard, audit, reactive aggregates | Service-layer observables |
| Integrity / counts | `hasTransactions`, `getCountForAccount`, `findLatestForAccount*` | Account delete rules, reconciliation | `accountRules`, commands |

**No façade deletion planned:** Unlike `JournalRepository`, account and transaction repos are single-aggregate stores. The remediation goal is **narrow feature access** (queries + commands), not splitting the repository file unless a second aggregate boundary appears.

## Verification

- Feature hooks: `rg 'accountRepository' src/features/**/hooks` should trend toward zero (reads via `accountQueries`).
- Mutations: ESLint `no-restricted-syntax` on feature hooks blocks repository `create`/`update`/`delete`.
