# Journal write-boundary cutover plan

Status: Production journal writes cut over to the persistence boundary; restore/import remains separately validated

Date: 2026-09-23

Decision authority: [ADR 0007](../adr/0007-journal-currency-and-balancing-decision-layer.md). Currency calculation and editor rollout remain in the [journal currency consistency plan](journal-currency-unification-plan.md).

## Goal

Move every ordinary journal write behind one persistence boundary. The boundary owns the final posted-balance check and performs that check against the state it saves, in the same database writer transaction. Build the layers in order, then move production paths one at a time with a test gate for each path.

There is no schema change, data migration, or rewrite of saved journals. Production create/edit/post, bulk, lifecycle, account, planned-payment, SMS, merge, and restore paths now use the persistence boundary or its typed accounting session. The guarantee is complete for application journal writers.

## Invariants

- `put` creates or updates a journal. It resolves the effective status from the payload and, for updates with no status, the journal currently stored. If that status is `POSTED`, lines must value to exactly equal debit and credit totals in journal-currency minor units.
- `post` is the planned-to-posted transition. It reloads the current journal and lines, validates them, then saves the status/date change and posting metadata in the same write.
- Non-posted journals may be out of balance. They still need valid accounts, positive supported-precision amounts, valid line types, and any required foreign-currency rates.
- Account currency and saved journal currency are read from persisted rows. An update cannot change a saved journal's currency.
- No application caller constructs or persists journal/transaction models for financial mutations. No caller receives a journal `Model[]` builder that can skip validation.
- Audit rows commit with the journal mutation. Rebuild work is queued only after the database write succeeds.
- Bulk and cross-domain workflows remain atomic. A failed journal validation commits none of their accompanying writes.
- Native restore/import remains lossless and separate from ordinary `put`/`post`; it preflights posted balances and rejects invalid snapshots before creating the destination workplace. It never silently rewrites imported history.

## Current state and gap

`JournalPersistenceRepository` owns plain-data put/post, reversal, merge, reassignment, single and bulk delete/restore, recovery, revert-to-planned, and non-posted planned-status operations. Posted balance checks run inside the writer that saves the change. Audit rows commit with the mutation; rebuild work is queued after commit. `AccountingWriteSession` composes journal writes with account, planned-payment, and inbox changes without exposing model-operation arrays.

Production create/edit/post, duplication, manual bulk creation, reversal, opening-balance creation, balance adjustments, planned-payment occurrence/status flows, account and journal merge, account reassignment/undo, SMS auto-post, SMS-linked manual create, single delete/recovery, bulk delete/undo, and revert-to-planned use the boundary. Restore import keeps its dedicated normalization writer but preflights active posted journals before workplace creation. Description-only bulk rename remains an explicit maintenance command.

`LedgerCreateService`, `LedgerUpdateService`, and `LedgerLifecycleService` are compatibility façades that delegate to the persistence service; they no longer prepare or persist journal models. `journalWriteModule` exports types only. The architecture guard rejects production imports of those legacy services and the legacy writer, except the description-only rename command. The old low-level repository remains for test fixtures only.

## Layered implementation order

### Layer 1 — Single-journal persistence contract

**State:** Single-journal `put`/`post`, atomic `putMany`, exact posted-balance enforcement, atomic audit writes, persisted before/after rebuild scope, and core tests implemented. Typed composition remains a gate for cross-domain caller groups.

The base contract needed by the ordinary single-journal path is in place:

- `put` and `post` validate and write the journal, lines, metadata, and audit in one database writer transaction.
- `putMany` validates every item and batches all journal, line, metadata, and audit writes together; an invalid item rejects the batch.
- Repository results report persisted status, previous status, affected account IDs, and earliest affected date. The service queues rebuilds only after the write succeeds.
- Keep running-balance fields as rebuildable cache data. The service may provide prepared cache values, and it queues a rebuild after successful persistence.
- `AccountingWriteSession` provides the typed composition seam: repositories stage account creation, validated plain-data journal writes, and planned-payment updates; callers cannot access the collected model operations. Repositories defer model-operation preparation until the callback has succeeded, then prepare and batch synchronously. Reuse or extend the session only for concrete composite workflows.
- Restore/import preflight validates the normalized rows before creating destination data; single and bulk recovery validate the exact rows they reactivate.

**Exit for single-journal writes:** tests prove validation uses persisted status/accounts and failure leaves journal, transactions, metadata, and audit unchanged. Inputs are plain data, never model arrays. Composite workflows have separate exit gates in their caller layers.

### Layer 2 — Application write service

Create a new service above the persistence repository. It owns use-case preparation and orchestration; it does not own the final balance invariant.

- Resolve saved journal currency and effective status for edits before preparing derived fields.
- Prepare/round line data and display information, preserving the saved currency on edits.
- Call repository `put` or `post`; allow the repository to repeat the decisive balance validation against current persisted state.
- Let the repository derive and commit audit from the persisted before/after state; let the service enqueue the repository-reported rebuild scope only after success.
- Return typed outcomes/errors that the UI and import paths can map without swallowing the balance difference.

Do not make the new service a wrapper around `LedgerCreateService` or `LedgerUpdateService`. Shared journal preparation lives in the journal application layer.

**State:** The service is used for all production journal write paths. Integration coverage verifies persistence, saved-currency preservation, audit/metadata writes, and repository error propagation. Rebuild scope comes from the actual persisted before/after state. Shared preparation is located in the journal application layer; rebuilds are enqueued only after repository/session success.

### Layer 3 — Standard journal editor

**State:** Complete for ordinary create, edit, manual planned-to-posted, and SMS-linked manual create. Journal persistence and inbox linking share one accounting write session.

