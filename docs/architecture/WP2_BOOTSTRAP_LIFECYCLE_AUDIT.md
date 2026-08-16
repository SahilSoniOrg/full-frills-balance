# WP-2 Bootstrap Lifecycle Audit

Audit target: `adf1378f`
Scope: workplace bootstrap hydration and stabilization, including work already started when the active workplace changes
Status: complete for the scoped lifecycle

## Verdict

**Fixable, but the WP-2 exit criterion is not met.** The generation coordinator prevents a stale generation from starting later stages. It does not cancel work that has already crossed into a service. Checks after `Promise.allSettled` suppress stale logging only; they cannot undo cache publication or database mutations performed inside those services.

Required invariant: every workplace-owned asynchronous mutation receives a standard `AbortSignal`, checks it at the last safe point before its commit boundary, and completes mandatory audit/rebuild follow-up if cancellation arrives after commit.

## Call classification

| Bootstrap call | Ownership | Remaining behavior after switch |
| --- | --- | --- |
| `currencyInitService.initialize()` | Global database mutation | May finish; singleton and not workplace-owned |
| `currencyReadService.getAllPrecisions()` | Read-only | May finish; result is discarded |
| `reactiveDataService.preWarm()` | Cache/subscription + snapshot writes | In-flight projections can publish after eviction |
| `safeToSpendReadModel.preWarm()` | Cache/subscription + snapshot write | `firstValueFrom` is not cancelled by map eviction |
| `insightService.preWarm()` | Cache/timer + read analysis | Disposal is correct; in-flight reads may finish without publication |
| `integrityService.runStartupCheck()` | Workplace database mutation + audit | Can repair the departed workplace and suppress the new workplace's check |
| `plannedPaymentService.processDuePayments()` | Workplace database mutation | Can create journals and advance schedules after switch |
| `sharingService.init()` | Global filesystem mutation | May finish; not workplace-owned |
| `exchangeRateService.preWarmCache()` | Global cache/network/database | May finish; data is global |
| `notificationService.scheduleReminder()` | Global OS side effect | Internally generation-ordered |
| `smsService.processUnprocessedSms()` | Workplace database + MMKV + rebuild queue | Can import and auto-post after switch |

## Confirmed failure paths

### Startup integrity

`runStartupCheck(A)` claims a global schema marker before verification finishes. If the app switches to B, B can skip its check while A continues into `AccountingRebuildService` and commits transaction, snapshot, account, and audit changes. Cancellation must be checked before claiming/completing the marker, before each repair, and immediately before the rebuild batch. A committed repair must still complete its audit obligation.

### Planned-payment processing

After loading A's payments, processing can continue through duplicate detection, journal creation, status changes, and next-occurrence updates. A hook-level check before the service call is insufficient because journal preparation itself awaits. Cancellation must reach the ledger write callback and be checked immediately before `database.batch`. Once an occurrence commits, its required schedule follow-up must finish before stopping.

### SMS ingestion

An A scan can finish native reads and analysis after a switch, enter its final transaction, create journal/inbox/audit rows, update processed-message storage, and enqueue rebuilds. Check before entering the write and after final scoped rereads. If the batch commits, MMKV and rebuild obligations must still complete.

### Reactive snapshot publication

Unsubscribing an RxJS `switchMap` cannot stop its underlying Promise. Dashboard, account-list, wealth, and safe-to-spend snapshot writes currently happen inside those Promises before emission, so eviction does not suppress publication. Move persistence into downstream `tap` operations, where unsubscription prevents it.

## Delivery slices

1. **AbortSignal foundation and cache publication**
   - Add `signal` to the latest-generation lease; beginning a generation aborts the previous lease.
   - Relocate reactive snapshot writes so unsubscribe/abort prevents stale publication.
   - Prove a delayed A projection cannot write after B starts.
2. **Integrity cancellation and completion marker**
   - Pass `AbortSignal` into startup integrity and accounting rebuild.
   - Make the decision read-only and completion marker workplace-aware.
   - Mark completion only after a successful non-aborted check.
3. **Planned-payment mutation boundary**
   - Pass cancellation through orchestration and journal creation to the ledger batch boundary.
   - Stop between occurrences, but finish post-commit schedule obligations.
4. **SMS final-write cancellation**
   - Pass cancellation into the scan pipeline and final transaction.
   - Stop before commit; finish processed-ID and rebuild obligations after commit.

Slices 2–4 depend on the AbortSignal foundation and can then proceed independently in integrity, planned-payment, and SMS file scopes.
