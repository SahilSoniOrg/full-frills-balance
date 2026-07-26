# JournalRepository intent inventory (commit 16)

> **Status (commits 17–21 complete):** the broad `src/data/repositories/JournalRepository.ts` façade has been **deleted**. Callers now import by intent from `src/data/repositories/journal/`: `journalTimelineModule`, `journalWriteModule`, `journalPlannedModule`, `journalSmsModule`, `journalMetadataModule`. `scripts/check-journal-repository-facade.mjs` guards against the façade returning.

Historical inventory (public façade had ~39 methods). Internal intent modules live under `src/data/repositories/journal/`.

| Intent | Module | Façade methods (representative) | Primary callers |
| --- | --- | --- | --- |
| Timeline / list / by-id read | `journalQueryRepository`, `journalListQueryRepository`, `JournalObserveQueries`, `JournalEnrichmentQueries` | `find`, `findByIds`, `observeById`, `observeAccountTransactions`, `getEnrichmentDataRaw`, `journalsQuery` | `useJournal`, `useJournalActions`, `journalEnrichedObserver`, `TransactionService`, inbox VM |
| Write / reversal | `journalWriteRepository` | `prepareCreate`, `createJournalWithTransactions`, `update`, `delete`, reversal helpers | `ledgerWriteService`, `journalDomainService` |
| Planned journals | `JournalPlannedQueries` | `findByPlannedPayment*`, `batchUpdatePlannedStatus`, `preparePlannedStatusUpdates` | `plannedPaymentOrchestration`, `plannedPaymentLifecycle` |
| SMS deduplication | `SmsJournalQueries` | SMS id / fingerprint / nearby lookups | `SmsSyncPipeline`, ingestion (some direct `smsJournalQueries` imports) |
| Metadata | `journalMetadataRepository` | `findMetadataByJournalId`, `patchMetadata`, `prepareMetadataPatch` | `useTransactionDetailsViewModel`, `ledgerWriteService` |

**Migration order (done):** (17) write → (18) timeline → (19) planned + SMS → (20) metadata → (21) façade deleted once all imports were zero.

**Feature layer:** No production feature hook calls journal write methods; reads use `observe*` / `find` / metadata observe.