Move the central manual path first:

1. Create from `JournalService.createJournal` to new service `put`.
2. Edit from `JournalService.updateJournal` to new service `put`.
3. Planned-to-posted from `JournalService.postJournal` to new service `post`.
4. Keep editor-side checks for immediate feedback, but prove they cannot replace repository validation.

**Exit:** integration tests prove create/edit/post persist through the new repository, exact posted imbalance is rejected at the repository boundary, and audit/rebuild effects preserve current behavior.

### Layer 4 — Ordinary creators and batches

Migrate one caller group at a time, with an integration test before removing its old route:

**Completed:** Single and bulk duplication, manual bulk creation, and reversal now use the persistence service. Multi-journal writes commit through one `putMany` batch.

1. **Complete:** Account opening-balance journals and balance adjustments use the typed session. Adjustment tests cover stale balance caches, concurrent requests, and validation failure atomicity.
2. **Complete:** Planned-payment occurrence generation, manual posting/skipping, pause/resume, and deletion use the typed session. Tests cover one-batch persistence, duplicate occurrence protection, schedule advancement, rejection of an unbalanced occurrence without posting or advancing, and atomic deletion of the schedule plus its unposted journals.
3. **Complete:** Journal merge reloads current source rows, preserves each line's native amount and exchange rate, validates the merged posted journal, and commits the new journal, source soft-deletes, and metadata/inbox retargeting in one accounting write session. The preview totals converted journal-currency values, matching repository validation.

Use `put` for create/update values and `post` for transitions to `POSTED`. A side effect that must be atomic belongs in a typed repository composition operation; do not split it into a second write to avoid nesting writers.

**Exit per group:** its tests prove persistence, audit/workflow effects, and failure atomicity. No caller in the migrated group imports the legacy journal write API.

### Layer 5 — Other mutations that can affect posted accounting

**Complete:** Account merge retargets transaction lines through `JournalPersistenceRepository`, revalidates every affected posted journal against the resulting account references, and batches transaction changes, account soft-delete, dependent-reference rewrites, and audit in one typed accounting session. Failed posted-balance validation leaves the entire merge untouched.

**Complete:** Ordinary account reassignment and undo now reread affected lines in the accounting write session, validate the resulting journals, then update transaction accounts, clear stale running balances, update display types, and enqueue rebuilds after commit. Planned-payment deletion stages its schedule soft-delete with only currently unposted journal cascades. Recovery validates the rows that would be restored and batches undeletes with the recovery audit; an invalid posted journal remains deleted.

Single and bulk delete/restore now use the same repository boundary. Restore validates the exact rows that will become active. Single recovery does not revive superseded transaction versions from earlier edits. Revert-to-planned reloads status, metadata, lines, and linked planned-payment state in the writer. The generic planned-status helper accepts only `PLANNED`, `PAUSED`, and `SKIPPED` and rejects `POSTED` at runtime.

**Exit:** each mutation validates the resulting posted journal inside the same write. There is no service-level pre-check followed by an unguarded writer.

### Layer 6 — SMS and restore boundaries

**Complete:** SMS auto-post passes plain journal input through `JournalPersistenceService` inside the same accounting session as the inbox upsert. Manual SMS-linked create stages the journal and inbox link in one session. Journal, transaction lines, metadata, audit, and inbox status/link commit together; validation failure leaves the inbox unchanged, and rescanning an already-posted SMS does not duplicate the journal.

**Complete:** New-workplace restore evaluates every active posted journal after import normalization and before creating the workplace or any snapshot rows. Invalid posted entries report the journal ID and balance issue; planned journals may remain unbalanced. The restore writer still owns import-specific normalization and running-balance reconstruction.

**Exit:** integration and repository tests cover SMS auto-post idempotency, restore atomicity on an invalid posted journal, and allowance for unbalanced planned journals.

### Layer 7 — Close bypasses and retire old plumbing

**Complete for production routes:** legacy create/update/lifecycle services now delegate to the persistence service. The type-only `journalWriteModule` no longer exports the repository object. A new architecture check rejects production imports and calls to legacy financial writers; its sole legacy repository exception is the description-only rename command. Planned-state helpers cannot post. Older low-level model builders remain referenced by test fixtures only and are not exposed through the production façade.

**Exit:** production writers are classified and cut over; deliberate legacy-write fixtures fail the new architecture check; focused integration tests and typecheck pass.

## Verification matrix

- Balanced posted create succeeds; unbalanced posted create fails without rows.
- Posted edit with omitted status uses persisted `POSTED`; unbalanced edit leaves old journal and lines unchanged.
- Planned/draft imbalance can be saved; posting it fails with no date/status/metadata change.
- Balanced planned journal posts atomically, preserving original planned date metadata.
- Foreign-currency lines use persisted account currency and supported precision; missing/invalid rates fail; rate `1` remains valid when supplied.
- Batch with one invalid posted journal commits no journal, audit, inbox, or schedule records.
- Account opening, planned occurrences, reversal, merge, reassignment/undo, restore, and SMS preserve their current atomic side effects.
- Balance adjustment uses authoritative ledger sums inside the writer; concurrent requests do not both apply a stale discrepancy, and a rejected journal leaves no correction account.
- Restore preflight rejects invalid posted rows without modifying the destination Workplace.
- A source scan/architecture guard catches direct journal/transaction model writes outside approved repository and restore boundaries.

## Completion criteria

The production cutover is complete: every application create, edit, post, bulk, lifecycle, and posted-account mutation reaches the new repository; SMS and restore have explicit tested policies; audit and workflow atomicity are preserved; and the architecture guard rejects legacy production write paths. Saved local history is not migrated or silently rewritten.
