# Journal — spine map

**Hop count (create/save → delete → activity list)**  
- **before:** 22 files · 2026-08-03 · `325fde10`  
- **after (J2 write gateway):** 22 files · dual save seam collapsed (editors → `useJournalActions`); unique file set unchanged  
- **Entry files for the timed tour:** `useJournalEditor.ts`, `useJournalActions.ts`, `useJournalListViewModel.ts`  

### Before tour (files opened)

**Create / save (guided → editor → actions → domain → ledger)**  
1. `src/features/journal/entry/hooks/useJournalEditor.ts`  
2. `src/features/journal/entry/hooks/useSimpleJournalEditor.ts`  
3. `src/features/journal/hooks/useJournalActions.ts`  
4. `src/services/journal/journalDomainService.ts`  
5. `src/services/journal/journalSaveHelpers.ts`  
6. `src/services/ledger/prepareJournalData.ts`  
7. `src/services/accounts/accountReferenceGraph.ts`  
8. `src/services/ledger/ledgerWriteService.ts`  
9. `src/data/repositories/journal/journalWriteRepository.ts`  
10. `src/data/models/Journal.ts`  
11. `src/data/repositories/TransactionRepository.ts`  
12. `src/data/repositories/AuditRepository.ts`  

**Delete**  
13. `src/features/journal/hooks/useTransactionDetailsActions.ts`  
(+ `useJournalActions` / domain / ledger / write repo / audit already counted)

**Activity list**  
14. `src/features/journal/hooks/useJournalListViewModel.ts`  
15. `src/features/journal/list/hooks/useJournalTransactionList.ts`  
16. `src/features/journal/hooks/useJournals.ts`  
17. `src/services/journal/journalEnrichedObserver.ts`  
18. `src/data/repositories/journal/journalTimelineModule.ts`  
19. `src/data/repositories/journal/JournalEnrichmentQueries.ts`  
20. `src/services/accounting/journalPresenter.ts`  
21. `src/features/journal/list/hooks/journalDayNetGrouping.ts`  
22. `src/adapters/transactionCardAdapter.ts`  

*(Screen shell `useJournalEntryShell` wires the editor but does not write — not counted.)*

---

## What a Journal is

A **Journal** is the accounting unit: a group of **Transactions** (legs) that must sum to zero.  
Statuses: `DRAFT`, `POSTED`, `REVERSED`, `PLANNED`, `SKIPPED`, `PAUSED`. Only `POSTED` / `REVERSED` affect balances (`ACTIVE_JOURNAL_STATUSES`).  
See [CONTEXT.md](../CONTEXT.md) (guided vs advanced entry) and [PROJECT_BIBLE.md](../PROJECT_BIBLE.md).

**Workplace** scopes nearly every query. Assume workplace-scoped until proven otherwise.

**Transfers** are journal display/entry semantics (`displayType` / entry type), not a separate feature folder.

## Start here (≤6 layers)

| Layer | Home | Job |
|-------|------|-----|
| 1. Map | `docs/JOURNAL.md` (this file) | Onboarding |
| 2. Feature writes | `useJournalActions` → `journalService` | **All feature mutations** (save, bulk, delete, post, …) |
| 3. Domain orchestration | `journalDomainService` (`journalService`) + `journalSaveHelpers` | Assemble/validate entry, duplicate, bulk prepare |
| 4. Canonical write | `ledgerWriteService` (+ `prepareJournalData`) | Persist + audit + rebuild enqueue |
| 5. Write / timeline repos | `journalWriteModule` · `journalTimelineModule` | Persist vs list/observe/enrich |
| 6. Activity reads | `useJournalListViewModel` → `useJournals` → `journalEnrichedObserver` | How journals appear on Activity |

Also linked: `accountReferenceGraph` (leg account asserts), SMS/planned-payment writers that call `ledgerWriteService` directly (not via feature hooks).

## Write path

```
Feature UI (editors + details):
  useJournalEditor | useBulkJournalEditor | useTransactionDetailsActions
    → useJournalActions
      → journalService (saveJournalEntry / saveBulk / delete / post / …)
        → journalSaveHelpers / prepareJournalData (when assembling)
        → ledgerWriteService
          → journalWriteRepository + audit + rebuild queue
```

**Single feature write gateway:** all journal feature mutations go through `useJournalActions`. Non-UI writers (account opening balance / adjust, planned payments, SMS sync) still call `ledgerWriteService` directly — intentional.

**Do not** call `journalService` or journal write repositories from feature hooks for mutations (prefer `useJournalActions`).  
**Do not** invent a second façade beside `journalDomainService` / `ledgerWriteService`.

## Read path

| Need | Module |
|------|--------|
| Activity list (paginated enriched) | `useJournals` → `journalEnrichedObserver` → timeline + enrichment queries |
| List VM / day grouping / cards | `useJournalListViewModel` → `useJournalTransactionList` → presenter + adapters |
| Single journal by id | `journalQueryRepository` / observe queries (via hooks or actions `findJournal`) |
| Account-scoped ledger feed | journal observe-by-account (account details transaction feed) |

## Repo intent map (short)

| Module | Owns |
|--------|------|
| `journalWriteModule` / `journalWriteRepository` | Create/update/delete/reversal persistence |
| `journalTimelineModule` | Barrel: by-id, list, observe, enrichment + `journalsQuery` |
| `journalQueryRepository` | Single-id find |
| `journalListQueryRepository` | Non–single-id list/count |
| `JournalObserveQueries` | Reactive observe streams |
| `JournalEnrichmentQueries` | Enrichment SQL + description suggestions |
| `journalMetadata*` | Metadata (SMS/import blob) |
| `journalSms*` / `SmsJournalQueries` | SMS dedup / fingerprints |
| `journalPlanned*` | Planned-payment occurrence helpers |

Detail: [JOURNAL_REPOSITORY_INTENT_INVENTORY.md](JOURNAL_REPOSITORY_INTENT_INVENTORY.md).

## Related docs

| Doc | Role |
|-----|------|
| [CONTEXT.md](../CONTEXT.md) | Guided vs advanced entry glossary |
| [ACCOUNTS.md](ACCOUNTS.md) | Account legs / reference graph |
| [SIMPLIFICATION_PLAYBOOK.md](SIMPLIFICATION_PLAYBOOK.md) | Lane method |
| [JOURNAL_REPOSITORY_INTENT_INVENTORY.md](JOURNAL_REPOSITORY_INTENT_INVENTORY.md) | Repo carve detail |
| [PROJECT_BIBLE.md](../PROJECT_BIBLE.md) | System overview + invariants |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layer map |
| ADR-0002 | Balance cache / rebuild after writes |
