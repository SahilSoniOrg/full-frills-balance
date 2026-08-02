# Journal — spine map

**Hop count (create/save → delete → activity list)**  
- **before:** 22 files · 2026-08-03 · `325fde10`  
- **after:** _(pending lane collapses)_  
- **Entry files for the timed tour:** `useJournalEditor.ts`, `useJournalActions.ts`, `useJournalListViewModel.ts`

### Before tour (files opened)

**Create / save (guided → editor → domain → ledger)**  
1. `src/features/journal/entry/hooks/useJournalEditor.ts`  
2. `src/features/journal/entry/hooks/useSimpleJournalEditor.ts`  
3. `src/services/journal/journalDomainService.ts`  
4. `src/services/journal/journalSaveHelpers.ts`  
5. `src/services/ledger/prepareJournalData.ts`  
6. `src/services/accounts/accountReferenceGraph.ts`  
7. `src/services/ledger/ledgerWriteService.ts`  
8. `src/data/repositories/journal/journalWriteRepository.ts`  
9. `src/data/models/Journal.ts`  
10. `src/data/repositories/TransactionRepository.ts`  
11. `src/data/repositories/AuditRepository.ts`  

**Delete**  
12. `src/features/journal/hooks/useTransactionDetailsActions.ts`  
13. `src/features/journal/hooks/useJournalActions.ts`  
(+ domain service, ledger write, write repo, audit already counted)

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
| 2. Editor save | `useJournalEditor` → `journalService.saveJournalEntry` (+ `useBulkJournalEditor` for bulk) | **UI create/update** |
| 3. App mutations | `useJournalActions` → `journalService` | Delete / recover / duplicate / post / revert |
| 4. Canonical write | `ledgerWriteService` (+ `prepareJournalData`, `journalSaveHelpers`) | Persist + audit + rebuild enqueue |
| 5. Write / timeline repos | `journalWriteModule` · `journalTimelineModule` | Persist vs list/observe/enrich |
| 6. Activity reads | `useJournalListViewModel` → `useJournals` → `journalEnrichedObserver` | How journals appear on Activity |

Also linked: `accountReferenceGraph` (leg account asserts), SMS/planned-payment writers that call `ledgerWriteService` directly (not via feature hooks).

## Write path

```
Editor / bulk:
  useJournalEditor | useBulkJournalEditor
    → journalService.saveJournalEntry | saveBulkJournalEntries
      → journalSaveHelpers / prepareJournalData
      → ledgerWriteService
        → journalWriteRepository + audit + rebuild queue

Details lifecycle:
  useTransactionDetailsActions → useJournalActions
    → journalService.delete|duplicate|post|revert|…
      → ledgerWriteService (same spine)
```

**Known dual seam (lane follow-up):** editors call `journalService` directly; `useJournalActions` is unused for save. Prefer one feature write gateway in a later PR (mirror accounts `useAccountActions`).

**Also write journals without the feature hooks:** account opening balance / adjust (`accountCommands`, `accountAdjustCommands`), planned payments, SMS sync pipeline — all go through `ledgerWriteService` (or prepared batch). That is intentional for non-UI writers.

**Do not** call journal write repositories from feature hooks for mutations (lint-enforced).  
**Do not** invent a second `JournalService` façade beside `journalDomainService` / `ledgerWriteService`.

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
